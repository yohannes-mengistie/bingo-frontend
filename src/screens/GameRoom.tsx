import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { FullSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { BingoCardView } from "@/components/bingo/BingoCard";
import { BallCallout } from "@/components/bingo/BallCallout";
import { CountdownRing } from "@/components/bingo/CountdownRing";
import { ResultOverlay, GameResult, WinnerInfo } from "@/components/bingo/ResultOverlay";
import { GameSocket } from "@/lib/ws";
import { claimPositions, findWinningPositions, letterForNumber } from "@/lib/bingo";
import { api, ApiError } from "@/lib/api";
import { sound } from "@/lib/audio";
import { haptic } from "@/lib/telegram";
import { money } from "@/lib/format";
import { COUNTDOWN_SECONDS } from "@/lib/constants";
import { useAuth } from "@/store/authStore";
import { useWallet } from "@/store/walletStore";
import { useSettings } from "@/store/settingsStore";
import type { BingoCard, GameState, WsMessage } from "@/types/api";

interface Feed {
  on(l: (m: WsMessage) => void): () => void;
  onStatus(l: (s: "connecting" | "open" | "closed") => void): () => void;
  connect(): void;
  close(): void;
}

export function GameRoom() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { gameId = "" } = useParams<{ gameId: string }>();
  const location = useLocation();
  const myId = useAuth((s) => s.user?.id);
  const refreshWallet = useWallet((s) => s.refresh);
  const { soundEnabled, hapticsEnabled } = useSettings();
  const push = useToast((s) => s.push);

  const stateCardId = (location.state as { cardId?: number } | null)?.cardId;

  const [card, setCard] = useState<BingoCard | null>(null);
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [order, setOrder] = useState<number[]>([]); // draw order, for the recent-calls strip
  const [last, setLast] = useState<number | null>(null);
  const [daubed, setDaubed] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<GameState>("WAITING");
  const [seconds, setSeconds] = useState(0);
  const [players, setPlayers] = useState(0);
  const [prize, setPrize] = useState(0);
  const [conn, setConn] = useState<"connecting" | "open" | "closed">("connecting");
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<GameResult>(null);
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null);

  sound.enabled = soundEnabled;

  const winLine = useMemo(() => findWinningPositions(daubed), [daubed]);
  const canClaim = !!winLine && phase === "DRAWING" && !result;

  // Resolve which card is ours (from nav state, else from the server).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cardId = stateCardId;
      if (!cardId) {
        try {
          const { player } = await api.myPlayerInGame(gameId);
          cardId = player?.card_id;
        } catch {
          /* ignore */
        }
      }
      if (!cardId) return;
      try {
        const { card } = await api.card(cardId);
        if (!cancelled) setCard(card);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, stateCardId]);

  const handleMessage = useCallback(
    (msg: WsMessage) => {
      switch (msg.event) {
        case "INITIAL_STATE": {
          const d = msg.data;
          if (d.game?.state) setPhase(d.game.state);
          if (typeof d.game?.prize_pool === "number") setPrize(d.game.prize_pool);
          if (typeof d.playerCount === "number") setPlayers(d.playerCount);
          else if (typeof d.game?.player_count === "number") setPlayers(d.game.player_count);
          if (typeof d.secondsLeft === "number") setSeconds(d.secondsLeft);
          if (Array.isArray(d.drawnNumbers)) {
            const nums = d.drawnNumbers.map((n: any) => n.number);
            setDrawn(new Set(nums));
            setOrder(nums);
            if (nums.length) setLast(nums[nums.length - 1]);
          }
          break;
        }
        case "GAME_STATUS": {
          // Backend sends the new state under `status`; tolerate `state` too.
          const status: GameState | undefined = msg.data.status ?? msg.data.state;
          if (status === "CANCELLED") {
            // The game was force-cancelled or auto-refunded (e.g. all numbers
            // drawn with no winner). The stake is already back in the wallet.
            setPhase("CANCELLED");
            setResult({ type: "cancelled" });
            refreshWallet().catch(() => {});
          } else if (status) {
            setPhase(status);
          }
          if (typeof msg.data.player_count === "number") setPlayers(msg.data.player_count);
          if (typeof msg.data.prize_pool === "number") setPrize(msg.data.prize_pool);
          break;
        }
        case "PLAYER_COUNT":
          setPlayers(msg.data.count);
          break;
        case "PLAYER_JOINED":
          setPlayers((p) => p + 1);
          break;
        case "PLAYER_LEFT":
          setPlayers((p) => Math.max(0, p - 1));
          break;
        case "COUNTDOWN":
          setPhase("COUNTDOWN");
          setSeconds(msg.data.secondsLeft);
          break;
        case "NUMBER_DRAWN": {
          const n: number = msg.data.number;
          setPhase("DRAWING");
          setLast(n);
          setDrawn((prev) => new Set(prev).add(n));
          setOrder((prev) => (prev.includes(n) ? prev : [...prev, n]));
          if (soundEnabled) sound.callNumber(n);
          if (hapticsEnabled) haptic.impact("light");
          // Marking is manual: the player must tap each called number on their
          // own card. (No auto-daub.)
          break;
        }
        case "WINNER": {
          setPhase("FINISHED");
          const won = !!myId && msg.data.user_id === myId;
          const prizeAmt = msg.data.prize ?? prize;
          // Reveal the winner to EVERYONE (winner, losers, eliminated) so the
          // payout is transparent — including their card + marks so anyone can
          // verify the win is legitimate.
          setWinnerInfo({
            name: msg.data.winner_name || "Winner",
            prize: prizeAmt,
            cardId: typeof msg.data.card_id === "number" ? msg.data.card_id : undefined,
            marked: Array.isArray(msg.data.marked_numbers) ? msg.data.marked_numbers : undefined,
          });
          setResult((prev) =>
            won
              ? { type: "win", prize: prizeAmt }
              : prev?.type === "eliminated"
                ? prev
                : { type: "lose" },
          );
          if (won && soundEnabled) sound.win();
          refreshWallet().catch(() => {});
          break;
        }
        case "PLAYER_ELIMINATED": {
          // Backend sends the id under `userId`; tolerate `user_id` too.
          const elimId = msg.data.userId ?? msg.data.user_id;
          if (myId && elimId === myId) setResult({ type: "eliminated" });
          break;
        }
        default:
          break;
      }
    },
    [hapticsEnabled, myId, prize, refreshWallet, soundEnabled],
  );

  // Set up the live game socket.
  const feedRef = useRef<Feed | null>(null);
  useEffect(() => {
    const feed: Feed = new GameSocket(gameId);
    feedRef.current = feed;
    const offMsg = feed.on(handleMessage);
    const offStatus = feed.onStatus(setConn);
    feed.connect();
    return () => {
      offMsg();
      offStatus();
      feed.close();
      feedRef.current = null;
    };
    // handleMessage is stable enough; re-subscribing on each draw would reset the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const onDaub = (pos: number) => {
    if (result) return;
    const num = card?.numbers.flat()[pos];
    if (num === undefined || num === 0) return;
    if (!drawn.has(num)) return; // can only mark called numbers
    setDaubed((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
    if (soundEnabled) sound.daub();
    if (hapticsEnabled) haptic.select();
  };

  const onClaim = async () => {
    if (!canClaim) return;
    haptic.impact("heavy");
    setClaiming(true);
    try {
      const r = await api.claimBingo(gameId, claimPositions(daubed));
      setResult(r.winner ? { type: "win", prize } : { type: "eliminated" });
      await refreshWallet().catch(() => {});
    } catch (e) {
      push(e instanceof ApiError ? e.message : "error", "error");
    } finally {
      setClaiming(false);
    }
  };

  const onLeave = async () => {
    if (phase === "WAITING" || phase === "COUNTDOWN") {
      try {
        await api.leave(gameId);
        await refreshWallet().catch(() => {});
      } catch {
        /* ignore */
      }
    }
    nav("/");
  };

  if (!card) {
    return (
      <div className="flex min-h-screen flex-col px-4 pt-3">
        <Header back onBack={() => nav("/")} title={t("game.yourCard")} />
        <FullSpinner label={t("common.loading")} />
      </div>
    );
  }

  const canRefund = phase === "WAITING" || phase === "COUNTDOWN";
  const recent = order.slice(-7).reverse(); // most-recent first

  return (
    // Fixed to the viewport height and non-scrolling: the whole game lives on
    // one page. The card flexes to fill the space left by the header/called row.
    <div className="flex h-[100dvh] flex-col overflow-hidden px-4 pb-3 pt-2">
      <Header
        back
        onBack={() => nav("/")}
        title={
          <span className="text-lg">
            {money(prize)} <span className="text-xs text-ink-faint">🏆</span>
          </span>
        }
        right={
          <button onClick={onLeave} className="glass rounded-xl px-3 py-2 text-xs font-bold text-neon-red">
            {canRefund ? t("game.leaveRefund") : t("game.leave")}
          </button>
        }
      />

      {/* Status row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm">
          <div className="font-display font-bold">
            {phase === "COUNTDOWN"
              ? t("game.countdown", { n: seconds })
              : phase === "DRAWING"
                ? t("game.drawing")
                : phase === "FINISHED"
                  ? t("game.finished")
                  : t("game.waiting")}
          </div>
          <div className="text-xs text-ink-faint">
            👥 {t("game.players", { n: players })}
            {conn !== "open" && ` · ${t("game.reconnecting")}`}
          </div>
        </div>
        {phase === "COUNTDOWN" && (
          <CountdownRing seconds={seconds} total={COUNTDOWN_SECONDS} />
        )}
      </div>

      {/* Called numbers: the current ball + the last few calls (with letters).
          Replaces the tall, scrolling 75-cell master board. */}
      <div className="glass mb-2 flex items-center gap-3 rounded-2xl p-2">
        <BallCallout number={last} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between text-[11px] text-ink-faint">
            <span>{t("game.called")}</span>
            <span>{order.length}/75</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {recent.length === 0 ? (
              <span className="text-xs text-ink-faint">—</span>
            ) : (
              recent.map((n, i) => <CallChip key={n} n={n} highlight={i === 0} />)
            )}
          </div>
        </div>
      </div>

      {/* Player card — fills the remaining height, sized so it never scrolls. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="mx-auto" style={{ width: "min(100%, calc(100dvh - 330px))" }}>
          <BingoCardView
            card={card}
            daubed={daubed}
            drawn={drawn}
            winLine={winLine}
            onDaub={onDaub}
          />
        </div>
      </div>

      {/* BINGO button */}
      <motion.div className="mt-2" animate={canClaim ? { scale: [1, 1.03, 1] } : {}} transition={{ repeat: Infinity, duration: 0.9 }}>
        <Button
          variant="gold"
          fullWidth
          disabled={!canClaim}
          loading={claiming}
          onClick={onClaim}
          className="!py-3.5 text-xl"
        >
          {claiming ? t("game.claiming") : `🎉 ${t("game.bingo")}`}
        </Button>
      </motion.div>

      <ResultOverlay result={result} winner={winnerInfo} drawn={drawn} onPlayAgain={() => nav("/")} />
    </div>
  );
}

// Letter tints for the called-number chips (B/I/N/G/O).
const CHIP_COLOR: Record<string, string> = {
  B: "bg-neon-cyan/20 text-neon-cyan",
  I: "bg-neon-purple/20 text-neon-purple",
  N: "bg-neon-pink/20 text-neon-pink",
  G: "bg-neon-green/20 text-neon-green",
  O: "bg-neon-gold/20 text-neon-gold",
};

/** A recently-called number shown as letter+number, e.g. "N42". */
function CallChip({ n, highlight }: { n: number; highlight?: boolean }) {
  const l = letterForNumber(n);
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
        CHIP_COLOR[l] ?? "bg-white/10 text-white"
      } ${highlight ? "ring-1 ring-white/70" : ""}`}
    >
      {l}
      {n}
    </span>
  );
}

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
import { autoMarked, claimPositions, findWinningPositions, letterForNumber } from "@/lib/bingo";
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

// One of the player's cards in this game (they may hold up to 4).
interface MyCard {
  cardId: number;
  card: BingoCard;
  eliminated: boolean;
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

  const [cards, setCards] = useState<MyCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [order, setOrder] = useState<number[]>([]); // draw order, for the recent-calls strip
  const [last, setLast] = useState<number | null>(null);
  const [phase, setPhase] = useState<GameState>("WAITING");
  const [seconds, setSeconds] = useState(0);
  const [players, setPlayers] = useState(0);
  const [prize, setPrize] = useState(0);
  const [conn, setConn] = useState<"connecting" | "open" | "closed">("connecting");
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [result, setResult] = useState<GameResult>(null);
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null);

  sound.enabled = soundEnabled;

  // Load all of the player's cards (fall back to the single card from nav state).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let ids: number[] = [];
      const elim = new Map<number, boolean>();
      try {
        const { cards } = await api.myCardsInGame(gameId);
        ids = cards.map((c) => c.card_id);
        cards.forEach((c) => elim.set(c.card_id, c.is_eliminated));
      } catch {
        /* ignore */
      }
      if (ids.length === 0 && stateCardId) ids = [stateCardId];
      if (ids.length === 0) {
        if (!cancelled) setLoaded(true);
        return;
      }
      const out = await Promise.all(
        ids.map(async (id) => {
          try {
            const { card } = await api.card(id);
            return { cardId: id, card, eliminated: elim.get(id) ?? false } as MyCard;
          } catch {
            return null;
          }
        }),
      );
      if (!cancelled) {
        setCards(out.filter(Boolean) as MyCard[]);
        setLoaded(true);
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
        case "PLAYER_LEFT":
          // Both carry the live prize_pool / player_count so every client stays
          // in sync as others join or leave (not just the freshly-connected one).
          if (typeof msg.data.prize_pool === "number") setPrize(msg.data.prize_pool);
          if (typeof msg.data.player_count === "number") setPlayers(msg.data.player_count);
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
          // Marking is automatic: the app daubs the called number on every card
          // that holds it (marks are derived from `drawn` at render/claim time).
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
        case "PLAYER_ELIMINATED":
          // Elimination is per-card and handled locally from the claim response
          // (a player may still have other live cards), so this is informational.
          break;
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

  const onClaim = async (cardId: number) => {
    const c = cards.find((x) => x.cardId === cardId);
    if (!c || c.eliminated || phase !== "DRAWING" || result) return;
    const marked = autoMarked(c.card, drawn);
    if (!findWinningPositions(marked)) return;

    haptic.impact("heavy");
    setClaimingId(cardId);
    try {
      const r = await api.claimBingo(gameId, cardId, claimPositions(marked));
      if (r.winner) {
        setResult({ type: "win", prize });
      } else {
        // Only this card is out — the player's other cards keep playing.
        push(t("game.cardEliminated"), "error");
        const stillAlive = cards.some((x) => x.cardId !== cardId && !x.eliminated);
        setCards((prev) => prev.map((x) => (x.cardId === cardId ? { ...x, eliminated: true } : x)));
        if (!stillAlive) setResult({ type: "eliminated" });
      }
      await refreshWallet().catch(() => {});
    } catch (e) {
      push(e instanceof ApiError ? e.message : "error", "error");
    } finally {
      setClaimingId(null);
    }
  };

  const canRefund = phase === "WAITING" || phase === "COUNTDOWN";

  // Remove a single card before the game starts (refunded).
  const onRemoveCard = async (cardId: number) => {
    if (!canRefund) return;
    try {
      await api.leave(gameId, cardId);
      await refreshWallet().catch(() => {});
    } catch {
      /* ignore */
    }
    const remaining = cards.filter((x) => x.cardId !== cardId);
    setCards(remaining);
    if (remaining.length === 0) nav("/");
  };

  const onLeave = async () => {
    if (canRefund) {
      try {
        await api.leave(gameId); // no card_id → leave entirely (refund all)
        await refreshWallet().catch(() => {});
      } catch {
        /* ignore */
      }
    }
    nav("/");
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen flex-col px-4 pt-3">
        <Header back onBack={() => nav("/")} title={t("game.yourCards", { n: 0 })} />
        <FullSpinner label={t("common.loading")} />
      </div>
    );
  }

  const recent = order.slice(-7).reverse(); // most-recent first

  return (
    // Header + called-numbers strip stay fixed; the cards area scrolls (a player
    // may hold up to 4 cards, which won't all fit one screen).
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

      {/* Called numbers: the current ball + the last few calls (with letters). */}
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

      {cards.length > 1 && (
        <div className="mb-1 text-xs font-bold text-ink-muted">
          {t("game.yourCards", { n: cards.length })}
        </div>
      )}

      {/* Scrollable stack of the player's cards, each individually claimable. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
        {cards.map((c) => (
          <CardPanel
            key={c.cardId}
            entry={c}
            marked={autoMarked(c.card, drawn)}
            phase={phase}
            blocked={!!result}
            claiming={claimingId === c.cardId}
            showRemove={canRefund && cards.length > 0}
            onClaim={() => onClaim(c.cardId)}
            onRemove={() => onRemoveCard(c.cardId)}
          />
        ))}
      </div>

      <ResultOverlay result={result} winner={winnerInfo} drawn={drawn} onPlayAgain={() => nav("/")} />
    </div>
  );
}

// A single card with its own daub state and BINGO button.
function CardPanel({
  entry,
  marked,
  phase,
  blocked,
  claiming,
  showRemove,
  onClaim,
  onRemove,
}: {
  entry: MyCard;
  marked: Set<number>;
  phase: GameState;
  blocked: boolean;
  claiming: boolean;
  showRemove: boolean;
  onClaim: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const winLine = useMemo(() => findWinningPositions(marked), [marked]);
  const canClaim = !!winLine && phase === "DRAWING" && !blocked && !entry.eliminated;

  return (
    <div className={`glass rounded-2xl p-2.5 ${entry.eliminated ? "opacity-50" : ""}`}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold text-ink-muted">
          {t("game.cardLabel", { id: entry.cardId })}
        </span>
        <div className="flex items-center gap-2">
          {entry.eliminated ? (
            <span className="rounded-full bg-neon-red/20 px-2 py-0.5 text-[10px] font-bold text-neon-red">
              {t("game.cardOut")}
            </span>
          ) : showRemove ? (
            <button
              onClick={onRemove}
              className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-ink-muted hover:text-neon-red"
            >
              ✕
            </button>
          ) : null}
          <motion.div animate={canClaim ? { scale: [1, 1.04, 1] } : {}} transition={{ repeat: Infinity, duration: 0.9 }}>
            <Button
              variant="gold"
              disabled={!canClaim}
              loading={claiming}
              onClick={onClaim}
              className="!px-4 !py-1.5 text-sm"
            >
              {claiming ? t("game.claiming") : `🎉 ${t("game.bingo")}`}
            </Button>
          </motion.div>
        </div>
      </div>
      <BingoCardView
        card={entry.card}
        daubed={marked}
        winLine={winLine}
      />
    </div>
  );
}

// Letter tints for the called-number chips (B/I/N/G/O).
const CHIP_COLOR: Record<string, string> = {
  B: "bg-neon-cyan/20 text-neon-cyan",
  I: "bg-neon-blue/20 text-neon-blue",
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

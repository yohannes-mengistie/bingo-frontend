import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { FullSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { BingoCardView } from "@/components/bingo/BingoCard";
import { DrawnBoard } from "@/components/bingo/DrawnBoard";
import { BallCallout } from "@/components/bingo/BallCallout";
import { CountdownRing } from "@/components/bingo/CountdownRing";
import { ResultOverlay, GameResult } from "@/components/bingo/ResultOverlay";
import { GameSocket } from "@/lib/ws";
import { LocalGameEngine } from "@/lib/localGame";
import { claimPositions, findWinningPositions } from "@/lib/bingo";
import { api, ApiError } from "@/lib/api";
import { sound } from "@/lib/audio";
import { haptic } from "@/lib/telegram";
import { money } from "@/lib/format";
import { COUNTDOWN_SECONDS } from "@/lib/constants";
import { useAuth } from "@/store/authStore";
import { useWallet } from "@/store/walletStore";
import { useSettings } from "@/store/settingsStore";
import type { BingoCard, GameState, GameType, WsMessage } from "@/types/api";

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
  const { soundEnabled, hapticsEnabled, autoDaub } = useSettings();
  const push = useToast((s) => s.push);

  const isDemo = gameId.startsWith("demo-");
  const demoType = (isDemo ? gameId.slice("demo-".length) : "G1") as GameType;
  const stateCardId = (location.state as { cardId?: number } | null)?.cardId;

  const [card, setCard] = useState<BingoCard | null>(null);
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [last, setLast] = useState<number | null>(null);
  const [daubed, setDaubed] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<GameState>("WAITING");
  const [seconds, setSeconds] = useState(0);
  const [players, setPlayers] = useState(0);
  const [prize, setPrize] = useState(0);
  const [conn, setConn] = useState<"connecting" | "open" | "closed">("connecting");
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<GameResult>(null);

  sound.enabled = soundEnabled;

  // number -> board position, for auto-daub.
  const numToPos = useMemo(() => {
    const m = new Map<number, number>();
    card?.numbers.flat().forEach((n, pos) => {
      if (n !== 0) m.set(n, pos);
    });
    return m;
  }, [card]);

  const winLine = useMemo(() => findWinningPositions(daubed), [daubed]);
  const canClaim = !!winLine && phase === "DRAWING" && !result;

  // Resolve which card is ours (from nav state, else from the server).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cardId = stateCardId;
      if (!cardId && !isDemo) {
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
  }, [gameId, isDemo, stateCardId]);

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
            setDrawn(new Set(d.drawnNumbers.map((n: any) => n.number)));
          }
          break;
        }
        case "GAME_STATUS":
          if (msg.data.state) setPhase(msg.data.state);
          if (typeof msg.data.player_count === "number") setPlayers(msg.data.player_count);
          if (typeof msg.data.prize_pool === "number") setPrize(msg.data.prize_pool);
          break;
        case "PLAYER_COUNT":
          setPlayers(msg.data.count);
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
          if (soundEnabled) sound.callNumber(n);
          if (hapticsEnabled) haptic.impact("light");
          if (autoDaub) {
            const pos = numToPos.get(n);
            if (pos !== undefined) setDaubed((prev) => new Set(prev).add(pos));
          }
          break;
        }
        case "WINNER": {
          setPhase("FINISHED");
          const won = !!myId && msg.data.user_id === myId;
          setResult(won ? { type: "win", prize: msg.data.prize ?? prize } : { type: "lose" });
          if (won && soundEnabled) sound.win();
          if (!isDemo) refreshWallet().catch(() => {});
          break;
        }
        case "PLAYER_ELIMINATED":
          if (myId && msg.data.user_id === myId) setResult({ type: "eliminated" });
          break;
        default:
          break;
      }
    },
    [autoDaub, hapticsEnabled, isDemo, myId, numToPos, prize, refreshWallet, soundEnabled],
  );

  // Set up the feed (real socket or local practice engine).
  const feedRef = useRef<Feed | null>(null);
  useEffect(() => {
    const feed: Feed = isDemo ? new LocalGameEngine(demoType) : new GameSocket(gameId);
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
  }, [gameId, isDemo, demoType]);

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
      if (isDemo) {
        // Button is gated on a real pattern, so this is always a win in practice.
        setResult({ type: "win", prize });
      } else {
        const r = await api.claimBingo(gameId, claimPositions(daubed));
        setResult(r.winner ? { type: "win", prize } : { type: "eliminated" });
        await refreshWallet().catch(() => {});
      }
    } catch (e) {
      push(e instanceof ApiError ? e.message : "error", "error");
    } finally {
      setClaiming(false);
    }
  };

  const onLeave = async () => {
    if (!isDemo && (phase === "WAITING" || phase === "COUNTDOWN")) {
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
        <Header back title={t("game.yourCard")} />
        <FullSpinner label={t("common.loading")} />
      </div>
    );
  }

  const canRefund = !isDemo && (phase === "WAITING" || phase === "COUNTDOWN");

  return (
    <div className="flex min-h-screen flex-col px-4 pb-4 pt-3">
      <Header
        title={
          <span className="text-lg">
            {isDemo ? t("common.practice") : money(prize)}{" "}
            {!isDemo && <span className="text-xs text-ink-faint">🏆</span>}
          </span>
        }
        right={
          <button onClick={onLeave} className="glass rounded-xl px-3 py-2 text-xs font-bold text-neon-red">
            {canRefund ? t("game.leaveRefund") : t("game.leave")}
          </button>
        }
      />

      {/* Status row */}
      <div className="mb-3 flex items-center justify-between">
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

      {/* Drawn board + ball */}
      <div className="glass mb-3 rounded-2xl p-3">
        <BallCallout number={last} />
        <div className="mt-2">
          <DrawnBoard drawn={drawn} last={last} />
        </div>
      </div>

      {/* Player card */}
      <div className="flex-1">
        <BingoCardView
          card={card}
          daubed={daubed}
          drawn={drawn}
          winLine={winLine}
          onDaub={onDaub}
        />
      </div>

      {/* BINGO button */}
      <motion.div className="sticky bottom-3 mt-3" animate={canClaim ? { scale: [1, 1.03, 1] } : {}} transition={{ repeat: Infinity, duration: 0.9 }}>
        <Button
          variant="gold"
          fullWidth
          disabled={!canClaim}
          loading={claiming}
          onClick={onClaim}
          className="!py-4 text-xl"
        >
          {claiming ? t("game.claiming") : `🎉 ${t("game.bingo")}`}
        </Button>
      </motion.div>

      <ResultOverlay result={result} onPlayAgain={() => nav("/")} />
    </div>
  );
}

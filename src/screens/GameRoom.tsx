import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { FullSpinner } from "@/components/ui/Spinner";
import { BingoCardView } from "@/components/bingo/BingoCard";
import { BallCallout } from "@/components/bingo/BallCallout";
import { CountdownRing } from "@/components/bingo/CountdownRing";
import { CalledBoard } from "@/components/bingo/CalledBoard";
import { ResultOverlay, GameResult, WinnerInfo, WinnerEntry } from "@/components/bingo/ResultOverlay";
import { GameSocket } from "@/lib/ws";
import { autoMarked, findWinningPositions, letterForNumber } from "@/lib/bingo";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { finishedGames } from "@/lib/finishedGames";
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

// Build the ResultOverlay winner list from a WINNER event or a finished
// INITIAL_STATE payload. Prefers the `winners[]` array (pot split across several
// cards) and falls back to the older single-winner top-level fields.
function parseWinners(data: any): WinnerEntry[] {
  const map = (w: any): WinnerEntry => ({
    userId: w.user_id,
    name: w.winner_name || "Winner",
    prize: typeof w.prize === "number" ? w.prize : 0,
    cardId: typeof w.card_id === "number" ? w.card_id : undefined,
    marked: Array.isArray(w.marked_numbers) ? w.marked_numbers : undefined,
  });
  if (Array.isArray(data?.winners) && data.winners.length) return data.winners.map(map);
  if (data?.user_id) return [map(data)];
  return [];
}

export function GameRoom() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { gameId = "" } = useParams<{ gameId: string }>();
  const location = useLocation();
  const myId = useAuth((s) => s.user?.id);
  const refreshWallet = useWallet((s) => s.refresh);
  const { soundEnabled, hapticsEnabled, toggleSound } = useSettings();

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
  const [result, setResult] = useState<GameResult>(null);
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null);

  // Guards the end-of-game resolution so the win announcement (sound + confetti +
  // result popup) fires exactly ONCE — even if the WINNER event arrives twice or
  // an INITIAL_STATE for the just-finished game also lands. Reset per game.
  const endedRef = useRef(false);
  useEffect(() => {
    endedRef.current = false;
  }, [gameId]);

  // Clean return to the lobby: drop the picker's stale cache first so it opens on
  // a fresh game (not a flash of the finished one), then navigate.
  const qc = useQueryClient();
  const returnToLobby = useCallback(() => {
    qc.removeQueries({ queryKey: ["game-for-type"] });
    qc.removeQueries({ queryKey: ["my-cards"] });
    qc.removeQueries({ queryKey: ["game-state"] });
    nav("/");
  }, [qc, nav]);

  // A spectator is someone watching a round they hold no cards in. Ref mirror so
  // the websocket handler (a stable callback) can read the current value.
  const cardsCountRef = useRef(0);
  cardsCountRef.current = cards.length;

  sound.enabled = soundEnabled;

  // Warm the caller audio (fetch + decode all clips) as soon as the room opens,
  // so the first number call plays instantly and every call is gapless.
  useEffect(() => {
    if (soundEnabled) sound.preloadCalls();
  }, [soundEnabled]);

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
          // Reconnecting to (or opening) a finished game: the backend includes the
          // winning card(s) so we can show the result screen even though the live
          // WINNER event is long gone.
          if (Array.isArray(d.winners) && d.winners.length && !endedRef.current) {
            endedRef.current = true;
            finishedGames.add(gameId);
            const list = parseWinners(d);
            const mine = list.find((w) => !!myId && w.userId === myId);
            setWinnerInfo({
              winners: list,
              split: list.length > 1,
              prizePool:
                typeof d.game?.prize_pool === "number" ? d.game.prize_pool : undefined,
            });
            setPhase("FINISHED");
            setResult(mine ? { type: "win", prize: mine.prize } : { type: "lose" });
          }
          break;
        }
        case "GAME_STATUS": {
          // Backend sends the new state under `status`; tolerate `state` too.
          const status: GameState | undefined = msg.data.status ?? msg.data.state;
          if (status === "CANCELLED") {
            // The game was force-cancelled or auto-refunded (e.g. all numbers
            // drawn with no winner). The stake is already back in the wallet.
            finishedGames.add(gameId);
            if (cardsCountRef.current === 0) {
              returnToLobby(); // spectator → next round
              break;
            }
            setPhase("CANCELLED");
            setResult({ type: "cancelled" });
            refreshWallet().catch(() => {});
          } else if (status) {
            setPhase(status);
            // Stakes are charged the moment the game starts (reservation model),
            // and a paid player can also be charged when a game reverts to
            // WAITING after another reserver fails to pay — pull the fresh
            // balance on both so the wallet reflects the debit.
            if (status === "DRAWING" || status === "WAITING") {
              refreshWallet().catch(() => {});
            }
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
          if (endedRef.current) break; // already announced — ignore duplicates
          endedRef.current = true;
          finishedGames.add(gameId); // don't let the picker re-enter this game
          // Spectator (no cards): this round's result isn't theirs — send them
          // back to pick for the next round instead of a win/lose screen.
          if (cardsCountRef.current === 0) {
            returnToLobby();
            break;
          }
          setPhase("FINISHED");
          // Reveal every winner to EVERYONE (winner, losers, eliminated) so the
          // payout is transparent — including each card + marks so anyone can
          // verify the wins. Several cards may split the pot.
          const list = parseWinners(msg.data);
          const mine = list.find((w) => !!myId && w.userId === myId);
          setWinnerInfo({
            winners: list,
            split: !!msg.data.split || list.length > 1,
            prizePool:
              typeof msg.data.prize_pool === "number" ? msg.data.prize_pool : undefined,
          });
          const prizeAmt = mine ? mine.prize : (msg.data.prize ?? prize);
          setResult((prev) =>
            mine
              ? { type: "win", prize: prizeAmt }
              : prev?.type === "eliminated"
                ? prev
                : { type: "lose" },
          );
          // Announce "Bingo!" (recorded voice) to everyone in the room.
          if (soundEnabled) sound.bingo();
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

  // Winning is automatic: the server auto-detects a completed card and declares
  // the winner(s) via the WINNER event — no manual claim/tap needed. Each card
  // simply lights up with a BINGO badge (see CardPanel) when it completes.

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
          // Sound toggle lives here (handy mid-game). Leaving is only offered
          // before the draw starts (it releases the reservation). Once the game
          // is DRAWING/FINISHED there's nothing to leave — cards play
          // automatically — so that button is hidden; the back arrow still
          // returns to the lobby without forfeiting.
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (hapticsEnabled) haptic.select();
                toggleSound();
              }}
              aria-label={t("profile.sound")}
              className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base active:scale-95"
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>
            {canRefund && (
              <button onClick={onLeave} className="glass rounded-xl px-3 py-2 text-xs font-bold text-neon-red">
                {t("game.leaveRefund")}
              </button>
            )}
          </div>
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

      {/* Full 75-number B·I·N·G·O board: every called number lit up. */}
      <CalledBoard drawn={drawn} last={last} />

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

      {/* Spectator: watching a round they hold no cards in. */}
      {loaded && cards.length === 0 && phase !== "FINISHED" && phase !== "CANCELLED" && (
        <div className="mx-1 mt-2 rounded-2xl border border-neon-cyan/25 bg-neon-cyan/5 px-4 py-4 text-center">
          <div className="text-2xl">👀</div>
          <div className="mt-1 text-sm text-ink-muted">{t("game.spectatorWait")}</div>
        </div>
      )}

      {/* Player's cards in a grid (2 columns; 1 column when solo); each lights up. */}
      <div
        className={`min-h-0 flex-1 grid content-start gap-2 overflow-y-auto pb-2 ${
          cards.length === 1 ? "grid-cols-1" : "grid-cols-2"
        }`}
      >
        {cards.map((c) => (
          <CardPanel
            key={c.cardId}
            entry={c}
            marked={autoMarked(c.card, drawn)}
            showRemove={canRefund && cards.length > 0}
            onRemove={() => onRemoveCard(c.cardId)}
          />
        ))}
      </div>

      <ResultOverlay result={result} winner={winnerInfo} drawn={drawn} onPlayAgain={returnToLobby} />
    </div>
  );
}

// A single card with its own auto-daub state. When it completes a line it lights
// up with a passive BINGO badge — the server auto-declares the win, so there is
// no button to tap.
function CardPanel({
  entry,
  marked,
  showRemove,
  onRemove,
}: {
  entry: MyCard;
  marked: Set<number>;
  showRemove: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const winLine = useMemo(() => findWinningPositions(marked), [marked]);
  const hasBingo = !!winLine && !entry.eliminated;

  return (
    <div
      className={`w-full rounded-xl p-1.5 ring-1 ring-white/10 ${
        entry.eliminated ? "opacity-50" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between px-0.5">
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
          {hasBingo && (
            <motion.span
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 0.9 }}
              className="rounded-full bg-neon-gold/20 px-3 py-1 text-sm font-extrabold text-neon-gold"
            >
              🎉 {t("game.bingo")}
            </motion.span>
          )}
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

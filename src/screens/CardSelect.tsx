import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/components/ui/Toast";
import { FullSpinner } from "@/components/ui/Spinner";
import { BalancePill } from "@/components/ui/BalancePill";
import { LangToggle } from "@/components/ui/LangToggle";
import { CardPreview } from "@/components/bingo/CardPreview";
import {
  MAX_CARD_ID,
  MIN_CARD_ID,
  BET_BY_TYPE,
  MAX_CARDS_PER_PLAYER,
} from "@/lib/constants";
import { money } from "@/lib/format";
import { api, ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";
import { sound } from "@/lib/audio";
import { finishedGames } from "@/lib/finishedGames";
import { useWallet } from "@/store/walletStore";
import { useSettings } from "@/store/settingsStore";
import type { GameType } from "@/types/api";

const ALL_CARDS = Array.from({ length: MAX_CARD_ID - MIN_CARD_ID + 1 }, (_, i) => i + MIN_CARD_ID);

// `home` = this is the Play tab landing (route "/"): it shows the bottom tab
// bar and a balance + VIP + language header instead of a back button. Without
// it, it's the VIP sub-screen (back button, no tabs) reached from the home VIP
// button.
//
// Flow: tapping a card RESERVES it immediately (no charge, no Join button). The
// stake is taken for everyone when the 40s countdown ends, at which point the
// game starts and reserved players are pulled straight into the board.
export function CardSelect({ home = false }: { home?: boolean }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { gameType } = useParams<{ gameType: GameType }>();
  const type = (gameType ?? "REGULAR") as GameType;
  const bet = BET_BY_TYPE[type] ?? 0;
  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  const push = useToast((s) => s.push);
  const soundEnabled = useSettings((s) => s.soundEnabled);
  sound.enabled = soundEnabled;

  // Pull a fresh balance whenever the picker opens, so the affordability gating
  // reflects real money — not a stale cached value from a prior game / deposit.
  useEffect(() => {
    refreshWallet().catch(() => {});
  }, [refreshWallet]);

  // Cards whose reserve/release request is currently in flight (tap debounce).
  const [busy, setBusy] = useState<Set<number>>(new Set());

  // Fetch/create the active game for this stake (creates if none).
  const gameQ = useQuery({
    queryKey: ["game-for-type", type],
    queryFn: async () => (await api.games(type)).games[0] ?? null,
  });
  const gameId = gameQ.data?.id ?? null;

  // Poll taken cards + live game state.
  const stateQ = useQuery({
    queryKey: ["game-state", gameId],
    queryFn: () => api.gameState(gameId!),
    enabled: !!gameId,
    refetchInterval: 3000,
  });
  const taken = useMemo(
    () => new Set(stateQ.data?.takenCards ?? []),
    [stateQ.data],
  );

  // Live snapshot for the hero: prize, player count, state and the countdown.
  const liveGame = stateQ.data?.game ?? gameQ.data ?? null;
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const countdownEnds = liveGame?.countdown_ends ? Date.parse(liveGame.countdown_ends) : null;
  const secondsLeft =
    countdownEnds != null ? Math.max(0, Math.ceil((countdownEnds - nowTs) / 1000)) : null;
  const isCountdown = liveGame?.state === "COUNTDOWN" && secondsLeft != null;
  // Human-readable daily round code from the backend, e.g. "3" (3rd game of the
  // day). Falls back to a game-id slice for older games without the field.
  const roundCode =
    liveGame?.round_code ||
    (gameId ? gameId.replace(/-/g, "").slice(0, 4).toUpperCase() : "----");

  // Cards this player has reserved in the current game.
  const ownedQ = useQuery({
    queryKey: ["my-cards", gameId],
    queryFn: () => api.myCardsInGame(gameId!),
    enabled: !!gameId,
    refetchInterval: 3000,
  });
  const owned = useMemo(
    () => new Set((ownedQ.data?.cards ?? []).map((c) => c.card_id)),
    [ownedQ.data],
  );

  const ownedCount = owned.size;
  const takenCount = taken.size; // total cards reserved in this game (all players)
  // Can another card be reserved? (cap + wallet can cover one more at commit)
  const canAddMore = ownedCount < MAX_CARDS_PER_PLAYER && balance() >= (ownedCount + 1) * bet;

  // When the countdown ends and drawing begins, pull reserved players straight
  // into the game board (only once).
  const enteredRef = useRef(false);
  useEffect(() => {
    if (
      liveGame?.state === "DRAWING" &&
      ownedCount > 0 &&
      gameId &&
      !finishedGames.has(gameId) && // never bounce back into a game that's over
      !enteredRef.current
    ) {
      enteredRef.current = true;
      haptic.impact("medium");
      nav(`/game/${gameId}`);
    }
  }, [liveGame?.state, ownedCount, gameId, nav]);

  // Tapping a card reserves it (or releases it if already reserved). No charge
  // happens here — reserved cards are billed together when the game starts.
  const toggle = async (id: number) => {
    if (!gameId || busy.has(id)) return;
    // Unlock + warm the caller audio on this real user gesture: resume the
    // AudioContext (it starts suspended) and fetch+decode the call clips now, so
    // the FIRST number call in the game room plays instantly instead of being
    // swallowed by a still-suspended context. Idempotent (cached after first).
    sound.preloadCalls();
    const isMine = owned.has(id);
    if (!isMine && taken.has(id)) return; // reserved by someone else

    if (!isMine) {
      if (ownedCount >= MAX_CARDS_PER_PLAYER) {
        push(t("card.maxCards", { max: MAX_CARDS_PER_PLAYER }), "error");
        return;
      }
      if (balance() < (ownedCount + 1) * bet) {
        push(t("card.insufficient"), "error");
        return;
      }
    }

    setBusy((prev) => new Set(prev).add(id));
    haptic.select();
    try {
      if (isMine) {
        await api.leave(gameId, id); // release the reservation (nothing charged)
      } else {
        await api.join(gameId, id); // reserve the card (charged at game start)
      }
      await Promise.all([ownedQ.refetch(), stateQ.refetch()]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "error";
      push(msg === "insufficient balance" ? t("card.insufficient") : msg, "error");
    } finally {
      setBusy((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  if (gameQ.isLoading) {
    return (
      <ScreenShell tabs={home}>
        {!home && <Header back title={`${type} · ${money(bet)}`} />}
        <FullSpinner label={t("common.loading")} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell tabs={home}>
      {home ? (
        // Landing header: balance, a VIP-room shortcut, sound + language toggles.
        <div className="mb-3 flex items-center justify-between gap-2">
          <BalancePill />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                haptic.impact("medium");
                nav("/play/VIP");
              }}
              className="flex items-center gap-1 rounded-full border border-neon-gold/40 bg-neon-gold/10 px-3 py-1.5 text-xs font-bold text-neon-gold active:scale-95"
            >
              👑 {t("lobby.vipRoom")}
            </button>
            <LangToggle />
          </div>
        </div>
      ) : (
        <Header
          back
          title={
            <span>
              {money(bet)}{" "}
              <span className="text-sm text-ink-faint">{`· ${type}`}</span>
            </span>
          }
        />
      )}
      {/* Live game hero — PLAY · ደራሽ (+taken) · WIN, with countdown. Display only. */}
      <div className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-bg-elevated to-bg-card p-4">
        <div className="grid grid-cols-3 items-start gap-2">
          {/* PLAY — the stake for this table */}
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              🎮 PLAY
            </div>
            <div className="font-display text-2xl font-extrabold text-ink">
              {type === "VIP" ? "👑 " : ""}
              {money(bet)}
            </div>
          </div>
          {/* ደራሽ — the prize pool + how many cards are taken */}
          <div className="min-w-0 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              {t("card.prize")}
            </div>
            <div className="font-display text-2xl font-extrabold text-neon-cyan">
              {money(liveGame?.prize_pool ?? 0)}
            </div>
            <div className="text-[10px] text-ink-faint">
              {t("card.takenCards", { count: takenCount })}
            </div>
          </div>
          {/* WIN — the player's winnings (0 until they win) */}
          <div className="min-w-0 text-right">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              🏆 WIN
            </div>
            <div className="font-display text-2xl font-extrabold text-neon-gold">
              {money(0)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5 text-xs text-ink-muted">
          <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono font-bold text-ink">
            {t("card.round")} #{roundCode}
          </span>
          {isCountdown ? (
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-ink-faint">{t("card.startingIn")}</span>
              <span className="rounded-lg border border-neon-cyan/50 px-2.5 py-0.5 font-display text-lg font-extrabold tabular-nums text-neon-cyan shadow-glow-cyan">
                {secondsLeft}
              </span>
            </span>
          ) : liveGame?.state === "DRAWING" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neon-green/15 px-2.5 py-1 text-[11px] font-bold text-neon-green">
              <span className="size-1.5 animate-pulse rounded-full bg-neon-green" />
              {t("card.live")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-ink-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-ink-faint" />
              {t("card.waitingPlayers")}
            </span>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-ink-faint">
        {t("card.tapToPick")} ·{" "}
        {t("card.capHint", { count: ownedCount, max: MAX_CARDS_PER_PLAYER })}
      </p>

      <div className="grid grid-cols-7 gap-1 pb-3 sm:grid-cols-9">
        {ALL_CARDS.map((id) => {
          const isMine = owned.has(id);
          const isTaken = taken.has(id) && !isMine;
          const isBusy = busy.has(id);
          const disabled = isBusy || isTaken || (!isMine && !canAddMore);
          return (
            <button
              key={id}
              disabled={disabled && !isMine}
              onClick={() => toggle(id)}
              className={[
                "flex aspect-square items-center justify-center rounded-md text-[11px] font-bold transition-all",
                isBusy ? "opacity-60" : "",
                isMine
                  ? // YOURS: glowing cyan cell (matches the design) — unmistakable.
                    "scale-105 bg-neon-cyan/15 text-white ring-2 ring-neon-cyan shadow-glow-cyan"
                  : isTaken
                    ? // TAKEN by someone else: near-black, dim + struck — clearly blocked.
                      "cursor-not-allowed bg-black/60 text-ink-faint/25 line-through ring-1 ring-white/5"
                    : disabled
                      ? // Can't add more (your cap / balance): muted tile.
                        "cursor-not-allowed bg-bg-card/40 text-ink-faint/40"
                      : // AVAILABLE: solid navy tile with a bright number — pick me.
                        "bg-bg-card text-ink ring-1 ring-white/10 hover:ring-neon-cyan/60",
              ].join(" ")}
            >
              {id}
            </button>
          );
        })}
      </div>

      {/* Spacer so the last row can scroll clear of the tab bar + floating strip. */}
      <div
        aria-hidden
        className={home ? (ownedCount > 0 ? "h-64" : "h-24") : ownedCount > 0 ? "h-52" : "h-6"}
      />

      {/* Reserved cards float over the grid (tap ✕ to release) so they're always
          visible without scrolling to the bottom. */}
      {ownedCount > 0 && (
        <div
          className={
            home
              ? "fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-40 rounded-2xl border border-white/10 bg-bg/90 p-2 shadow-lg backdrop-blur"
              : "fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-bg/95 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur"
          }
        >
          <div className="mb-1 flex items-center gap-2 px-0.5">
            <h2 className="font-display text-xs font-bold text-ink">{t("card.yourSelection")}</h2>
            <span className="rounded-full bg-neon-cyan/20 px-2 py-0.5 text-[10px] font-bold text-neon-cyan">
              {ownedCount}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {[...owned].map((id) => (
              <CardPreview key={id} id={id} onRemove={() => toggle(id)} />
            ))}
          </div>
        </div>
      )}
    </ScreenShell>
  );
}

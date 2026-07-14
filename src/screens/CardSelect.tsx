import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
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
  HOUSE_CUT,
} from "@/lib/constants";
import { money } from "@/lib/format";
import { api, ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";
import { useWallet } from "@/store/walletStore";
import type { GameType } from "@/types/api";

const ALL_CARDS = Array.from({ length: MAX_CARD_ID - MIN_CARD_ID + 1 }, (_, i) => i + MIN_CARD_ID);

// `home` = this is the Play tab landing (route "/"): it shows the bottom tab
// bar, a balance + VIP + language header instead of a back button, and floats
// the join bar above the tabs. Without it, it's the VIP sub-screen (back button,
// no tabs) reached from the home VIP button.
export function CardSelect({ home = false }: { home?: boolean }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { gameType } = useParams<{ gameType: GameType }>();
  const type = (gameType ?? "REGULAR") as GameType;
  const bet = BET_BY_TYPE[type] ?? 0;
  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  const push = useToast((s) => s.push);

  // Pull a fresh balance whenever the picker opens, so the affordability gating
  // (which cards are selectable, the cost preview) reflects real money — not a
  // stale cached value from before a prior purchase / game / deposit.
  useEffect(() => {
    refreshWallet().catch(() => {});
  }, [refreshWallet]);

  // Up to MAX_CARDS_PER_PLAYER cards can be picked at once.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [joining, setJoining] = useState(false);

  // Fetch/create the active game for this stake (creates if none).
  const gameQ = useQuery({
    queryKey: ["game-for-type", type],
    queryFn: async () => (await api.games(type)).games[0] ?? null,
  });
  const gameId = gameQ.data?.id ?? null;

  // Poll taken cards from game state.
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

  // Live snapshot for the hero: prize, player count, state and the pre-game
  // countdown. Prefer the polled game state; fall back to the game that seeded
  // this screen. Purely display — none of it changes the join logic.
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
  // Human-readable daily round code from the backend, e.g. "0714-03" (July 14,
  // 3rd game of the day). Falls back to a game-id slice for older games that
  // predate the round_code field. Doubles as a code players can quote in support.
  const roundCode =
    liveGame?.round_code ||
    (gameId ? gameId.replace(/-/g, "").slice(0, 4).toUpperCase() : "----");
  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Cards the user already holds in this game (e.g. came back to buy more).
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
  const selCount = selected.size;
  const totalCards = ownedCount + selCount;
  const remainingCap = Math.max(0, MAX_CARDS_PER_PLAYER - ownedCount);
  const totalCost = selCount * bet;
  // Projected prize: the backend pool (already net of the house cut) plus what
  // the cards being selected would add. Updates live as the user picks/removes
  // cards so the hero number reflects the pot they're about to play for.
  const houseCut = liveGame?.house_cut ?? HOUSE_CUT;
  const projectedPrize = (liveGame?.prize_pool ?? 0) + selCount * bet * (1 - houseCut);
  // Can another card be added? (cap + wallet can cover one more)
  const canSelectMore = selCount < remainingCap && balance() >= (selCount + 1) * bet;

  const toggle = (id: number) => {
    if (taken.has(id) || owned.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        haptic.select();
        return next;
      }
      if (next.size >= remainingCap) {
        push(t("card.maxCards", { max: MAX_CARDS_PER_PLAYER }), "error");
        return prev;
      }
      if (balance() < (next.size + 1) * bet) {
        push(t("card.insufficient"), "error");
        return prev;
      }
      next.add(id);
      haptic.select();
      return next;
    });
  };

  // Jump straight into the room for a game the player already holds cards in.
  // The lobby routes the "LIVE NOW" stake into this picker, so without this the
  // screen is a dead-end once all cards are owned (nothing left to select).
  const enterGame = () => {
    if (!gameId) return;
    haptic.impact("medium");
    nav(`/game/${gameId}`);
  };

  const confirm = async () => {
    if (selected.size === 0 || !gameId) return;
    haptic.impact("heavy");
    setJoining(true);
    let firstCard: number | null = null;
    let joinedAny = false;
    try {
      // Each card is its own join (one stake each). Stop on the first failure
      // but keep any cards already joined.
      for (const id of selected) {
        try {
          const { player } = await api.join(gameId, id);
          joinedAny = true;
          if (firstCard === null) firstCard = player.card_id;
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "error";
          push(msg === "insufficient balance" ? t("card.insufficient") : msg, "error");
          break;
        }
      }
      if (joinedAny) {
        await refreshWallet().catch(() => {});
        haptic.notify("success");
        nav(`/game/${gameId}`, { state: { cardId: firstCard ?? undefined } });
      }
    } finally {
      setJoining(false);
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
        // Landing header: balance, a VIP-room shortcut, and the language toggle.
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
          right={
            ownedCount > 0 ? (
              <button
                onClick={enterGame}
                className="rounded-xl bg-accent px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-accent-active active:bg-accent-active"
              >
                {t("card.enterGame")}
              </button>
            ) : undefined
          }
        />
      )}
      {/* Live game hero: prize · round · countdown/LIVE. Display only. */}
      <div className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-bg-elevated to-bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              {t("card.prize")}
            </div>
            <div className="font-display text-3xl font-extrabold text-neon-gold">
              {money(projectedPrize)}
            </div>
          </div>
          <div className="text-right">
            {isCountdown ? (
              <>
                <div className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                  {t("card.startingIn")}
                </div>
                <div className="font-display text-3xl font-extrabold tabular-nums text-ink">
                  {mmss(secondsLeft!)}
                </div>
              </>
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
        <div className="mt-3 flex items-center gap-2.5 border-t border-white/5 pt-2.5 text-xs text-ink-muted">
          <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono font-bold text-ink">
            {t("card.round")} #{roundCode}
          </span>
          <span>
            👥 {liveGame?.player_count ?? 0} {t("common.players")}
          </span>
          <span className="ml-auto rounded-md bg-white/5 px-2 py-0.5 font-bold text-ink">
            {type === "VIP" ? "👑 " : ""}
            {money(bet)}
          </span>
        </div>
      </div>

      <p className="mb-2 text-xs text-ink-faint">
        {t("card.tapToPick")} ·{" "}
        {t("card.capHint", { count: totalCards, max: MAX_CARDS_PER_PLAYER })}
      </p>

      <div className="grid grid-cols-6 gap-1.5 pb-3 sm:grid-cols-8">
        {ALL_CARDS.map((id) => {
          const isOwned = owned.has(id);
          const isTaken = taken.has(id) && !isOwned;
          const isSel = selected.has(id);
          const disabled = isTaken || isOwned || (!isSel && !canSelectMore);
          return (
            <button
              key={id}
              disabled={disabled}
              onClick={() => toggle(id)}
              className={[
                "flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition-colors",
                isSel
                  ? "bg-grad-gold text-bg ring-2 ring-white"
                  : isOwned
                    ? "bg-neon-green/20 text-neon-green ring-1 ring-neon-green/40"
                    : isTaken
                      ? "cursor-not-allowed bg-white/5 text-ink-faint/40 line-through"
                      : disabled
                        ? "cursor-not-allowed bg-bg-card text-ink-faint/40"
                        : "bg-bg-card text-ink hover:bg-white/10",
              ].join(" ")}
            >
              {id}
            </button>
          );
        })}
      </div>

      {/* Live previews of the cards the player is about to buy — rendered from
          the local card table, so exactly the grid they'll play. */}
      {selCount > 0 && (
        <div className="mb-2">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-display text-sm font-bold text-ink">{t("card.yourSelection")}</h2>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-ink-muted">
              {selCount}
            </span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {[...selected].map((id) => (
              <CardPreview key={id} id={id} onRemove={() => toggle(id)} />
            ))}
          </div>
        </div>
      )}

      {/* Spacer so the last content clears the bottom bar(s). */}
      <div aria-hidden className={home ? "h-44" : "h-28"} />

      {/* Join action. On the landing it floats above the tab bar and only shows
          once cards are selected; on the VIP sub-screen it's the full-width
          bottom bar. */}
      {(!home || selCount > 0) && (
        <div
          className={
            home
              ? "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-50 rounded-2xl border border-white/10 bg-bg/95 px-4 py-3 shadow-lg backdrop-blur"
              : "fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-bg/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur"
          }
        >
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-bold text-ink">
                {t("card.selectedCount", { count: selCount })}
              </div>
              <div className="text-xs text-ink-muted">
                {t("card.total")}:{" "}
                <span className="font-bold text-neon-gold">{money(totalCost)}</span>
              </div>
            </div>
            <Button
              variant="gold"
              loading={joining}
              disabled={selCount === 0}
              onClick={confirm}
              className="min-w-[8rem]"
            >
              {selCount > 1
                ? t("card.joinN", { n: selCount, bet: money(totalCost) })
                : t("card.join", { bet: money(totalCost) })}
            </Button>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}

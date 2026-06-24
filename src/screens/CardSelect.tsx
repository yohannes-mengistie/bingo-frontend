import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { FullSpinner } from "@/components/ui/Spinner";
import {
  MAX_CARD_ID,
  MIN_CARD_ID,
  BET_BY_TYPE,
  MAX_CARDS_PER_PLAYER,
} from "@/lib/constants";
import { money } from "@/lib/format";
import { api, ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";
import { useWallet } from "@/store/walletStore";
import type { GameType } from "@/types/api";

const ALL_CARDS = Array.from({ length: MAX_CARD_ID - MIN_CARD_ID + 1 }, (_, i) => i + MIN_CARD_ID);

export function CardSelect() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { gameType } = useParams<{ gameType: GameType }>();
  const type = (gameType ?? "REGULAR") as GameType;
  const bet = BET_BY_TYPE[type] ?? 0;
  const balance = useWallet((s) => s.balance);
  const push = useToast((s) => s.push);

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
        haptic.notify("success");
        nav(`/game/${gameId}`, { state: { cardId: firstCard ?? undefined } });
      }
    } finally {
      setJoining(false);
    }
  };

  if (gameQ.isLoading) {
    return (
      <ScreenShell tabs={false}>
        <Header back title={`${type} · ${money(bet)}`} />
        <FullSpinner label={t("common.loading")} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell tabs={false}>
      <Header
        back
        title={
          <span>
            {money(bet)}{" "}
            <span className="text-sm text-ink-faint">{`· ${type}`}</span>
          </span>
        }
      />
      <p className="mb-1 text-sm text-ink-muted">
        {t("card.titleMulti", { max: MAX_CARDS_PER_PLAYER })}
      </p>
      <p className="mb-3 text-xs text-ink-faint">
        {t("card.capHint", { count: totalCards, max: MAX_CARDS_PER_PLAYER })}
      </p>

      {/* Extra bottom padding so the last row clears the sticky action bar. */}
      <div className="grid grid-cols-6 gap-1.5 pb-28 sm:grid-cols-8">
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

      {/* Sticky action bar: running count + total cost + join. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-bg/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
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
    </ScreenShell>
  );
}

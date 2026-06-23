import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { BingoCardView } from "@/components/bingo/BingoCard";
import { useToast } from "@/components/ui/Toast";
import { FullSpinner } from "@/components/ui/Spinner";
import { MAX_CARD_ID, MIN_CARD_ID, BET_BY_TYPE } from "@/lib/constants";
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
  const type = (gameType ?? "G1") as GameType;
  const bet = BET_BY_TYPE[type] ?? 0;
  const balance = useWallet((s) => s.balance);
  const push = useToast((s) => s.push);

  const [selected, setSelected] = useState<number | null>(null);
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

  // Preview card data for the selected id.
  const previewQ = useQuery({
    queryKey: ["card", selected],
    queryFn: () => api.card(selected!),
    enabled: selected !== null,
  });

  // Telegram MainButton mirrors the confirm action.
  useEffect(() => {
    // (kept simple: in-app button is the primary CTA; MainButton optional)
  }, [selected]);

  const confirm = async () => {
    if (selected === null) return;
    haptic.impact("heavy");

    if (balance() < bet) {
      push(t("card.insufficient"), "error");
      return;
    }
    if (!gameId) return;

    setJoining(true);
    try {
      // Join is idempotent: if we're already in this game (e.g. reconnecting),
      // the backend returns our existing player. Trust the card it gives back
      // rather than the tapped id, since our card can't change mid-game.
      const { player } = await api.join(gameId, selected);
      haptic.notify("success");
      nav(`/game/${gameId}`, { state: { cardId: player.card_id } });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "error";
      push(msg === "insufficient balance" ? t("card.insufficient") : msg, "error");
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
      <p className="mb-3 text-sm text-ink-muted">{t("card.title")}</p>

      {/* Cards flow with the page (the whole screen scrolls, like Lobby/Wallet)
          rather than a fragile nested scroll box. */}
      <div className="grid grid-cols-6 gap-1.5 pb-6 sm:grid-cols-8">
        {ALL_CARDS.map((id) => {
          const isTaken = taken.has(id);
          const isSel = selected === id;
          return (
            <button
              key={id}
              disabled={isTaken}
              onClick={() => {
                haptic.select();
                setSelected(id);
              }}
              className={[
                "flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition-colors",
                isSel
                  ? "bg-grad-gold text-bg ring-2 ring-white"
                  : isTaken
                    ? "cursor-not-allowed bg-white/5 text-ink-faint/40 line-through"
                    : "bg-bg-card text-ink hover:bg-white/10",
              ].join(" ")}
            >
              {id}
            </button>
          );
        })}
      </div>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={t("card.selectId", { id: selected ?? "" })}
      >
        {previewQ.data?.card ? (
          <BingoCardView card={previewQ.data.card} />
        ) : (
          <FullSpinner />
        )}
        <Button
          variant="gold"
          fullWidth
          loading={joining}
          onClick={confirm}
          className="mt-4"
        >
          {t("card.join", { bet: money(bet) })}
        </Button>
      </Sheet>
    </ScreenShell>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { BingoCardView } from "@/components/bingo/BingoCard";
import { api } from "@/lib/api";
import { winnerMarks } from "@/lib/bingo";
import type { BingoCard } from "@/types/api";

/**
 * Shows the winner's card with the exact cells they marked, so every player in
 * the game can verify the win is legitimate after it ends. The card is fetched
 * by id; `marked` are the actual card NUMBERS the winner daubed (the WINNER
 * event payload), which we map back to board positions for highlighting. The
 * winning line is recomputed locally and spotlighted in green.
 */
export function WinnerCardModal({
  open,
  onClose,
  cardId,
  marked,
  drawn,
  winnerName,
}: {
  open: boolean;
  onClose: () => void;
  cardId: number;
  marked: number[];
  /** All numbers called this game — for context (called-but-unmarked cells). */
  drawn?: Set<number>;
  winnerName: string;
}) {
  const { t } = useTranslation();
  const [card, setCard] = useState<BingoCard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCard(null);
    setError(false);
    api
      .card(cardId)
      .then((r) => !cancelled && setCard(r.card))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [open, cardId]);

  // Map the winner's marked numbers to board positions (0-24), then recompute
  // the winning line from those positions.
  const { daubed, winLine } = useMemo(() => {
    if (!card) return { daubed: new Set<number>(), winLine: null as number[] | null };
    const { positions, winLine } = winnerMarks(card, marked);
    return { daubed: positions, winLine };
  }, [card, marked]);

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="font-display text-xl font-extrabold">
        🏆 {t("result.winnerCardTitle")}
      </h2>
      <p className="mt-0.5 text-sm text-ink-faint">
        {t("result.winnerCardSub", { name: winnerName })}
      </p>

      <div className="mt-4">
        {error ? (
          <p className="py-8 text-sm text-neon-red">{t("result.cardLoadError")}</p>
        ) : !card ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Spinner size={36} />
            <p className="text-sm text-ink-muted">{t("common.loading")}</p>
          </div>
        ) : (
          <>
            <BingoCardView card={card} daubed={daubed} drawn={drawn} winLine={winLine} />
            <div
              className={[
                "mt-3 rounded-xl px-3 py-2 text-sm font-semibold",
                winLine
                  ? "border border-neon-green/30 bg-neon-green/10 text-neon-green"
                  : "border border-neon-red/30 bg-neon-red/10 text-neon-red",
              ].join(" ")}
            >
              {winLine ? `✓ ${t("result.validLine")}` : `⚠ ${t("result.noLine")}`}
            </div>
          </>
        )}
      </div>

      <div className="mt-5">
        <Button variant="gold" fullWidth onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    </Modal>
  );
}

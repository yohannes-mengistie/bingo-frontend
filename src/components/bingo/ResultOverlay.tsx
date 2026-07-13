import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import confetti from "canvas-confetti";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { WinnerCardModal } from "@/components/bingo/WinnerCardModal";
import { money } from "@/lib/format";
import { shareToTelegram, haptic } from "@/lib/telegram";

export type GameResult =
  | { type: "win"; prize: number }
  | { type: "lose" }
  | { type: "eliminated" }
  | { type: "cancelled" }
  | null;

/** One winner on the result screen (its owner, split share, and marks). */
export interface WinnerEntry {
  userId?: string;
  name: string;
  prize: number;
  /** Winner's card id + the numbers they marked — lets anyone verify the win. */
  cardId?: number;
  marked?: number[];
}

export interface WinnerInfo {
  /** Every winning card. More than one means the pot was split. */
  winners: WinnerEntry[];
  /** True when there are multiple co-winners sharing the pot. */
  split: boolean;
  /** The full pot before splitting (for context). */
  prizePool?: number;
}

export function ResultOverlay({
  result,
  winner,
  drawn,
  onPlayAgain,
}: {
  result: GameResult;
  /** Who won this game — shown to everyone (losers/eliminated) for transparency. */
  winner?: WinnerInfo | null;
  /** All numbers called this game — passed through for winner-card context. */
  drawn?: Set<number>;
  onPlayAgain: () => void;
}) {
  const { t } = useTranslation();
  // The winner whose card is currently open for inspection (null = closed).
  const [selected, setSelected] = useState<WinnerEntry | null>(null);
  const isWin = result?.type === "win";

  const winners = winner?.winners ?? [];
  const split = !!winner?.split && winners.length > 1;
  const showWinners = winners.length > 0 && result?.type !== "cancelled";
  // Winners whose card can be inspected (we know the card id + marks).
  const firstVerifiable = winners.find(
    (w) => typeof w.cardId === "number" && !!w.marked,
  );

  useEffect(() => {
    if (isWin) {
      haptic.notify("success");
      const end = Date.now() + 1200;
      const frame = () => {
        confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0 } });
        confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1 } });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    } else if (result) {
      haptic.notify("error");
    }
  }, [isWin, result]);

  const bot = import.meta.env.VITE_BOT_USERNAME ?? "Habtam_bingobot";
  const prize = result?.type === "win" ? result.prize : 0;

  // Reveal the primary winner's card to EVERYONE automatically the moment
  // results land (no tap), so anyone can verify the win. Any winner's card can
  // then be opened from the list below.
  useEffect(() => {
    if (result && result.type !== "cancelled" && firstVerifiable) {
      setSelected(firstVerifiable);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, winners.length]);

  return (
    <>
    <Modal open={!!result}>
      <div className="text-6xl">
        {isWin
          ? "🏆"
          : result?.type === "eliminated"
            ? "❌"
            : result?.type === "cancelled"
              ? "↩️"
              : "🎲"}
      </div>
      <h2 className="mt-3 font-display text-2xl font-extrabold">
        {isWin
          ? t("result.winTitle")
          : result?.type === "eliminated"
            ? t("result.eliminatedTitle")
            : result?.type === "cancelled"
              ? t("result.cancelledTitle")
              : t("result.loseTitle")}
      </h2>
      {isWin && (
        <>
          <p className="mt-1 text-lg font-bold text-neon-gold">
            {t("result.wonAmount", { amount: money(prize) })}
          </p>
          {split && (
            <p className="mt-0.5 text-xs text-ink-faint">
              {t("result.potSplit", { n: winners.length })}
            </p>
          )}
        </>
      )}
      {result?.type === "cancelled" && (
        <p className="mt-1 text-sm text-ink-faint">{t("result.cancelledBody")}</p>
      )}
      {showWinners && (
        <div className="mt-4 w-full rounded-xl border border-neon-gold/30 bg-neon-gold/10 px-3 py-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">
            {split
              ? t("result.winnersLabel", { n: winners.length })
              : t("result.winnerLabel")}
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {winners.map((w, i) => {
              const canView = typeof w.cardId === "number" && !!w.marked;
              return (
                <li
                  key={(w.userId ?? "") + i}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-bold text-neon-gold">
                      🏆 {w.name}
                    </div>
                    <div className="text-xs font-semibold text-neon-gold">
                      {t("result.prizeWon", { amount: money(w.prize) })}
                    </div>
                  </div>
                  {canView && (
                    <button
                      onClick={() => setSelected(w)}
                      className="shrink-0 rounded-lg border border-neon-gold/30 bg-neon-gold/10 px-2.5 py-1 text-xs font-bold text-neon-gold"
                    >
                      🔍 {t("result.viewCard")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="mt-5 flex flex-col gap-2">
        {isWin && (
          <Button
            variant="cyan"
            onClick={() =>
              shareToTelegram(
                `https://t.me/${bot}`,
                t("result.shareText", { amount: money(prize) }),
              )
            }
          >
            🔗 {t("result.share")}
          </Button>
        )}
        <Button variant="gold" onClick={onPlayAgain}>
          {t("result.playAgain")}
        </Button>
      </div>
    </Modal>

    {selected && typeof selected.cardId === "number" && selected.marked && (
      <WinnerCardModal
        open={!!selected}
        onClose={() => setSelected(null)}
        cardId={selected.cardId}
        marked={selected.marked}
        drawn={drawn}
        winnerName={selected.name}
      />
    )}
    </>
  );
}

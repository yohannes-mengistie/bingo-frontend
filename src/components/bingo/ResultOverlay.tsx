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

export interface WinnerInfo {
  name: string;
  prize: number;
  /** Winner's card id + the numbers they marked — lets anyone verify the win. */
  cardId?: number;
  marked?: number[];
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
  const [showWinnerCard, setShowWinnerCard] = useState(false);
  const isWin = result?.type === "win";
  const showWinnerBanner =
    !!winner && (result?.type === "lose" || result?.type === "eliminated");

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

  const bot = import.meta.env.VITE_BOT_USERNAME ?? "HubBingoBot";
  const prize = result?.type === "win" ? result.prize : 0;

  // Anyone in a finished game can inspect the winner's card to confirm the
  // marks form a real bingo. Available once we know the winner's card.
  const canVerify =
    !!winner &&
    typeof winner.cardId === "number" &&
    !!winner.marked &&
    result?.type !== "cancelled";

  // Reveal the winner's card to EVERYONE automatically the moment the win lands
  // (no tap). Fires once when the card data first arrives; if the player closes
  // it, it stays closed — they can reopen via the button below.
  useEffect(() => {
    if (canVerify) setShowWinnerCard(true);
  }, [canVerify]);

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
        <p className="mt-1 text-lg font-bold text-neon-gold">
          {t("result.wonAmount", { amount: money(prize) })}
        </p>
      )}
      {result?.type === "cancelled" && (
        <p className="mt-1 text-sm text-ink-faint">{t("result.cancelledBody")}</p>
      )}
      {showWinnerBanner && winner && (
        <div className="mt-4 w-full rounded-xl border border-neon-gold/30 bg-neon-gold/10 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">
            {t("result.winnerLabel")}
          </div>
          <div className="mt-0.5 font-display text-base font-bold text-neon-gold">
            🏆 {winner.name}
          </div>
          <div className="text-sm font-semibold text-neon-gold">
            {t("result.prizeWon", { amount: money(winner.prize) })}
          </div>
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
        {canVerify && (
          <Button variant="ghost" onClick={() => setShowWinnerCard(true)}>
            🔍 {t("result.viewWinnerCard")}
          </Button>
        )}
        <Button variant="gold" onClick={onPlayAgain}>
          {t("result.playAgain")}
        </Button>
      </div>
    </Modal>

    {canVerify && winner && (
      <WinnerCardModal
        open={showWinnerCard}
        onClose={() => setShowWinnerCard(false)}
        cardId={winner.cardId!}
        marked={winner.marked!}
        drawn={drawn}
        winnerName={winner.name}
      />
    )}
    </>
  );
}

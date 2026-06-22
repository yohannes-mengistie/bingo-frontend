import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import confetti from "canvas-confetti";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
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
}

export function ResultOverlay({
  result,
  winner,
  onPlayAgain,
}: {
  result: GameResult;
  /** Who won this game — shown to everyone (losers/eliminated) for transparency. */
  winner?: WinnerInfo | null;
  onPlayAgain: () => void;
}) {
  const { t } = useTranslation();
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

  return (
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
        <Button variant="gold" onClick={onPlayAgain}>
          {t("result.playAgain")}
        </Button>
      </div>
    </Modal>
  );
}

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
  | null;

export function ResultOverlay({
  result,
  onPlayAgain,
}: {
  result: GameResult;
  onPlayAgain: () => void;
}) {
  const { t } = useTranslation();
  const isWin = result?.type === "win";

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
        {isWin ? "🏆" : result?.type === "eliminated" ? "❌" : "🎲"}
      </div>
      <h2 className="mt-3 font-display text-2xl font-extrabold">
        {isWin
          ? t("result.winTitle")
          : result?.type === "eliminated"
            ? t("result.eliminatedTitle")
            : t("result.loseTitle")}
      </h2>
      {isWin && (
        <p className="mt-1 text-lg font-bold text-neon-gold">
          {t("result.wonAmount", { amount: money(prize) })}
        </p>
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

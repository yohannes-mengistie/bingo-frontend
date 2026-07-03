import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveGame } from "@/lib/activeGame";
import { money } from "@/lib/format";
import { haptic } from "@/lib/telegram";

// A floating "return to your live game" pill shown on the tabbed screens
// (wallet, profile, referral, leaderboard) so a player who wandered off after
// joining is never more than one tap from the live draw. The lobby has its own
// inline resume banner, and the game room / card picker are hidden below.
export function LiveGamePill() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const activeGame = useActiveGame();

  // Hide where a return affordance already exists or would be redundant: the
  // lobby (inline banner), the game room itself, and the card picker.
  const hiddenHere =
    pathname === "/" ||
    pathname.startsWith("/game") ||
    pathname.startsWith("/play");

  const show = !!activeGame && !hiddenHere;

  return (
    <AnimatePresence>
      {show && activeGame && (
        <motion.button
          key="live-game-pill"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          onClick={() => {
            haptic.impact("medium");
            nav(`/game/${activeGame.id}`);
          }}
          // Sits above the sticky tab bar; centered and width-capped like the
          // app's other bottom-anchored bars.
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-40 mx-auto flex w-[calc(100%-1.5rem)] max-w-md items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-2.5 text-left shadow-lg shadow-black/30 transition-colors duration-150 hover:bg-accent-active"
        >
          <span className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon-red" />
            </span>
            <span className="font-display text-sm font-bold text-white">
              {t("lobby.resume")}
            </span>
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white">
            {activeGame.game_type} · {money(activeGame.bet_amount)}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

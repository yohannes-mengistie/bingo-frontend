import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  useActiveGame,
  useActiveGameLiveRefresh,
  useRefreshWalletOnGameEnd,
} from "@/lib/activeGame";
import { money } from "@/lib/format";
import { haptic } from "@/lib/telegram";

// A floating "return to your live game" pill shown on every tabbed screen —
// including the lobby — so a player who wandered off (or whose game moved into
// the draw, where the lobby's open-game card no longer reaches it) is always
// one tap from the live draw. It's the single, consistent way back.
export function LiveGamePill() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const activeGame = useActiveGame();
  // Keep the balance current the moment that live game ends, even if the player
  // wandered off the game socket. Real-time via a spectator socket (0s), with a
  // poll-based safety net.
  useActiveGameLiveRefresh(activeGame);
  useRefreshWalletOnGameEnd(activeGame);

  // Hide only where it would be redundant: inside the game room itself, and on
  // the card picker (which has its own "Resume" button in the header).
  const hiddenHere =
    pathname.startsWith("/game") || pathname.startsWith("/play");

  const show = !!activeGame && !hiddenHere;

  return (
    <AnimatePresence>
      {show && activeGame && (
        <motion.button
          key="live-game-pill"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          aria-label={`${t("lobby.resume")} — ${t("lobby.resumeHint")}`}
          onClick={() => {
            haptic.impact("medium");
            nav(`/game/${activeGame.id}`);
          }}
          // Sits above the sticky tab bar; centered and width-capped like the
          // app's other bottom-anchored bars. The offset clears the tab bar
          // (~5.35rem tall incl. its mb-3) plus a gap so they don't overlap.
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-40 mx-auto flex w-[calc(100%-1.5rem)] max-w-md items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-2.5 text-left shadow-lg shadow-black/30 transition-colors duration-150 hover:bg-accent-active"
        >
          <span className="flex items-center gap-2.5">
            {/* Play button wrapped in an outward "live" pulse ring — the one
                clear focal point that reads as "live right now, tap to return". */}
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
              <span className="absolute inset-0 animate-ping rounded-full bg-white/25" />
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="relative ml-0.5 h-4 w-4 text-white"
                aria-hidden="true"
              >
                <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
              </svg>
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

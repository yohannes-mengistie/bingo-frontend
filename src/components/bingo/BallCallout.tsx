import { AnimatePresence, motion } from "framer-motion";
import { letterForNumber } from "@/lib/bingo";

const LETTER_COLOR: Record<string, string> = {
  B: "from-neon-cyan to-blue-500",
  I: "from-neon-blue to-blue-600",
  N: "from-neon-pink to-rose-500",
  G: "from-neon-green to-emerald-500",
  O: "from-neon-gold to-amber-500",
};

/** The big animated "ball" showing the current called number. */
export function BallCallout({ number }: { number: number | null }) {
  const letter = number ? letterForNumber(number) : "";
  return (
    <div className="flex size-20 shrink-0 items-center justify-center">
      <AnimatePresence mode="popLayout">
        {number ? (
          <motion.div
            key={number}
            initial={{ scale: 0.3, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 280 }}
            className={`relative flex size-20 flex-col items-center justify-center rounded-full bg-gradient-to-br ${LETTER_COLOR[letter] ?? "from-neon-cyan to-neon-blue"}`}
          >
            <span className="absolute inset-1 rounded-full ring-2 ring-white/30" />
            <span className="font-display text-sm font-bold leading-none text-white/90">{letter}</span>
            <span className="font-display text-3xl font-extrabold leading-none text-white">
              {number}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            className="flex size-20 items-center justify-center rounded-full bg-white/5 text-3xl"
          >
            🎱
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

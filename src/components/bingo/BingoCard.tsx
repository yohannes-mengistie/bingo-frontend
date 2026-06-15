import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LETTERS } from "@/lib/constants";
import { CENTER } from "@/lib/bingo";
import type { BingoCard as Card } from "@/types/api";

interface Props {
  card: Card;
  /** Positions (0-24) the player has daubed. */
  daubed?: Set<number>;
  /** Numbers that have been drawn (for highlighting daubable cells). */
  drawn?: Set<number>;
  /** Winning line positions to spotlight. */
  winLine?: number[] | null;
  /** Tap handler for daubing. Omit for read-only preview. */
  onDaub?: (pos: number) => void;
  size?: "sm" | "lg";
}

export function BingoCardView({ card, daubed, drawn, winLine, onDaub, size = "lg" }: Props) {
  const { t } = useTranslation();
  const winSet = new Set(winLine ?? []);
  const flat = card.numbers.flat();

  return (
    <div className={size === "lg" ? "w-full" : "w-44"}>
      <div className="mb-1 grid grid-cols-5 gap-1.5">
        {LETTERS.map((l, i) => (
          <div
            key={l}
            className="rounded-xl bg-grad-purple py-1 text-center font-display text-lg font-extrabold text-white"
            style={{ opacity: 0.9 + i * 0.02 }}
          >
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {flat.map((num, pos) => {
          const isCenter = pos === CENTER;
          const isDaubed = isCenter || daubed?.has(pos);
          const isDrawn = isCenter || (drawn?.has(num) ?? false);
          const inWin = winSet.has(pos);
          const tappable = !!onDaub && !isCenter;

          return (
            <motion.button
              key={pos}
              disabled={!tappable}
              onClick={() => tappable && onDaub?.(pos)}
              whileTap={tappable ? { scale: 0.88 } : undefined}
              animate={inWin ? { scale: [1, 1.12, 1] } : {}}
              transition={inWin ? { repeat: Infinity, duration: 1 } : {}}
              className={[
                "relative flex aspect-square items-center justify-center rounded-xl font-display font-bold",
                size === "lg" ? "text-lg" : "text-xs",
                isCenter
                  ? "bg-grad-gold text-bg"
                  : inWin
                    ? "bg-neon-green text-bg shadow-glow-cyan"
                    : isDaubed
                      ? "bg-grad-cyan text-white"
                      : isDrawn
                        ? "bg-neon-purple/25 text-ink ring-1 ring-neon-purple/60"
                        : "bg-white/5 text-ink-muted",
              ].join(" ")}
            >
              {isCenter ? (size === "lg" ? "★" : "★") : num}
              {isDaubed && !isCenter && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/70">
                  <span className="size-2 rounded-full bg-white/90" />
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      {size === "lg" && (
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          ★ = {t("card.free")}
        </p>
      )}
    </div>
  );
}

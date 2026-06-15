import { LETTERS, COLUMN_RANGES } from "@/lib/constants";

/** The 5x15 master board (B1..O75) with called numbers lit up. */
export function DrawnBoard({ drawn, last }: { drawn: Set<number>; last: number | null }) {
  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="flex min-w-max gap-1">
        {LETTERS.map((l) => {
          const [min, max] = COLUMN_RANGES[l];
          const nums: number[] = [];
          for (let n = min; n <= max; n++) nums.push(n);
          return (
            <div key={l} className="flex flex-col gap-0.5">
              <div className="text-center font-display text-xs font-bold text-neon-purple">
                {l}
              </div>
              {nums.map((n) => {
                const hit = drawn.has(n);
                const isLast = n === last;
                return (
                  <div
                    key={n}
                    className={[
                      "flex size-5 items-center justify-center rounded text-[9px] font-bold transition-colors",
                      isLast
                        ? "bg-neon-gold text-bg ring-1 ring-white animate-pulse-ring"
                        : hit
                          ? "bg-neon-purple/70 text-white"
                          : "bg-white/5 text-ink-faint",
                    ].join(" ")}
                  >
                    {n}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

/** Compact relative time, e.g. "now", "5m", "2h", "3d". */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Public feed of recent winners — visible to everyone in the lobby, so the
 *  house's payouts are transparent. */
export function RecentWinners() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["recent-winners"],
    queryFn: () => api.recentWinners(8),
    refetchInterval: 10000,
  });

  const winners = data?.winners ?? [];
  if (winners.length === 0) return null;

  return (
    <div className="mt-5">
      <h2 className="mb-2 font-display text-lg font-bold">
        🏆 {t("lobby.recentWinners")}
      </h2>
      <Card className="!p-1">
        <div className="flex flex-col divide-y divide-white/5">
          {winners.map((w) => (
            <div key={w.game_id} className="flex items-center justify-between px-2 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{w.winner_name}</div>
                <div className="text-[11px] text-ink-faint">
                  {w.game_type} · {timeAgo(w.finished_at)}
                </div>
              </div>
              <div className="shrink-0 font-display text-sm font-bold text-neon-gold">
                +{money(w.prize)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

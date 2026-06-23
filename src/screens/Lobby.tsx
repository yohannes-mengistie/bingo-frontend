import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { BalancePill } from "@/components/ui/BalancePill";
import { LangToggle } from "@/components/ui/LangToggle";
import { Card } from "@/components/ui/Card";
import { STAKES } from "@/lib/constants";
import { money } from "@/lib/format";
import { api } from "@/lib/api";
import { haptic } from "@/lib/telegram";
import type { Game, GameState, GameType } from "@/types/api";
import { PromoTicker } from "@/components/lobby/PromoTicker";
import { DailyStreak } from "@/components/lobby/DailyStreak";

export function Lobby() {
  const { t } = useTranslation();
  const nav = useNavigate();

  // Fetch all available games (no `type` → no game is auto-created).
  const { data } = useQuery({
    queryKey: ["games"],
    queryFn: () => api.games(),
    refetchInterval: 5000,
  });

  const byType = useMemo(() => groupByType(data?.games ?? []), [data]);

  // Detect a game the user is still in (e.g. they closed the app mid-game).
  // `api.games(type)` only returns WAITING/COUNTDOWN games, so once their game
  // is DRAWING the card picker can't lead back to it — this banner is the only
  // path back to the live draw.
  const { data: mine } = useQuery({
    queryKey: ["my-games"],
    queryFn: () => api.myGames(20, 0),
    refetchInterval: 5000,
  });
  const activeGame = useMemo(() => findActiveGame(mine?.games ?? []), [mine]);

  return (
    <ScreenShell>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold neon-text">
            {t("app.name")}
          </h1>
          <p className="text-xs text-neon-cyan">{t("app.tagline")}</p>
        </div>
        <LangToggle />
      </header>

      <div className="mb-3">
        <BalancePill />
      </div>

      {activeGame && (
        <motion.button
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => {
            haptic.impact("medium");
            nav(`/game/${activeGame.id}`);
          }}
          className="mb-3 w-full rounded-lg bg-accent px-4 py-3 text-left transition-colors duration-150 hover:bg-accent-active"
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold text-white">
              {t("lobby.resume")}
            </span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white">
              {activeGame.game_type} · {money(activeGame.bet_amount)}
            </span>
          </div>
        </motion.button>
      )}

      <PromoTicker />
      <DailyStreak />

      <div className="mb-2 mt-4 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">{t("lobby.chooseStake")}</h2>
        <span className="text-xs text-ink-faint">{t("lobby.higherBigger")}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {STAKES.map((s, i) => {
          const agg = byType[s.type];
          const live = (agg?.players ?? 0) > 0;
          return (
            <motion.button
              key={s.type}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => {
                haptic.impact("medium");
                nav(`/play/${s.type}`);
              }}
              className="text-left"
            >
              <Card className="relative overflow-hidden !p-3.5 active:scale-[0.97] transition-transform">
                <div className="absolute -right-6 -top-6 size-20 rounded-full bg-accent opacity-20 blur-xl" />
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl font-extrabold text-neon-gold">
                    {money(s.bet)}
                  </span>
                  {live ? (
                    <span className="flex items-center gap-1 rounded-full bg-neon-green/20 px-2 py-0.5 text-[10px] font-bold text-neon-green">
                      <span className="size-1.5 animate-pulse rounded-full bg-neon-green" />
                      {t("lobby.liveNow")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ink-faint">
                      {t("lobby.waiting")}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs text-ink-muted">
                  <span>
                    👥 {agg?.players ?? 0} {t("common.players")}
                  </span>
                  <span className="text-neon-cyan">
                    🏆 {money(agg?.prize ?? 0)}
                  </span>
                </div>
                <div className="mt-2.5 rounded-lg bg-accent py-2 text-center font-sans text-sm font-medium text-white">
                  {t("common.play")}
                </div>
              </Card>
            </motion.button>
          );
        })}
      </div>
    </ScreenShell>
  );
}

// The most recent game the user is still an active part of and that hasn't
// resolved yet — i.e. one they can rejoin. `myGames` is ordered newest-first.
function findActiveGame(entries: Array<{ game: Game; left_at?: string | null }>): Game | null {
  const live: GameState[] = ["WAITING", "COUNTDOWN", "DRAWING"];
  const entry = entries.find((e) => !e.left_at && live.includes(e.game.state));
  return entry?.game ?? null;
}

function groupByType(games: Game[]): Record<string, { players: number; prize: number }> {
  const out: Record<GameType, { players: number; prize: number }> = {} as any;
  for (const g of games) {
    const cur = out[g.game_type] ?? { players: 0, prize: 0 };
    cur.players += g.player_count;
    cur.prize = Math.max(cur.prize, g.prize_pool);
    out[g.game_type] = cur;
  }
  return out;
}

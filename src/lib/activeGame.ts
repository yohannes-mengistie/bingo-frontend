import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Game, GameState } from "@/types/api";

const LIVE_STATES: GameState[] = ["WAITING", "COUNTDOWN", "DRAWING"];

// The most recent game the user is still an active part of and that hasn't
// resolved yet — i.e. one they can rejoin. `myGames` is ordered newest-first.
export function findActiveGame(
  entries: Array<{ game: Game; left_at?: string | null }>,
): Game | null {
  const entry = entries.find(
    (e) => !e.left_at && LIVE_STATES.includes(e.game.state),
  );
  return entry?.game ?? null;
}

// Polls the user's games and surfaces the one live game they can return to.
// Shared by the lobby's resume banner and the persistent live-game pill; the
// shared query key means both consumers dedupe onto a single 5s poll.
export function useActiveGame(): Game | null {
  const { data } = useQuery({
    queryKey: ["my-games"],
    queryFn: () => api.myGames(20, 0),
    refetchInterval: 5000,
  });
  return useMemo(() => findActiveGame(data?.games ?? []), [data]);
}

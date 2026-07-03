import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Game, GameState } from "@/types/api";

const LIVE_STATES: GameState[] = ["WAITING", "COUNTDOWN", "DRAWING"];

// The most recent game the user is still an active part of and that hasn't
// resolved yet — i.e. one they can rejoin. `myGames` is ordered newest-first.
//
// Defensive on shape: each entry is normally nested `{ game: {...}, left_at }`,
// but we also tolerate a flat game object (some callers/older payloads), so a
// shape quirk can never silently hide the return-to-game pill.
export function findActiveGame(entries: any[]): Game | null {
  for (const e of entries ?? []) {
    const g: Game | undefined = e?.game ?? e;
    if (!g || !g.state) continue;
    const left = e?.left_at ?? e?.leftAt;
    if (left) continue;
    if (LIVE_STATES.includes(g.state)) return g;
  }
  return null;
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

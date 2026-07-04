import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Game } from "@/types/api";

// Polls the purpose-built /me/active-game endpoint and surfaces the one live
// game the user can return to. This single-row lookup replaces scanning
// paginated history: it can't be thrown off by the pagination window or by
// payload-shape drift, so the return-to-game pill stays reliable.
//
// Note the endpoint nests the live Game under `game.game` (the outer object is
// the participation entry). We stay defensive on shape — tolerating both the
// nested and a flat game — so a backend response quirk can never silently hide
// the pill.
export function useActiveGame(): Game | null {
  const { data } = useQuery({
    queryKey: ["active-game"],
    queryFn: () => api.activeGame(),
    refetchInterval: 5000,
  });
  return useMemo(() => {
    const entry: any = data?.game ?? null;
    if (!entry) return null;
    const g: Game | undefined = entry?.game ?? entry;
    return g && g.state ? g : null;
  }, [data]);
}

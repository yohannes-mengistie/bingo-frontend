import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Game, type GameState } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, Spinner, ErrorNote, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { birr, date, shortId } from "@/lib/format";

type TabKey = "all" | "active" | GameState;

// "active" is a virtual tab: games that are still in play (no single state filter),
// so we fetch all and filter client-side.
const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "Active / Live" },
  { key: "all", label: "All" },
  { key: "WAITING", label: "Waiting" },
  { key: "COUNTDOWN", label: "Countdown" },
  { key: "DRAWING", label: "Drawing" },
  { key: "FINISHED", label: "Finished" },
  { key: "CANCELLED", label: "Cancelled" },
];

const ACTIVE_STATES: GameState[] = ["WAITING", "COUNTDOWN", "DRAWING"];

export function isCancellable(state: GameState): boolean {
  return ACTIVE_STATES.includes(state);
}

export function stateTone(s: GameState): string {
  switch (s) {
    case "DRAWING":
      return "green";
    case "COUNTDOWN":
      return "yellow";
    case "WAITING":
      return "blue";
    case "FINISHED":
      return "purple";
    case "CANCELLED":
    case "CLOSED":
      return "red";
    default:
      return "neutral";
  }
}

export function Games() {
  const [tab, setTab] = useState<TabKey>("active");
  const push = useToast((s) => s.push);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stateFilter: GameState | undefined =
    tab === "all" || tab === "active" ? undefined : tab;

  const { data, loading, error, reload } = useApi(
    () => api.games({ state: stateFilter, limit: 100 }),
    [tab],
  );

  let rows: Game[] = data?.games ?? [];
  if (tab === "active") rows = rows.filter((g) => isCancellable(g.state));

  const cancel = async (g: Game) => {
    const ok = window.confirm(
      `Cancel ${g.game_type} game and refund all ${g.player_count} player(s) ${birr(
        g.bet_amount,
      )} each?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setBusyId(g.id);
    try {
      const res = await api.cancelGame(g.id);
      push(
        `Cancelled — refunded ${res.refunded_count} player(s) ${birr(res.refunded_amount)} total`,
        "success",
      );
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Cancel failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Games</h1>
      <p className="mb-5 text-sm text-slate-400">
        Monitor live games and force-cancel a stuck one to refund every player's stake.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key ? "bg-brand text-ink" : "bg-panel2 text-slate-300 hover:bg-edge"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {loading && <Spinner />}
        {error && (
          <div className="p-4">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        )}
        {!loading && !error && rows.length === 0 && <EmptyState message="No games here." />}
        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Game</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Players</th>
                  <th className="px-4 py-3">Stake</th>
                  <th className="px-4 py-3">Prize pool</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id} className="border-b border-edge/50 hover:bg-panel2/40">
                    <td className="px-4 py-3">
                      <Link to={`/games/${g.id}`} className="font-medium text-sky-300 hover:underline">
                        {g.game_type}
                      </Link>
                      <div className="text-xs text-slate-500">{shortId(g.id)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={stateTone(g.state)}>{g.state}</Badge>
                    </td>
                    <td className="px-4 py-3">{g.player_count}</td>
                    <td className="px-4 py-3 text-slate-400">{birr(g.bet_amount)}</td>
                    <td className="px-4 py-3 font-semibold">{birr(g.prize_pool)}</td>
                    <td className="px-4 py-3 text-slate-400">{date(g.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link to={`/games/${g.id}`}>
                          <Button variant="ghost">View</Button>
                        </Link>
                        {isCancellable(g.state) ? (
                          <Button variant="danger" disabled={busyId === g.id} onClick={() => cancel(g)}>
                            Cancel & refund
                          </Button>
                        ) : (
                          <span className="self-center text-xs text-slate-600">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

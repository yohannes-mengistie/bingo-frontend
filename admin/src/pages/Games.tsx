import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Game, type GameState } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import {
  Card,
  Table,
  thClass,
  tdClass,
  trClass,
  Tabs,
  StatusBadge,
  IconButton,
  Skeleton,
  ErrorNote,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { birr, date, shortId, statusTone } from "@/lib/format";

type TabKey = "all" | "active" | GameState;

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

export function Games() {
  const [tab, setTab] = useState<TabKey>("active");
  const push = useToast((s) => s.push);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const stateFilter: GameState | undefined = tab === "all" || tab === "active" ? undefined : tab;

  const { data, loading, error, reload, updatedAt } = usePolling(
    () => api.games({ state: stateFilter, limit: 100 }),
    [tab],
    6000,
  );

  let rows: Game[] = data?.games ?? [];
  if (tab === "active") rows = rows.filter((g) => isCancellable(g.state));

  const cancel = async (g: Game) => {
    if (
      !(await confirm({
        title: `Cancel ${g.game_type} game?`,
        message: `Refunds ${g.player_count} player(s) their ${birr(g.bet_amount)} stake. This cannot be undone.`,
        confirmLabel: "Cancel & refund",
        danger: true,
      }))
    )
      return;
    setBusyId(g.id);
    try {
      const res = await api.cancelGame(g.id);
      push(
        `Cancelled — refunded ${res.refunded_count} player(s), ${birr(res.refunded_amount)} total`,
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
      <PageHeader
        title="Games"
        subtitle="Live and historical rounds"
        updatedAt={updatedAt}
        onReload={reload}
      />

      <Card className="p-0">
        <div className="border-b border-edgeSoft p-4">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>

        {loading && !data ? (
          <Skeleton />
        ) : error && !data ? (
          <div className="p-4">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="No games here." icon="games" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thClass}>Game</th>
                <th className={thClass}>State</th>
                <th className={`${thClass} text-right`}>Players</th>
                <th className={`${thClass} text-right`}>Stake</th>
                <th className={`${thClass} text-right`}>Prize pool</th>
                <th className={thClass}>Created</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} className={trClass}>
                  <td className={tdClass}>
                    <Link to={`/games/${g.id}`} className="font-medium text-txt hover:text-brand">
                      {g.game_type}
                    </Link>
                    <div className="font-mono text-xs text-txt-4">{shortId(g.id)}</div>
                  </td>
                  <td className={tdClass}>
                    <StatusBadge value={g.state} tone={statusTone(g.state)} />
                  </td>
                  <td className={`${tdClass} text-right tabular-nums text-txt-2`}>{g.player_count}</td>
                  <td className={`${tdClass} text-right tabular-nums text-txt-2`}>{birr(g.bet_amount)}</td>
                  <td className={`${tdClass} text-right font-semibold tabular-nums text-txt`}>
                    {birr(g.prize_pool)}
                  </td>
                  <td className={`${tdClass} text-txt-3`}>{date(g.created_at)}</td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex justify-end gap-2">
                      <IconButton icon="eye" title="View round" onClick={() => navigate(`/games/${g.id}`)} />
                      {isCancellable(g.state) ? (
                        <IconButton
                          icon="stop"
                          tone="red"
                          title="Cancel & refund"
                          loading={busyId === g.id}
                          onClick={() => cancel(g)}
                        />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center text-txt-4">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

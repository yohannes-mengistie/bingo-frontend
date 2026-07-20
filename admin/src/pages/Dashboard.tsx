import { api } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { Card, Spinner, ErrorNote, StatCard, PageHeader, EmptyState } from "@/components/ui";
import { birr } from "@/lib/format";

export function Dashboard() {
  const { data, loading, error, reload, updatedAt } = usePolling(() => api.dashboard(), [], 10000);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="A live snapshot of your operation"
        updatedAt={updatedAt}
        onReload={reload}
      />

      {loading && !data && <Spinner />}
      {error && !data && <ErrorNote message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon="wallet"
              tone="green"
              label="Wallet balance (real)"
              value={birr(data.total_balance)}
              sub="Total held across players"
            />
            <StatCard
              icon="coins"
              tone="gold"
              label="House cut (revenue)"
              value={birr(data.total_house_cut)}
              sub="Lifetime commission earned"
            />
            <StatCard
              icon="users"
              tone="blue"
              label="Registered players"
              value={data.total_users.toLocaleString()}
              sub={`${data.total_transactions.toLocaleString()} transactions`}
            />
            <StatCard
              icon={data.pending_deposits + data.pending_withdrawals > 0 ? "clock" : "check"}
              tone={data.pending_deposits + data.pending_withdrawals > 0 ? "red" : "green"}
              label="Pending approvals"
              value={data.pending_deposits + data.pending_withdrawals}
              sub={`${data.pending_deposits} deposits · ${data.pending_withdrawals} withdrawals`}
            />
          </div>

          {/* Real-player P&L — a wide highlight card */}
          <Card className="mt-4 flex flex-col gap-1 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-medium text-txt-3">Real-player game P&amp;L</div>
              <div
                className={`mt-1 text-3xl font-bold tabular-nums ${
                  data.real_player_game_pnl < 0 ? "text-danger" : "text-success"
                }`}
              >
                {data.real_player_game_pnl < 0 ? "−" : "+"}
                {birr(Math.abs(data.real_player_game_pnl))}
              </div>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-txt-3">
              Real stakes minus real winnings, with bots excluded. Positive means the house is
              ahead; negative means real cash was paid out beyond stakes — exposure from
              bot-inflated pools.
            </p>
          </Card>

          <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wider text-txt-4">
            Games by type
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(data.games_by_type ?? {}).length === 0 ? (
              <Card className="col-span-full p-0">
                <EmptyState message="No games yet." icon="games" />
              </Card>
            ) : (
              Object.entries(data.games_by_type).map(([type, count]) => (
                <Card key={type} className="p-4">
                  <div className="text-xs text-txt-3">{type}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-txt">{count}</div>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

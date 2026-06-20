import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, Spinner, ErrorNote } from "@/components/ui";
import { birr } from "@/lib/format";

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${accent ?? "text-slate-100"}`}>{value}</div>
    </Card>
  );
}

export function Dashboard() {
  const { data, loading, error, reload } = useApi(() => api.dashboard(), []);

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">Dashboard</h1>
      {loading && <Spinner />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Pending Deposits" value={String(data.pending_deposits)} accent="text-amber-300" />
            <Stat label="Pending Withdrawals" value={String(data.pending_withdrawals)} accent="text-amber-300" />
            <Stat label="Total Users" value={String(data.total_users)} />
            <Stat label="Total Transactions" value={String(data.total_transactions)} />
            <Stat label="Total Wallet Balance" value={birr(data.total_balance)} accent="text-emerald-300" />
            <Stat label="House Cut (Revenue)" value={birr(data.total_house_cut)} accent="text-brand" />
          </div>

          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Games by Type
          </h2>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-7">
            {Object.entries(data.games_by_type ?? {}).length === 0 && (
              <div className="text-sm text-slate-500">No games yet.</div>
            )}
            {Object.entries(data.games_by_type ?? {}).map(([type, count]) => (
              <Card key={type} className="text-center">
                <div className="text-xs text-slate-400">{type}</div>
                <div className="mt-1 text-lg font-bold">{count}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

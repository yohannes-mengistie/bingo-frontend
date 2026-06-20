import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Transaction, type TxStatus, type TxType } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, Spinner, ErrorNote, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { birr, date, shortId } from "@/lib/format";

type TabKey =
  | "pendingDeposits"
  | "pendingWithdrawals"
  | "all"
  | "completedDeposits"
  | "completedWithdrawals"
  | "transfers"
  | "failed";

const TABS: { key: TabKey; label: string; fetch: () => Promise<{ transactions: Transaction[] }> }[] = [
  { key: "pendingDeposits", label: "Pending Deposits", fetch: api.pendingDeposits },
  { key: "pendingWithdrawals", label: "Pending Withdrawals", fetch: api.pendingWithdrawals },
  { key: "all", label: "All", fetch: () => api.transactions(100, 0) },
  { key: "completedDeposits", label: "Completed Deposits", fetch: api.completedDeposits },
  { key: "completedWithdrawals", label: "Completed Withdrawals", fetch: api.completedWithdrawals },
  { key: "transfers", label: "Transfers", fetch: api.transfers },
  { key: "failed", label: "Failed", fetch: api.failed },
];

function statusTone(s: TxStatus): string {
  return s === "completed" ? "green" : s === "pending" ? "yellow" : s === "failed" ? "red" : "neutral";
}
function typeTone(t: TxType): string {
  return t === "deposit" ? "blue" : t === "withdraw" ? "purple" : "neutral";
}

export function Transactions() {
  const [tab, setTab] = useState<TabKey>("pendingDeposits");
  const active = TABS.find((t) => t.key === tab)!;
  const { data, loading, error, reload } = useApi(() => active.fetch(), [tab]);
  const push = useToast((s) => s.push);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, fn: (id: string) => Promise<unknown>, label: string) => {
    setBusyId(id);
    try {
      await fn(id);
      push(`${label} done`, "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : `${label} failed`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const rows = data?.transactions ?? [];

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">Transactions</h1>

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
        {!loading && !error && rows.length === 0 && <EmptyState message="No transactions here." />}
        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-edge/50 hover:bg-panel2/40">
                    <td className="px-4 py-3">
                      <Link to={`/users/${t.user_id}`} className="text-sky-300 hover:underline">
                        {shortId(t.user_id)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={typeTone(t.type)}>{t.type}</Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold">{birr(t.amount)}</td>
                    <td className="px-4 py-3 text-slate-400">{t.transaction_type ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{date(t.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {t.status === "pending" && t.type === "deposit" && (
                          <>
                            <Button
                              variant="success"
                              disabled={busyId === t.id}
                              onClick={() => act(t.id, api.approveDeposit, "Approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              disabled={busyId === t.id}
                              onClick={() => act(t.id, api.rejectDeposit, "Reject")}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {t.status === "pending" && t.type === "withdraw" && (
                          <>
                            <Button
                              variant="success"
                              disabled={busyId === t.id}
                              onClick={() => act(t.id, api.approveWithdrawal, "Approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              disabled={busyId === t.id}
                              onClick={() => act(t.id, api.rejectWithdrawal, "Reject")}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {t.status === "pending" &&
                          t.type !== "deposit" &&
                          t.type !== "withdraw" && (
                            <Button
                              variant="ghost"
                              disabled={busyId === t.id}
                              onClick={() => act(t.id, api.cancelTransaction, "Cancel")}
                            >
                              Cancel
                            </Button>
                          )}
                        {t.status !== "pending" && <span className="text-xs text-slate-600">—</span>}
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

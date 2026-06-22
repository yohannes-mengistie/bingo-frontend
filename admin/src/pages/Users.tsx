import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Card, Button, Spinner, ErrorNote, EmptyState } from "@/components/ui";
import { birr, date } from "@/lib/format";

const PAGE = 50;

export function Users() {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.users(PAGE, offset), [offset]);

  const filtered = useMemo(() => {
    const users = data?.users ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const name = `${u.first_name} ${u.last_name ?? ""}`.toLowerCase();
      return (
        name.includes(term) ||
        u.phone_number?.toLowerCase().includes(term) ||
        String(u.telegram_id).includes(term) ||
        u.referal_code?.toLowerCase().includes(term)
      );
    });
  }, [data, q]);

  const total = data?.count ?? 0;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">Users {total > 0 && <span className="text-slate-500">({total})</span>}</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, Telegram ID…"
          className="w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm outline-none focus:border-brand sm:w-72"
        />
      </div>

      <Card className="p-0">
        {loading && <Spinner />}
        {error && (
          <div className="p-4">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        )}
        {!loading && !error && filtered.length === 0 && <EmptyState message="No users found." />}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Telegram ID</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => navigate(`/users/${u.id}`)}
                    className="cursor-pointer border-b border-edge/50 hover:bg-panel2/40"
                  >
                    <td className="px-4 py-3 font-medium">
                      {u.first_name} {u.last_name ?? ""}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{u.telegram_id}</td>
                    <td className="px-4 py-3 text-slate-400">{u.phone_number}</td>
                    <td className="px-4 py-3 font-semibold">{birr(u.wallet?.balance)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === "admin" ? "purple" : "neutral"}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.banned ? <Badge tone="red">banned</Badge> : <Badge tone="green">active</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{date(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Previous
            </Button>
            <Button variant="ghost" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

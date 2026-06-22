import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, Spinner, ErrorNote, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { birr, date } from "@/lib/format";

export function Staff() {
  // No dedicated "admins" endpoint, so pull a large page and filter to admins.
  const { data, loading, error, reload } = useApi(() => api.users(200, 0), []);
  const push = useToast((s) => s.push);
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const admins = (data?.users ?? []).filter((u) => u.role === "admin");

  const demote = async (id: string) => {
    setBusyId(id);
    try {
      await api.setRole(id, "user");
      push("Demoted to user", "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">Staff (Admins)</h1>
        <Button variant="ghost" onClick={() => navigate("/users")} className="self-start sm:self-auto">
          Promote from Users →
        </Button>
      </div>

      <Card className="p-0">
        {loading && <Spinner />}
        {error && (
          <div className="p-4">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        )}
        {!loading && !error && admins.length === 0 && <EmptyState message="No admins found." />}
        {!loading && !error && admins.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Telegram ID</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((u) => (
                  <tr key={u.id} className="border-b border-edge/50 hover:bg-panel2/40">
                    <td className="px-4 py-3 font-medium">
                      {u.first_name} {u.last_name ?? ""} {u.banned && <Badge tone="red">banned</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{u.telegram_id}</td>
                    <td className="px-4 py-3 text-slate-400">{u.phone_number}</td>
                    <td className="px-4 py-3 font-semibold">{birr(u.wallet?.balance)}</td>
                    <td className="px-4 py-3 text-slate-400">{date(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => navigate(`/users/${u.id}`)}>
                          View
                        </Button>
                        <Button variant="danger" disabled={busyId === u.id} onClick={() => demote(u.id)}>
                          Demote
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-slate-500">
        Showing admins from the first 200 users. To promote a new admin, open a user from the Users page and use
        “Promote to admin”.
      </p>
    </div>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, Spinner, ErrorNote } from "@/components/ui";
import { useToast } from "@/components/toast";
import { birr, date } from "@/lib/format";

export function UserDetail() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useApi(() => api.userDetail(id), [id]);
  const push = useToast((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adminPw, setAdminPw] = useState("");

  const u = data?.user;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      push(ok, "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const adjust = async (sign: 1 | -1) => {
    const n = Number(amount);
    if (!n || Number.isNaN(n) || n <= 0) {
      push("Enter a positive amount.", "error");
      return;
    }
    await run(() => api.adjustBalance(id, sign * n, reason), `Balance ${sign > 0 ? "credited" : "debited"}`);
    setAmount("");
    setReason("");
  };

  const makeAdmin = async () => {
    if (adminPw.trim().length < 8) {
      push("Password must be at least 8 characters.", "error");
      return;
    }
    await run(() => api.makeAdmin(id, adminPw), "User is now an admin with a password");
    setAdminPw("");
  };

  return (
    <div>
      <Link to="/users" className="text-sm text-sky-300 hover:underline">
        ← Back to users
      </Link>

      {loading && <Spinner />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {u && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-lg font-bold">
                {u.first_name} {u.last_name ?? ""}
              </h1>
              <div className="flex gap-2">
                <Badge tone={u.role === "admin" ? "purple" : "neutral"}>{u.role}</Badge>
                {u.banned ? <Badge tone="red">banned</Badge> : <Badge tone="green">active</Badge>}
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Telegram ID" value={String(u.telegram_id)} />
              <Row label="Phone" value={u.phone_number} />
              <Row label="Referral code" value={u.referal_code} />
              <Row label="Balance" value={birr(u.wallet?.balance)} />
              <Row label="Demo balance" value={birr(u.wallet?.demo_balance)} />
              <Row label="Joined" value={date(u.created_at)} />
            </dl>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Actions</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Role</span>
                {u.role === "admin" ? (
                  <Button variant="ghost" disabled={busy} onClick={() => run(() => api.setRole(id, "user"), "Demoted to user")}>
                    Demote to user
                  </Button>
                ) : (
                  <Button variant="ghost" disabled={busy} onClick={() => run(() => api.setRole(id, "admin"), "Promoted to admin")}>
                    Promote to admin
                  </Button>
                )}
              </div>

              <div className="border-t border-edge pt-4">
                <div className="mb-2 text-sm text-slate-300">
                  {u.role === "admin" ? "Reset admin password" : "Make admin (set login password)"}
                </div>
                <input
                  type="password"
                  value={adminPw}
                  onChange={(e) => setAdminPw(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  className="mb-2 w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <Button variant="primary" disabled={busy} onClick={makeAdmin} className="w-full">
                  {u.role === "admin" ? "Update admin password" : "Make admin & set password"}
                </Button>
                <p className="mt-1 text-xs text-slate-500">
                  They sign in with their Telegram ID ({u.telegram_id}) and this password.
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-edge pt-4">
                <span className="text-sm text-slate-300">Account</span>
                {u.banned ? (
                  <Button variant="success" disabled={busy} onClick={() => run(() => api.unbanUser(id), "User unbanned")}>
                    Unban
                  </Button>
                ) : (
                  <Button variant="danger" disabled={busy} onClick={() => run(() => api.banUser(id), "User banned")}>
                    Ban
                  </Button>
                )}
              </div>

              <div className="border-t border-edge pt-4">
                <div className="mb-2 text-sm text-slate-300">Adjust balance</div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="Amount (Br)"
                  className="mb-2 w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="mb-2 w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <div className="flex gap-2">
                  <Button variant="success" disabled={busy} onClick={() => adjust(1)} className="flex-1">
                    + Credit
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => adjust(-1)} className="flex-1">
                    − Debit
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-200">{value}</dd>
    </div>
  );
}

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Input,
  StatCard,
  StatusBadge,
  Skeleton,
  ErrorNote,
  PageHeader,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { birr, date, fullName, initials, statusTone } from "@/lib/format";

export function UserDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.userDetail(id), [id]);
  const push = useToast((s) => s.push);
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [showAdminForm, setShowAdminForm] = useState(false);

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
    setShowAdminForm(false);
  };

  const removeUser = async () => {
    const name = fullName(u?.first_name, u?.last_name) || u?.phone_number || "this user";
    if (
      !(await confirm({
        title: `Delete ${name}?`,
        message:
          "This permanently removes their wallet, transactions, and game history. This cannot be undone.",
        confirmLabel: "Delete user",
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteUser(id);
      push("User deleted", "success");
      nav("/users");
    } catch (e) {
      push(e instanceof Error ? e.message : "Delete failed", "error");
      setBusy(false);
    }
  };

  const name = fullName(u?.first_name, u?.last_name) || "User";

  return (
    <div>
      <PageHeader
        title={name}
        subtitle="Player profile & actions"
        actions={
          <Button variant="subtle" icon="chevronLeft" onClick={() => nav("/users")}>
            Back
          </Button>
        }
      />

      {loading && !u ? (
        <Card>
          <Skeleton rows={5} />
        </Card>
      ) : error && !u ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : u ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* -------------------------------------------------- left column -- */}
          <div className="space-y-4 lg:col-span-2">
            {/* Profile header */}
            <Card>
              <div className="flex items-start gap-4">
                <Avatar initials={initials(u.first_name, u.last_name)} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-txt">{name}</h2>
                    <Badge tone={u.role === "admin" ? "purple" : "neutral"}>{u.role}</Badge>
                    <StatusBadge
                      value={u.banned ? "banned" : "active"}
                      tone={statusTone(u.banned ? "banned" : "active")}
                    />
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Row label="Phone" value={u.phone_number} />
                    <Row label="Telegram ID" value={String(u.telegram_id)} />
                    <Row label="Referral code" value={u.referal_code} />
                    <Row label="Demo balance" value={birr(u.wallet?.demo_balance)} />
                    <Row label="Joined" value={date(u.created_at)} />
                  </dl>
                </div>
              </div>
            </Card>

            {/* Role */}
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-txt">Role</h3>
              <div className="flex flex-wrap items-center gap-2">
                {u.role === "admin" ? (
                  <Button
                    variant="ghost"
                    icon="shield"
                    disabled={busy}
                    onClick={() => run(() => api.setRole(id, "user"), "Demoted to user")}
                  >
                    Demote to user
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    icon="shield"
                    disabled={busy}
                    onClick={() => run(() => api.setRole(id, "admin"), "Promoted to admin")}
                  >
                    Promote to admin
                  </Button>
                )}
                <Button
                  variant="subtle"
                  icon="key"
                  disabled={busy}
                  onClick={() => setShowAdminForm((s) => !s)}
                >
                  {u.role === "admin" ? "Reset admin password" : "Make admin"}
                </Button>
              </div>

              {showAdminForm && (
                <div className="mt-4 border-t border-edgeSoft pt-4">
                  <label className="mb-1.5 block text-xs font-medium text-txt-3">
                    {u.role === "admin" ? "New admin password" : "Login password (min 8 chars)"}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="password"
                      value={adminPw}
                      onChange={(e) => setAdminPw(e.target.value)}
                      placeholder="New password (min 8 chars)"
                      className="flex-1"
                    />
                    <Button variant="primary" icon="key" loading={busy} onClick={makeAdmin}>
                      {u.role === "admin" ? "Update password" : "Make admin"}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs text-txt-4">
                    They sign in with their phone ({u.phone_number}) and this password.
                  </p>
                </div>
              )}
            </Card>

            {/* Balance */}
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-txt">Balance</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-txt-3">Amount (Br)</label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-txt-3">Reason (optional)</label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="success" icon="plus" disabled={busy} onClick={() => adjust(1)} className="flex-1">
                  Credit
                </Button>
                <Button variant="danger" icon="coins" disabled={busy} onClick={() => adjust(-1)} className="flex-1">
                  Debit
                </Button>
              </div>
            </Card>

            {/* Danger zone */}
            <Card className="border-danger/30 p-4">
              <h3 className="mb-3 text-sm font-semibold text-danger">Danger zone</h3>
              <div className="flex flex-wrap items-center gap-2">
                {u.banned ? (
                  <Button
                    variant="success"
                    icon="check"
                    disabled={busy}
                    onClick={() => run(() => api.unbanUser(id), "User unbanned")}
                  >
                    Unban user
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    icon="ban"
                    disabled={busy}
                    onClick={() => run(() => api.banUser(id), "User banned")}
                  >
                    Ban user
                  </Button>
                )}
                {u.role === "admin" ? (
                  <p className="text-xs text-txt-4">
                    Admin accounts can't be deleted. Demote to a regular user first.
                  </p>
                ) : (
                  <Button variant="danger" icon="trash" disabled={busy} onClick={removeUser}>
                    Delete user
                  </Button>
                )}
              </div>
            </Card>
          </div>

          {/* ------------------------------------------------- right column -- */}
          <div className="space-y-4">
            <StatCard
              icon="wallet"
              tone="green"
              label="Wallet balance"
              value={birr(u.wallet?.balance)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-txt-3 sm:text-xs">{label}</dt>
      <dd className="text-right font-medium text-txt-2 sm:mt-0.5 sm:text-left">
        {value || <span className="text-txt-4">—</span>}
      </dd>
    </div>
  );
}

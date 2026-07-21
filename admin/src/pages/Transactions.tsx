import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Transaction, type UserGameStats, type UserWithWallet } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import {
  Card,
  Table,
  thClass,
  tdClass,
  trClass,
  StatusBadge,
  Badge,
  IconButton,
  Button,
  Avatar,
  Tabs,
  SearchInput,
  Skeleton,
  Spinner,
  ErrorNote,
  EmptyState,
  PageHeader,
  Drawer,
  DetailRow,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { birr, date, fullName, initials, readable, shortId, statusTone } from "@/lib/format";

type TabKey =
  | "pendingDeposits"
  | "pendingWithdrawals"
  | "winners"
  | "all"
  | "completedDeposits"
  | "completedWithdrawals"
  | "transfers"
  | "failed";

const PAGE_SIZE = 50;

// Paginated tabs fetch (limit, offset) and return a grand `total` so we can page
// through large data; the others return a single fixed list.
const TABS: {
  key: TabKey;
  label: string;
  paginated?: boolean;
  fetch: (limit: number, offset: number) => Promise<{ transactions: Transaction[]; total?: number }>;
}[] = [
  { key: "pendingDeposits", label: "Pending deposits", paginated: true, fetch: (l, o) => api.pendingDeposits(l, o) },
  { key: "pendingWithdrawals", label: "Pending withdrawals", paginated: true, fetch: (l, o) => api.pendingWithdrawals(l, o) },
  { key: "winners", label: "Winners", paginated: true, fetch: (l, o) => api.winners(l, o) },
  { key: "all", label: "All", paginated: true, fetch: (l, o) => api.transactions(l, o) },
  { key: "completedDeposits", label: "Completed deposits", paginated: true, fetch: (l, o) => api.completedDeposits(l, o) },
  { key: "completedWithdrawals", label: "Completed withdrawals", paginated: true, fetch: (l, o) => api.completedWithdrawals(l, o) },
  { key: "transfers", label: "Transfers", fetch: () => api.transfers() },
  { key: "failed", label: "Failed", fetch: () => api.failed() },
];

export function Transactions() {
  const [tab, setTab] = useState<TabKey>("pendingDeposits");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const active = TABS.find((t) => t.key === tab)!;
  // Reset to the first page whenever the tab changes.
  useEffect(() => setPage(0), [tab]);
  const { data, loading, error, reload, updatedAt } = usePolling(
    () => active.fetch(PAGE_SIZE, page * PAGE_SIZE),
    [tab, page],
    8000,
  );
  const total = data?.total;
  const push = useToast((s) => s.push);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Transaction | null>(null);

  // Secondary user map — only a FALLBACK now that each transaction row carries
  // its own player_name/player_phone from the backend. Kept small + slow.
  const { data: usersData } = usePolling(() => api.users(1000, 0), [], 60000);
  const userMap = useMemo(() => {
    const m = new Map<string, UserWithWallet>();
    for (const u of usersData?.users ?? []) m.set(u.id, u);
    return m;
  }, [usersData]);

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

  // Roll back a withdrawal: refund the genuine part to cash, the rest to bonus.
  const rollback = async (id: string) => {
    setBusyId(id);
    try {
      const res = await api.rejectWithdrawalToBonus(id);
      const r = res.result;
      push(`Rolled back — ${birr(r.real_refunded)} to balance, ${birr(r.bonus_granted)} to bonus`, "success");
      reload();
      setDetail(null);
    } catch (e) {
      push(e instanceof Error ? e.message : "Rollback failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const rows = data?.transactions ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((t) => {
      const u = userMap.get(t.user_id);
      const hay = [
        readable(t.player_name) || (u ? fullName(u.first_name, u.last_name) : ""),
        t.player_phone ?? u?.phone_number ?? "",
        u ? String(u.telegram_id) : "",
        t.transaction_id ?? "",
        t.reference ?? "",
        t.transaction_type ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, userMap]);

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Deposits, withdrawals, transfers & approvals"
        updatedAt={updatedAt}
        onReload={reload}
      />

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-edgeSoft p-4">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          <div className="ml-auto">
            <SearchInput value={q} onChange={setQ} placeholder="Search player, phone or reference…" />
          </div>
        </div>

        {loading && !data ? (
          <Skeleton />
        ) : error && !data ? (
          <div className="p-4">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message={q ? "No transactions match your search." : "No transactions here."} icon="transactions" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thClass}>Player</th>
                <th className={thClass}>Type</th>
                <th className={`${thClass} text-right`}>Amount</th>
                <th className={thClass}>Payment</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>When</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const u = userMap.get(t.user_id);
                // Prefer the name the backend joined onto the row; fall back to
                // the user map, then phone. Never show a raw id as the name.
                const name = readable(t.player_name) || (u ? fullName(u.first_name, u.last_name) : "");
                const phone = t.player_phone || u?.phone_number;
                const typeValue = t.category ?? t.type;
                const payId = t.transaction_id ?? t.reference;
                return (
                  <tr key={t.id} className={trClass}>
                    <td className={tdClass}>
                      <Link to={`/users/${t.user_id}`} className="flex items-center gap-2.5">
                        <Avatar initials={name ? initials(name) : "?"} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-txt">
                            {name || phone || shortId(t.user_id)}
                          </span>
                          <span className="block truncate text-xs text-txt-3">
                            {phone || <span className="text-txt-4">Unknown</span>}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className={tdClass}>
                      <StatusBadge value={typeValue} tone={statusTone(typeValue)} />
                    </td>
                    <td className={`${tdClass} text-right font-semibold tabular-nums text-txt`}>
                      {birr(t.amount)}
                    </td>
                    <td className={tdClass}>
                      {t.transaction_type ? (
                        <span className="text-txt-2">
                          {t.transaction_type}
                          {payId && (
                            <>
                              {" · "}
                              <span className="font-mono text-xs text-txt-3">{payId}</span>
                            </>
                          )}
                        </span>
                      ) : t.reference ? (
                        <span className="font-mono text-xs text-txt-3">{t.reference}</span>
                      ) : (
                        <span className="text-txt-4">—</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      <StatusBadge value={t.status} tone={statusTone(t.status)} />
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-txt-3`}>{date(t.created_at)}</td>
                    <td className={tdClass}>
                      <div className="flex justify-end gap-2">
                        <IconButton icon="eye" title="View details" onClick={() => setDetail(t)} />
                        {t.status === "pending" && t.type === "deposit" && (
                          <>
                            <IconButton
                              icon="check"
                              tone="green"
                              title="Approve"
                              loading={busyId === t.id}
                              onClick={() => act(t.id, api.approveDeposit, "Approve")}
                            />
                            <IconButton
                              icon="x"
                              tone="red"
                              title="Reject"
                              loading={busyId === t.id}
                              onClick={() => act(t.id, api.rejectDeposit, "Reject")}
                            />
                          </>
                        )}
                        {t.status === "pending" && t.type === "withdraw" && (
                          <>
                            <IconButton
                              icon="check"
                              tone="green"
                              title="Approve"
                              loading={busyId === t.id}
                              onClick={() => act(t.id, api.approveWithdrawal, "Approve")}
                            />
                            <IconButton
                              icon="refresh"
                              title="Roll back → split refund to cash + bonus"
                              loading={busyId === t.id}
                              onClick={() => rollback(t.id)}
                            />
                            <IconButton
                              icon="x"
                              tone="red"
                              title="Reject (full refund to cash)"
                              loading={busyId === t.id}
                              onClick={() => act(t.id, api.rejectWithdrawal, "Reject")}
                            />
                          </>
                        )}
                        {t.status === "pending" &&
                          t.type !== "deposit" &&
                          t.type !== "withdraw" && (
                            <IconButton
                              icon="stop"
                              tone="red"
                              title="Cancel"
                              loading={busyId === t.id}
                              onClick={() => act(t.id, api.cancelTransaction, "Cancel")}
                            />
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {active.paginated && total !== undefined && total > PAGE_SIZE && !q && (
          <div className="flex items-center justify-between gap-3 border-t border-edgeSoft p-4 text-sm text-txt-3">
            <span>
              Showing <span className="text-txt">{page * PAGE_SIZE + 1}</span>–
              <span className="text-txt">{Math.min((page + 1) * PAGE_SIZE, total)}</span> of{" "}
              <span className="text-txt">{total}</span>
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" icon="chevronLeft" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Prev
              </Button>
              <span className="tabular-nums">
                Page {page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <Button
                variant="ghost"
                icon="chevronRight"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <TransactionDrawer
        tx={detail}
        user={detail ? userMap.get(detail.user_id) : undefined}
        busy={detail ? busyId === detail.id : false}
        onClose={() => setDetail(null)}
        onAct={(id, fn, label) => {
          act(id, fn, label);
          setDetail(null);
        }}
        onRollback={rollback}
      />
    </div>
  );
}

function TransactionDrawer({
  tx,
  user,
  busy,
  onClose,
  onAct,
  onRollback,
}: {
  tx: Transaction | null;
  user?: UserWithWallet;
  busy: boolean;
  onClose: () => void;
  onAct: (id: string, fn: (id: string) => Promise<unknown>, label: string) => void;
  onRollback: (id: string) => void;
}) {
  if (!tx) return null;
  const isIn = tx.type === "deposit" || tx.type === "transfer_in";
  const name = readable(tx.player_name) || (user ? fullName(user.first_name, user.last_name) : "");
  const phone = tx.player_phone || user?.phone_number;

  const footer =
    tx.status === "pending" ? (
      <div className="flex flex-col gap-2">
        {tx.type === "deposit" && (
          <div className="flex gap-2">
            <Button variant="success" icon="check" loading={busy} className="flex-1" onClick={() => onAct(tx.id, api.approveDeposit, "Approve")}>
              Approve
            </Button>
            <Button variant="danger" icon="x" loading={busy} className="flex-1" onClick={() => onAct(tx.id, api.rejectDeposit, "Reject")}>
              Reject
            </Button>
          </div>
        )}
        {tx.type === "withdraw" && (
          <>
            <div className="flex gap-2">
              <Button variant="success" icon="check" loading={busy} className="flex-1" onClick={() => onAct(tx.id, api.approveWithdrawal, "Approve")}>
                Approve & pay
              </Button>
              <Button variant="danger" icon="x" loading={busy} className="flex-1" onClick={() => onAct(tx.id, api.rejectWithdrawal, "Reject")}>
                Reject (all to cash)
              </Button>
            </div>
            <Button variant="subtle" icon="refresh" loading={busy} className="w-full" onClick={() => onRollback(tx.id)}>
              Roll back → genuine to cash, referral/bonus to bonus
            </Button>
          </>
        )}
        {tx.type !== "deposit" && tx.type !== "withdraw" && (
          <Button variant="danger" icon="stop" loading={busy} className="w-full" onClick={() => onAct(tx.id, api.cancelTransaction, "Cancel")}>
            Cancel transaction
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <Drawer open title="Transaction" subtitle={date(tx.created_at)} onClose={onClose} footer={footer}>
      {/* Amount hero */}
      <div className="mb-4 rounded-2xl border border-edgeSoft bg-panel2 p-4 text-center">
        <div className={`text-3xl font-bold tabular-nums ${isIn ? "text-success" : "text-txt"}`}>
          {isIn ? "+" : "−"}
          {birr(tx.amount)}
        </div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <StatusBadge value={tx.category ?? tx.type} tone={statusTone(tx.category ?? tx.type)} />
          <StatusBadge value={tx.status} tone={statusTone(tx.status)} />
        </div>
      </div>

      {/* For a withdrawal, show whether this player is a genuine winner before paying. */}
      {tx.type === "withdraw" && <PlayerWinBackground userId={tx.user_id} />}

      <DetailRow label="Player">
        <Link to={`/users/${tx.user_id}`} className="inline-flex items-center gap-2 hover:text-brand" onClick={onClose}>
          <Avatar initials={user ? initials(user.first_name, user.last_name) : "?"} size={22} />
          {name || phone || shortId(tx.user_id)}
        </Link>
      </DetailRow>
      {phone && <DetailRow label="Phone" mono>{phone}</DetailRow>}
      <DetailRow label="Direction">
        <Badge tone={isIn ? "green" : "neutral"}>{isIn ? "Money in" : "Money out"}</Badge>
      </DetailRow>
      <DetailRow label="Category">{tx.category ?? "—"}</DetailRow>
      <DetailRow label="Ledger type">{tx.type}</DetailRow>
      <DetailRow label="Payment method">{tx.transaction_type ?? "—"}</DetailRow>
      <DetailRow label="Receipt / reference" mono>{tx.transaction_id ?? "—"}</DetailRow>
      <DetailRow label="Internal reference" mono>{tx.reference ?? "—"}</DetailRow>
      <DetailRow label="Created">{date(tx.created_at)}</DetailRow>
      <DetailRow label="Transaction ID" mono>{tx.id}</DetailRow>
    </Drawer>
  );
}

// PlayerWinBackground shows a player's lifetime play record inside the withdrawal
// drawer, so an admin can tell at a glance whether the money being withdrawn was
// actually won — or belongs to a farmed / bonus-only account that never played.
function PlayerWinBackground({ userId }: { userId: string }) {
  const [stats, setStats] = useState<UserGameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .userGameStats(userId)
      .then((r) => alive && setStats(r.stats))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <div className="mb-4 rounded-2xl border border-edgeSoft bg-panel2 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-txt-4">
        Player background — did they really win?
      </div>
      {loading ? (
        <Spinner />
      ) : failed ? (
        <div className="text-sm text-txt-3">Couldn't load play history.</div>
      ) : stats ? (
        <>
          {/* Play record */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Games played" value={String(stats.games_played)} />
            <MiniStat label="Games won" value={String(stats.games_won)} highlight={stats.games_won > 0} />
            <MiniStat label="Won by playing" value={birr(stats.total_won)} highlight={stats.total_won > 0} />
          </div>

          {/* Where the money came from — so you can tell a real winner from a
              bonus/referral-funded account. */}
          <div className="mt-3 border-t border-edgeSoft pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-txt-4">
              Where the money came from
            </div>
            <div className="space-y-1.5 text-sm">
              <MoneyRow label="Deposited (real cash in)" value={stats.total_deposited} tone={stats.total_deposited > 0 ? "green" : "muted"} />
              <MoneyRow label="Bonus / referral (play-only)" value={stats.total_bonus} tone={stats.total_bonus > 0 ? "gold" : "muted"} />
              <MoneyRow label="Won by playing" value={stats.total_won} />
              <MoneyRow label="Already withdrawn" value={stats.total_withdrawn} />
              <div className="mt-2 flex items-center justify-between border-t border-edgeSoft pt-2">
                <span className="text-txt-2">Balance now</span>
                <span className="tabular-nums">
                  <span className="font-semibold text-txt">{birr(stats.real_balance)}</span>
                  <span className="text-txt-4"> cash</span>
                  {stats.bonus_balance > 0 && (
                    <span className="text-warning"> · {birr(stats.bonus_balance)} bonus</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Verdict line */}
          <div className="mt-3 text-center">
            {stats.total_deposited === 0 && stats.total_won === 0 ? (
              <Badge tone="red">⚠ No deposits and no wins — balance is bonus/referral only. Verify before paying.</Badge>
            ) : stats.games_won === 0 ? (
              <Badge tone="red">⚠ Never won a game — check the source above before paying.</Badge>
            ) : (
              <Badge tone="green">✓ Real player — has genuine deposits/wins.</Badge>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MoneyRow({ label, value, tone }: { label: string; value: number; tone?: "green" | "gold" | "muted" }) {
  const color =
    tone === "green" ? "text-success" : tone === "gold" ? "text-warning" : tone === "muted" ? "text-txt-4" : "text-txt";
  return (
    <div className="flex items-center justify-between">
      <span className="text-txt-3">{label}</span>
      <span className={`tabular-nums font-medium ${color}`}>{birr(value)}</span>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-edgeSoft bg-panel p-2.5">
      <div className={`text-lg font-bold tabular-nums ${highlight ? "text-success" : "text-txt"}`}>{value}</div>
      <div className="text-[11px] text-txt-4">{label}</div>
    </div>
  );
}

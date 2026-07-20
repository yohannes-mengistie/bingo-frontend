import { useEffect, useMemo, useState } from "react";
import {
  api,
  type BonusCampaign,
  type BonusConfig,
  type Broadcast,
  type UserWithWallet,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, Spinner, ErrorNote, Badge, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { birr, date } from "@/lib/format";

const PAGE = 200;
type Tab = "campaign" | "grant" | "policy" | "broadcast";

/**
 * Bonus is PLAY-ONLY money: it buys game cards but can never be withdrawn.
 * Winnings from a bonus-funded card are ordinary cash. "Outstanding" is
 * therefore a house liability — bonus players could still stake — not money
 * anyone can take out.
 */
export function Bonus() {
  const { data: cfgData, loading, error, reload } = useApi(() => api.bonusConfig(), []);
  const [tab, setTab] = useState<Tab>("campaign");

  const [form, setForm] = useState<BonusConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [audience, setAudience] = useState<number | null>(null);

  useEffect(() => {
    if (cfgData) setForm(cfgData);
  }, [cfgData]);

  const refreshStats = () => {
    api.bonusOutstanding().then((r) => setOutstanding(r.outstanding_bonus)).catch(() => {});
    api.broadcastAudience().then((r) => setAudience(r.recipients)).catch(() => {});
  };
  useEffect(refreshStats, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!form) return null;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Bonus</h1>
          <Badge tone={form.enabled ? "green" : "neutral"}>
            {form.enabled ? "Granting on" : "Granting off"}
          </Badge>
        </div>
        <div className="flex gap-2 text-sm">
          <Stat label="Outstanding" value={outstanding === null ? "—" : birr(outstanding)} />
          <Stat label="Players reachable" value={audience === null ? "—" : String(audience)} />
          <Stat label="Expires after" value={`${form.expiry_days}d`} />
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-edge bg-panel p-1 text-sm">
        {(
          [
            ["campaign", "Today's bonus"],
            ["grant", "Grant bonus"],
            ["policy", "Policy"],
            ["broadcast", "Broadcast"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              tab === key ? "bg-brand text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "campaign" && <CampaignPanel enabled={form.enabled} onChanged={refreshStats} />}
      {tab === "grant" && (
        <GrantPanel expiryDays={form.expiry_days} enabled={form.enabled} onGranted={refreshStats} />
      )}
      {tab === "policy" && (
        <PolicyPanel form={form} setForm={setForm} saving={saving} setSaving={setSaving} reload={reload} />
      )}
      {tab === "broadcast" && <BroadcastPanel audience={audience} announcement={form.announcement} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-panel px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-200">{value}</div>
    </div>
  );
}

/**
 * Picking recipients from a checkbox list rather than typing user IDs.
 * A UUID is not something an operator has to hand, and a mistyped one either
 * fails or — worse — silently pays the wrong player.
 */
function GrantPanel({
  expiryDays,
  enabled,
  onGranted,
}: {
  expiryDays: number;
  enabled: boolean;
  onGranted: () => void;
}) {
  const push = useToast((s) => s.push);
  const { data, loading, error, reload } = useApi(() => api.users(PAGE, 0), []);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Filler bots are excluded outright: they are bankrolled from the house
  // float, so granting them bonus would double-count the giveaway and inflate
  // the liability figure. The backend refuses anyway — this keeps them out of
  // sight rather than letting an admin select rows that can only fail.
  const players = useMemo(
    () => (data?.users ?? []).filter((u) => u.telegram_id > 0),
    [data],
  );

  // The list is paged; anyone beyond it cannot be selected. Surfaced below
  // rather than left implicit.
  const truncated = (data?.count ?? 0) > players.length;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return players;
    return players.filter((u) => {
      const name = `${u.first_name} ${u.last_name ?? ""}`.toLowerCase();
      return (
        name.includes(term) ||
        u.phone_number?.toLowerCase().includes(term) ||
        String(u.telegram_id).includes(term)
      );
    });
  }, [players, q]);

  // "Select all" applies to what is CURRENTLY VISIBLE, not the whole database.
  // Selecting rows a search has hidden is how an operator accidentally pays
  // everyone while believing they targeted a few.
  const allVisibleSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) filtered.forEach((u) => next.delete(u.id));
    else filtered.forEach((u) => next.add(u.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const grant = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      push("Enter an amount greater than 0", "error");
      return;
    }
    if (selected.size === 0) {
      push("Select at least one player", "error");
      return;
    }
    setBusy(true);
    try {
      const r = await api.grantBonusBulk([...selected], amt, reason.trim());
      const failedCount = Object.keys(r.failed ?? {}).length;
      if (failedCount > 0) {
        // Reported rather than swallowed: a partial campaign the admin thinks
        // succeeded is worse than one they know to retry.
        push(`Granted to ${r.granted} of ${r.attempted} — ${failedCount} failed`, "error");
      } else {
        push(`Granted ${birr(amt)} to ${r.granted} player${r.granted === 1 ? "" : "s"}`, "success");
      }
      setSelected(new Set());
      setAmount("");
      setReason("");
      onGranted();
    } catch (e) {
      push(e instanceof Error ? e.message : "Grant failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "rounded-lg border border-edge bg-panel2 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-brand";

  return (
    <div className="space-y-4">
      {!enabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Granting is switched off in Policy — grants will be rejected until you turn it back on.
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Amount (birr)
            </label>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50"
              className={`${inputCls} w-32`}
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Reason (optional)
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Weekend promo"
              className={`${inputCls} w-full`}
            />
          </div>
          <Button onClick={grant} disabled={busy || selected.size === 0}>
            {busy
              ? "Granting…"
              : `Grant to ${selected.size} selected`}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Each player is notified on Telegram immediately. Their bonus expires in {expiryDays} day
          {expiryDays === 1 ? "" : "s"} and can buy cards but never be withdrawn.
        </p>
      </Card>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-edge p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} />
              {allVisibleSelected ? "Unselect all" : "Select all"}
              <span className="text-slate-500">
                ({filtered.length} shown{q.trim() ? ", filtered" : ""})
              </span>
            </label>
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-400 underline hover:text-slate-200"
              >
                clear {selected.size}
              </button>
            )}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, Telegram ID…"
            className={`${inputCls} w-full sm:w-72`}
          />
        </div>

        {truncated && (
          <div className="border-b border-edge bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Showing the first {players.length} of {data?.count} players — “Select all” covers only
            these. Search to reach the rest.
          </div>
        )}

        {loading && <Spinner />}
        {error && (
          <div className="p-4">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        )}
        {!loading && !error && filtered.length === 0 && <EmptyState message="No players found." />}
        {!loading && !error && filtered.length > 0 && (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Balance</th>
                  <th className="px-3 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u: UserWithWallet) => {
                  const on = selected.has(u.id);
                  return (
                    <tr
                      key={u.id}
                      onClick={() => toggleOne(u.id)}
                      className={`cursor-pointer border-b border-edge/50 last:border-0 ${
                        on ? "bg-brand/10" : "hover:bg-white/5"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={on} readOnly />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-200">
                          {u.first_name} {u.last_name ?? ""}
                        </span>
                        {u.banned && (
                          <span className="ml-2">
                            <Badge tone="red">banned</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{u.phone_number}</td>
                      <td className="px-3 py-2 text-slate-400">{birr(u.wallet?.balance ?? 0)}</td>
                      <td className="px-3 py-2 text-slate-500">{date(u.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function PolicyPanel({
  form,
  setForm,
  saving,
  setSaving,
  reload,
}: {
  form: BonusConfig;
  setForm: (c: BonusConfig) => void;
  saving: boolean;
  setSaving: (b: boolean) => void;
  reload: () => void;
}) {
  const push = useToast((s) => s.push);
  const inputCls =
    "rounded-lg border border-edge bg-panel2 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-brand";

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateBonusConfig({
        enabled: form.enabled,
        expiry_days: form.expiry_days,
        announcement: form.announcement,
      });
      setForm(updated);
      push("Policy saved", "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <label className="mb-4 flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        <span>
          <span className="block font-medium text-slate-200">Allow new bonus grants</span>
          <span className="block text-xs text-slate-500">
            Switching this off never takes back bonus already given — existing grants stay
            spendable until they expire.
          </span>
        </span>
      </label>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-200">Expires after (days)</label>
        <input
          type="number"
          min={1}
          max={365}
          value={form.expiry_days}
          onChange={(e) => setForm({ ...form, expiry_days: Number(e.target.value) })}
          className={`${inputCls} w-32`}
        />
        <p className="mt-1 text-xs text-slate-500">
          Applies to new grants only. A deadline already promised to a player is never moved.
        </p>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-200">Announcement</label>
        <textarea
          rows={3}
          maxLength={500}
          value={form.announcement}
          onChange={(e) => setForm({ ...form, announcement: e.target.value })}
          placeholder="Shown to players in the app beside their bonus balance."
          className={`${inputCls} w-full`}
        />
        <p className="mt-1 text-xs text-slate-500">
          {form.announcement.length}/500 · shown in the app. To push it to Telegram, use the
          Broadcast tab.
        </p>
      </div>

      <div className="flex items-center gap-3 border-t border-edge pt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save policy"}
        </Button>
        <span className="text-xs text-slate-500">Last updated {date(form.updated_at)}</span>
      </div>
    </Card>
  );
}

function BroadcastPanel({
  audience,
  announcement,
}: {
  audience: number | null;
  announcement: string;
}) {
  const push = useToast((s) => s.push);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [run, setRun] = useState<Broadcast | null>(null);
  const [history, setHistory] = useState<Broadcast[]>([]);

  const loadHistory = () =>
    api.broadcasts(10).then((r) => setHistory(r.broadcasts ?? [])).catch(() => {});
  useEffect(() => {
    loadHistory();
  }, []);

  // Delivery is paced at ~20 messages/sec in the background, so the response
  // only means "started". Poll until it settles.
  useEffect(() => {
    if (!run || run.status !== "sending") return;
    const t = setInterval(async () => {
      try {
        const r = await api.broadcast(run.id);
        setRun(r.broadcast);
        if (r.broadcast.status !== "sending") {
          clearInterval(t);
          loadHistory();
        }
      } catch {
        clearInterval(t);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [run]);

  const send = async (text: string) => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const r = await api.sendBroadcast(body);
      setRun(r.broadcast);
      push(`Sending to ${r.broadcast.recipients} players…`, "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Broadcast failed", "error");
    } finally {
      setSending(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm text-slate-200 outline-none focus:border-brand";

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-3 text-sm text-slate-400">
          Sends a Telegram message to every registered player
          {audience !== null ? ` (${audience} right now)` : ""}. Paced to stay inside Telegram&apos;s
          limits, so a large audience takes a few minutes.
        </p>
        <textarea
          rows={4}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your message…"
          className={`${inputCls} mb-2`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => send(message)} disabled={sending || !message.trim()}>
            {sending ? "Starting…" : "Send to all players"}
          </Button>
          {announcement.trim() && (
            <Button onClick={() => setMessage(announcement)} disabled={sending}>
              Use announcement text
            </Button>
          )}
          <span className="text-xs text-slate-500">{message.length}/4000</span>
        </div>

        {run && (
          <div className="mt-4 rounded-lg border border-edge bg-panel2 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge tone={run.status === "completed" ? "green" : run.status === "failed" ? "red" : "yellow"}>
                {run.status}
              </Badge>
              <span className="text-slate-300">
                {run.sent} sent{run.failed > 0 ? `, ${run.failed} failed` : ""} of {run.recipients}
              </span>
            </div>
            {run.failed > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Failures are usually players who have blocked the bot.
              </p>
            )}
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-edge px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
            Recent broadcasts
          </div>
          <div className="divide-y divide-edge/50">
            {history.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <Badge tone={b.status === "completed" ? "green" : b.status === "failed" ? "red" : "yellow"}>
                  {b.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-slate-300">{b.message}</span>
                <span className="shrink-0 text-slate-400">
                  {b.sent}/{b.recipients}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{date(b.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * "Today's bonus": a pot split among the first N players who claim it.
 *
 * The amount and the number of slots are set here per campaign — nothing is
 * fixed in code. Only ONE campaign runs at a time, so this panel is either a
 * create form or a live scoreboard, never both.
 */
function CampaignPanel({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const push = useToast((s) => s.push);
  const { data, loading, error, reload } = useApi(() => api.campaigns(25), []);
  const [amount, setAmount] = useState("");
  const [slots, setSlots] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [broadcast, setBroadcast] = useState(true);
  // Bonus lifetime as a value + unit. Blank value → send nothing, so the
  // campaign falls back to the Policy expiry, exactly as before this existed.
  const [expiryValue, setExpiryValue] = useState("");
  const [expiryUnit, setExpiryUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [busy, setBusy] = useState(false);

  const campaigns = data?.campaigns ?? [];
  const active = campaigns.find((c) => c.status === "active") ?? null;

  // Live scoreboards go stale fast during a stampede, so poll while one runs.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [active?.id, reload]);

  const amt = Number(amount);
  const n = Number(slots);
  const validNumbers = Number.isFinite(amt) && amt > 0 && Number.isInteger(n) && n > 0;
  // Mirrors the backend: the pot is split into equal slots, rounded DOWN to
  // the cent so slots * per-player can never exceed what was authorised.
  const perSlot = validNumbers ? Math.floor((amt / n) * 100) / 100 : 0;

  // Blank expiry → undefined (use default). A non-empty, invalid value (0,
  // negative, non-numeric) is caught on submit rather than silently dropped.
  const expiryMinutes = campaignExpiryMinutes(expiryValue, expiryUnit);
  const expiryBlank = expiryValue.trim() === "";

  const create = async () => {
    if (!validNumbers) {
      push("Enter an amount and a whole number of players", "error");
      return;
    }
    if (perSlot < 1) {
      push(`${birr(amt)} across ${n} players is only ${birr(perSlot)} each`, "error");
      return;
    }
    if (!expiryBlank && (expiryMinutes === null || expiryMinutes < 1)) {
      push("Expiry must be a whole number greater than 0, or left blank", "error");
      return;
    }
    const expiryText = expiryBlank
      ? "the default bonus lifetime"
      : `${expiryValue} ${expiryUnit}`;
    if (
      !window.confirm(
        `Start today's bonus?\n\n${birr(amt)} for the first ${n} players — ${birr(perSlot)} each.\n` +
          `Bonus expires after ${expiryText}.` +
          (broadcast ? `\n\nThis WILL Telegram every registered player.` : ""),
      )
    )
      return;

    setBusy(true);
    try {
      await api.createCampaign({
        total_amount: amt,
        slots: n,
        announcement: announcement.trim(),
        broadcast,
        expiry_minutes: expiryBlank ? undefined : (expiryMinutes as number),
      });
      push(broadcast ? "Campaign started and announced" : "Campaign started", "success");
      setAmount("");
      setSlots("");
      setAnnouncement("");
      setExpiryValue("");
      reload();
      onChanged();
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not start the campaign", "error");
    } finally {
      setBusy(false);
    }
  };

  const end = async (id: string) => {
    if (!window.confirm("Stop this campaign? Players who already claimed keep their bonus."))
      return;
    setBusy(true);
    try {
      await api.endCampaign(id);
      push("Campaign stopped", "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not stop the campaign", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-1 font-semibold">{active ? "Running now" : "Start today's bonus"}</h2>

        {active ? (
          <ActiveCampaign campaign={active} onEnd={() => end(active.id)} busy={busy} />
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-400">
              A pot split equally among the first N players who claim it. Only players who have
              completed a deposit can claim, and each player can claim once.
            </p>

            {!enabled && (
              <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Bonus granting is switched off in Policy — turn it on first or every claim will
                fail.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Total amount (birr)">
                <input
                  className={campaignInputCls}
                  type="number"
                  min={1}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000"
                />
              </Field>
              <Field label="Number of players">
                <input
                  className={campaignInputCls}
                  type="number"
                  min={1}
                  step="1"
                  value={slots}
                  onChange={(e) => setSlots(e.target.value)}
                  placeholder="10"
                />
              </Field>
            </div>

            {/* The number the player actually receives, shown before committing
                — the split is the easiest thing to get wrong. */}
            <div className="mt-3 rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm">
              {validNumbers ? (
                <span className="text-slate-200">
                  Each player gets <strong className="text-brand">{birr(perSlot)}</strong>
                  {perSlot * n < amt && (
                    <span className="text-slate-400">
                      {" "}
                      · {birr(amt - perSlot * n)} of the pot stays unspent (rounding)
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-slate-500">Enter an amount and a player count</span>
              )}
            </div>

            <div className="mt-3">
              <Field
                label="Bonus expires after"
                hint="How long a claimed bonus lasts. Leave blank to use the Policy default. A short window (e.g. 3 hours) drives urgency."
              >
                <div className="flex gap-2">
                  <input
                    className={`${campaignInputCls} flex-1`}
                    type="number"
                    min={1}
                    step="1"
                    value={expiryValue}
                    onChange={(e) => setExpiryValue(e.target.value)}
                    placeholder="default"
                  />
                  <select
                    className={campaignInputCls}
                    value={expiryUnit}
                    onChange={(e) => setExpiryUnit(e.target.value as "minutes" | "hours" | "days")}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Announcement (optional)" hint="Left blank, a bilingual default is sent.">
                <textarea
                  className={`${campaignInputCls} h-24 resize-none`}
                  maxLength={1000}
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="🎁 የዛሬ ቦነስ…"
                />
              </Field>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={broadcast}
                onChange={(e) => setBroadcast(e.target.checked)}
              />
              Telegram every player when this starts
            </label>

            <Button className="mt-4 w-full" onClick={create} disabled={busy || !validNumbers}>
              {busy ? "Starting…" : "Start campaign"}
            </Button>
          </>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-edge px-4 py-3">
          <h2 className="font-semibold">{active ? "Who claimed" : "Past campaigns"}</h2>
        </div>
        {active ? (
          <ClaimsTable campaignId={active.id} />
        ) : campaigns.length === 0 ? (
          <EmptyState message="No campaigns yet." />
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-edge text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2">Pot</th>
                  <th className="px-4 py-2">Each</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2">Claimed</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-edge/50">
                    <td className="px-4 py-2 text-slate-400">{date(c.created_at)}</td>
                    <td className="px-4 py-2">{birr(c.total_amount)}</td>
                    <td className="px-4 py-2">{birr(c.amount_per_slot)}</td>
                    <td className="px-4 py-2 text-slate-400">{humanizeExpiry(c.expiry_minutes)}</td>
                    <td className="px-4 py-2">
                      {c.claimed_count} / {c.slots}
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

function ActiveCampaign({
  campaign,
  onEnd,
  busy,
}: {
  campaign: BonusCampaign;
  onEnd: () => void;
  busy: boolean;
}) {
  const left = Math.max(0, campaign.slots - campaign.claimed_count);
  const pct = Math.round((campaign.claimed_count / campaign.slots) * 100);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Badge tone={left === 0 ? "yellow" : "green"}>
          {left === 0 ? "All slots claimed" : `${left} left`}
        </Badge>
        <span className="text-xs text-slate-400">started {date(campaign.created_at)}</span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="Pot" value={birr(campaign.total_amount)} />
        <Stat label="Each" value={birr(campaign.amount_per_slot)} />
        <Stat label="Claimed" value={`${campaign.claimed_count}/${campaign.slots}`} />
        <Stat label="Expires" value={humanizeExpiry(campaign.expiry_minutes)} />
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {left === 0
          ? "Every slot is gone. The campaign stays visible to players so latecomers see it sold out; starting the next one retires it."
          : "Players are claiming now. Stopping early keeps every bonus already handed out."}
      </p>

      <Button variant="danger" className="mt-3 w-full" onClick={onEnd} disabled={busy}>
        {busy ? "Working…" : "Stop campaign"}
      </Button>
    </div>
  );
}

/** Who got in, in the order they got in. */
function ClaimsTable({ campaignId }: { campaignId: string }) {
  const { data, loading, error, reload } = useApi(
    () => api.campaignClaims(campaignId),
    [campaignId],
  );
  const claims = data?.claims ?? [];

  if (loading) return <Spinner />;
  if (error)
    return (
      <div className="p-4">
        <ErrorNote message={error} onRetry={reload} />
      </div>
    );
  if (claims.length === 0) return <EmptyState message="Nobody has claimed yet." />;

  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 border-b border-edge bg-panel text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Player</th>
            <th className="px-4 py-2">Got</th>
            <th className="px-4 py-2">When</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.user_id} className="border-b border-edge/50">
              <td className="px-4 py-2 text-slate-500">{c.position}</td>
              <td className="px-4 py-2">
                <div className="text-slate-200">{c.name || "—"}</div>
                <div className="text-xs text-slate-500">{c.phone}</div>
              </td>
              <td className="px-4 py-2">{birr(c.amount)}</td>
              <td className="px-4 py-2 text-slate-400">{date(c.claimed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const campaignInputCls =
  "w-full rounded-lg border border-edge bg-panel2 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-brand";

/** Value + unit → minutes for the API. null when the value is not a positive integer. */
function campaignExpiryMinutes(
  value: string,
  unit: "minutes" | "hours" | "days",
): number | null {
  const v = Number(value);
  if (!Number.isInteger(v) || v <= 0) return null;
  return unit === "days" ? v * 1440 : unit === "hours" ? v * 60 : v;
}

/** Minutes → a short label for a scoreboard or history row. "Default" when unset. */
function humanizeExpiry(minutes?: number): string {
  if (!minutes || minutes <= 0) return "Default";
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-slate-400">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </label>
  );
}

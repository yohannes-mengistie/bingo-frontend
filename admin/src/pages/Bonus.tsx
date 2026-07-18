import { useEffect, useState } from "react";
import { api, type BonusConfig, type Broadcast } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, Spinner, ErrorNote, Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { date } from "@/lib/format";

/**
 * Bonus is PLAY-ONLY money: it buys game cards but can never be withdrawn.
 * Winnings from a bonus-funded card are ordinary cash. That is why this page
 * shows "outstanding" separately from any wallet figure — it is the house's
 * liability, i.e. bonus players could still stake, not money they can take.
 */
export function Bonus() {
  const { data, loading, error, reload } = useApi(() => api.bonusConfig(), []);
  const push = useToast((s) => s.push);

  const [form, setForm] = useState<BonusConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [outstanding, setOutstanding] = useState<number | null>(null);

  // Grant form
  const [grantUser, setGrantUser] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [granting, setGranting] = useState(false);

  // Broadcast
  const [audience, setAudience] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [run, setRun] = useState<Broadcast | null>(null);
  const [history, setHistory] = useState<Broadcast[]>([]);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const refreshSidebars = () => {
    api.bonusOutstanding().then((r) => setOutstanding(r.outstanding_bonus)).catch(() => {});
    api.broadcastAudience().then((r) => setAudience(r.recipients)).catch(() => {});
    api.broadcasts(10).then((r) => setHistory(r.broadcasts ?? [])).catch(() => {});
  };
  useEffect(refreshSidebars, []);

  // A broadcast is delivered in the background at ~20 messages/sec, so the
  // response only tells us it started. Poll until it settles.
  useEffect(() => {
    if (!run || run.status !== "sending") return;
    const t = setInterval(async () => {
      try {
        const r = await api.broadcast(run.id);
        setRun(r.broadcast);
        if (r.broadcast.status !== "sending") {
          clearInterval(t);
          refreshSidebars();
        }
      } catch {
        clearInterval(t);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [run]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api.updateBonusConfig({
        enabled: form.enabled,
        expiry_days: form.expiry_days,
        announcement: form.announcement,
      });
      setForm(updated);
      push("Bonus policy saved", "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const grant = async () => {
    const amount = Number(grantAmount);
    if (!grantUser.trim() || !Number.isFinite(amount) || amount <= 0) {
      push("Enter a user ID and a positive amount", "error");
      return;
    }
    setGranting(true);
    try {
      await api.grantBonus(grantUser.trim(), amount, grantReason.trim());
      push(`Granted ${amount} birr of bonus`, "success");
      setGrantAmount("");
      setGrantReason("");
      refreshSidebars();
    } catch (e) {
      push(e instanceof Error ? e.message : "Grant failed", "error");
    } finally {
      setGranting(false);
    }
  };

  const broadcast = async (text: string) => {
    const body = text.trim();
    if (!body) {
      push("Nothing to send", "error");
      return;
    }
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

  if (loading) return <Spinner label="Loading bonus policy…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!form) return null;

  const inputCls =
    "w-full rounded-lg border border-edge bg-panel2 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-brand";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Bonus</h1>
        <Badge tone={form.enabled ? "green" : "neutral"}>
          {form.enabled ? "Granting on" : "Granting off"}
        </Badge>
        {outstanding !== null && (
          <span className="text-sm text-slate-400">
            Outstanding liability: <strong>{outstanding.toFixed(2)} birr</strong>
          </span>
        )}
      </div>

      <Card>
        <h2 className="mb-1 font-semibold">Policy</h2>
        <p className="mb-4 text-sm text-slate-400">
          Bonus can buy game cards but can never be withdrawn. Anything won with a bonus-funded
          card is ordinary cash.
        </p>

        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Allow new bonus grants
          <span className="text-slate-500">
            (turning this off never takes back bonus already given)
          </span>
        </label>

        <label className="mb-1 block text-sm font-medium">Expires after (days)</label>
        <input
          type="number"
          min={1}
          max={365}
          value={form.expiry_days}
          onChange={(e) => setForm({ ...form, expiry_days: Number(e.target.value) })}
          className={`${inputCls} mb-1 max-w-[10rem]`}
        />
        <p className="mb-4 text-xs text-slate-500">
          Applies to new grants only. A deadline already promised to a player is never changed.
        </p>

        <label className="mb-1 block text-sm font-medium">Announcement</label>
        <textarea
          rows={3}
          maxLength={500}
          value={form.announcement}
          onChange={(e) => setForm({ ...form, announcement: e.target.value })}
          placeholder="Shown to players next to their bonus balance."
          className={`${inputCls} mb-1`}
        />
        <p className="mb-4 text-xs text-slate-500">{form.announcement.length}/500</p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save policy"}
          </Button>
          <Button
            onClick={() => broadcast(form.announcement)}
            disabled={sending || !form.announcement.trim()}
          >
            Broadcast this announcement
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Grant bonus</h2>
        <p className="mb-4 text-sm text-slate-400">
          Find a player&apos;s ID on the Users page. Their bonus expires in {form.expiry_days} day
          {form.expiry_days === 1 ? "" : "s"}.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={grantUser}
            onChange={(e) => setGrantUser(e.target.value)}
            placeholder="User ID"
            className={inputCls}
          />
          <input
            type="number"
            min={1}
            value={grantAmount}
            onChange={(e) => setGrantAmount(e.target.value)}
            placeholder="Amount (birr)"
            className={inputCls}
          />
          <input
            value={grantReason}
            onChange={(e) => setGrantReason(e.target.value)}
            placeholder="Reason (optional)"
            className={inputCls}
          />
        </div>
        <div className="mt-3">
          <Button onClick={grant} disabled={granting}>
            {granting ? "Granting…" : "Grant"}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Broadcast to players</h2>
        <p className="mb-4 text-sm text-slate-400">
          Sends a Telegram message to every registered player
          {audience !== null ? ` (${audience} right now)` : ""}. Delivery is paced to stay inside
          Telegram&apos;s limits, so a large audience takes a few minutes.
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
          <Button onClick={() => broadcast(message)} disabled={sending || !message.trim()}>
            {sending ? "Starting…" : "Send to all players"}
          </Button>
          <span className="text-xs text-slate-500">{message.length}/4000</span>
        </div>

        {run && (
          <div className="mt-4 rounded-lg bg-panel2 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <Badge
                tone={
                  run.status === "completed"
                    ? "green"
                    : run.status === "failed"
                      ? "red"
                      : "yellow"
                }
              >
                {run.status}
              </Badge>
              <span>
                {run.sent} sent{run.failed > 0 ? `, ${run.failed} failed` : ""} of {run.recipients}
              </span>
            </div>
            {run.failed > 0 && (
              <p className="text-xs text-slate-500">
                Failures are usually players who have blocked the bot.
              </p>
            )}
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Recent broadcasts</h2>
          <div className="space-y-2">
            {history.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 border-b border-edge py-2 text-sm last:border-0">
                <Badge
                  tone={
                    b.status === "completed" ? "green" : b.status === "failed" ? "red" : "yellow"
                  }
                >
                  {b.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{b.message}</span>
                <span className="shrink-0 text-slate-500">
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

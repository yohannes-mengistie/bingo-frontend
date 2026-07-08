import { useEffect, useState } from "react";
import { api, type BotConfig } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, Spinner, ErrorNote, Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { date } from "@/lib/format";

const ALL_TIERS = ["REGULAR", "VIP"] as const;

export function Bots() {
  const { data, loading, error, reload } = useApi(() => api.botConfig(), []);
  const push = useToast((s) => s.push);

  // Local editable copy of the policy, synced when the fetch resolves.
  const [form, setForm] = useState<BotConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedCount, setSeedCount] = useState("");

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const tiers = form ? form.tiers.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const toggleTier = (tier: string) => {
    if (!form) return;
    const next = tiers.includes(tier) ? tiers.filter((t) => t !== tier) : [...tiers, tier];
    setForm({ ...form, tiers: next.join(",") });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api.updateBotConfig({
        enabled: form.enabled,
        min_real_players: form.min_real_players,
        target_bots: form.target_bots,
        tiers: form.tiers,
      });
      setForm(updated);
      push("Bot policy saved", "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const seed = async () => {
    const n = seedCount ? Number(seedCount) : undefined;
    const ok = window.confirm(
      `Seed${n ? ` ${n}` : ""} bot accounts and fund each wallet with house money?\n\n` +
        `This injects real house float (recorded as bot_funding). Safe to run repeatedly — ` +
        `existing bots are reused, not duplicated.`,
    );
    if (!ok) return;
    setSeeding(true);
    try {
      const res = await api.seedBots(n);
      push(res.message ?? "Bot pool seeded", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Seed failed", "error");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-bold">Filler bots</h1>
        {form && (
          <Badge tone={form.enabled ? "green" : "neutral"}>{form.enabled ? "Auto-fill ON" : "Auto-fill OFF"}</Badge>
        )}
      </div>

      <p className="mb-4 max-w-2xl text-sm text-slate-400">
        Filler bots are house-owned players that join games short on real players. They stake house
        money into the real prize pool and can win (the pot returns to the house). Bots never join a
        game that has zero real players.
      </p>

      {loading && <Spinner />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {form && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Auto-fill policy */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Auto-fill policy
            </h2>

            <label className="mb-4 flex items-center justify-between gap-4">
              <span className="text-sm">
                <span className="font-medium text-slate-200">Enable auto-fill</span>
                <span className="block text-xs text-slate-500">
                  Background filler runs every few seconds while ON.
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="h-5 w-5 accent-emerald-500"
              />
            </label>

            <Field
              label="Fill games with fewer real players than"
              hint="Games with at least this many real players are left alone."
            >
              <input
                type="number"
                min={1}
                value={form.min_real_players}
                onChange={(e) => setForm({ ...form, min_real_players: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>

            <Field label="Target bots per game" hint="Add bots until the game holds this many.">
              <input
                type="number"
                min={0}
                value={form.target_bots}
                onChange={(e) => setForm({ ...form, target_bots: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>

            <Field label="Game tiers" hint="Which game types get bots.">
              <div className="flex gap-2">
                {ALL_TIERS.map((tier) => {
                  const on = tiers.includes(tier);
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => toggleTier(tier)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        on
                          ? "border-brand bg-brand text-ink"
                          : "border-edge bg-panel2 text-slate-300 hover:bg-edge"
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="mt-4 flex items-center gap-3 border-t border-edge pt-4">
              <Button disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save policy"}
              </Button>
              <span className="text-xs text-slate-500">Last updated {date(form.updated_at)}</span>
            </div>
          </Card>

          {/* Bot pool */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Bot pool
            </h2>
            <p className="mb-4 text-sm text-slate-400">
              Bots are auto-created and funded on server boot. Use this to (re)create the pool or top
              up bot wallets manually — for example after changing the pool size.
            </p>
            <Field label="Count" hint="Leave blank to use the server's configured pool size.">
              <input
                type="number"
                min={1}
                placeholder="server default"
                value={seedCount}
                onChange={(e) => setSeedCount(e.target.value)}
                className={inputCls}
              />
            </Field>
            <div className="mt-4 border-t border-edge pt-4">
              <Button variant="ghost" disabled={seeding} onClick={seed}>
                {seeding ? "Seeding…" : "Seed / fund bot pool"}
              </Button>
              <p className="mt-2 text-xs text-amber-300/80">
                ⚠ Injects house money into bot wallets (recorded as bot_funding).
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-edge bg-panel2 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-brand";

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
    <div className="mb-3">
      <label className="mb-1 block text-sm font-medium text-slate-200">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

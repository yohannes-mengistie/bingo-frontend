import { useEffect, useState } from "react";
import { api, type BotConfig } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, Input, Toggle, Spinner, ErrorNote, Badge, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { date } from "@/lib/format";

const ALL_TIERS = ["REGULAR", "VIP"] as const;

export function Bots() {
  const { data, loading, error, reload } = useApi(() => api.botConfig(), []);
  const push = useToast((s) => s.push);
  const confirm = useConfirm();

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
    if (
      !(await confirm({
        title: "Seed bot pool?",
        message: "Funds bot wallets from house float (recorded as bot_funding). Safe to re-run.",
        confirmLabel: "Seed & fund",
      }))
    )
      return;
    const n = seedCount ? Number(seedCount) : undefined;
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

  const label = "mb-1.5 block text-sm font-medium text-txt";
  const hint = "mt-1.5 text-xs text-txt-3";

  return (
    <div>
      <PageHeader
        title="Filler bots"
        subtitle="House players that top up under-filled games"
        actions={
          form && (
            <Badge tone={form.enabled ? "green" : "neutral"}>
              {form.enabled ? "Auto-fill on" : "Auto-fill off"}
            </Badge>
          )
        }
      />

      {loading && <Spinner />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {form && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Auto-fill policy */}
          <Card className="p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-txt-4">
              Auto-fill policy
            </h2>

            <div className="mb-5">
              <Toggle
                checked={form.enabled}
                onChange={(v) => setForm({ ...form, enabled: v })}
                label={<span className="font-medium text-txt">Enable auto-fill</span>}
              />
            </div>

            <div className="mb-4">
              <label className={label}>Start filling at</label>
              <Input
                type="number"
                min={0}
                value={form.min_real_players}
                onChange={(e) => setForm({ ...form, min_real_players: Number(e.target.value) })}
              />
              <p className={hint}>
                Real players before bots join. Set to <strong>0</strong> to let bots run games with
                no real players yet (keeps the lobby looking alive to attract visitors).
              </p>
            </div>

            <div className="mb-4">
              <label className={label}>Fill up to</label>
              <Input
                type="number"
                min={0}
                value={form.target_bots}
                onChange={(e) => setForm({ ...form, target_bots: Number(e.target.value) })}
              />
              <p className={hint}>Total players per game.</p>
            </div>

            <div className="mb-5">
              <label className={label}>Tiers</label>
              <div className="flex gap-2">
                {ALL_TIERS.map((tier) => {
                  const on = tiers.includes(tier);
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => toggleTier(tier)}
                      className={`rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition ${
                        on
                          ? "border-brand bg-brand text-ink"
                          : "border-edge bg-panel2 text-txt-2 hover:bg-edge"
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-edgeSoft pt-4">
              <Button icon="check" loading={saving} onClick={save}>
                Save policy
              </Button>
              <span className="text-xs text-txt-4">Updated {date(form.updated_at)}</span>
            </div>
          </Card>

          {/* Bot pool */}
          <Card className="p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-txt-4">Bot pool</h2>
            <label className={label}>Count</label>
            <Input
              type="number"
              min={1}
              placeholder="server default"
              value={seedCount}
              onChange={(e) => setSeedCount(e.target.value)}
            />
            <p className={hint}>Creates or tops up bot wallets from house float.</p>
            <div className="mt-4 border-t border-edgeSoft pt-4">
              <Button variant="ghost" icon="bots" loading={seeding} onClick={seed}>
                Seed / fund pool
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

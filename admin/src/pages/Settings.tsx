import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, Input, Spinner, ErrorNote, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { date } from "@/lib/format";

export function Settings() {
  const { data, loading, error, reload } = useApi(() => api.getSettings(), []);
  const push = useToast((s) => s.push);
  const [minDeposit, setMinDeposit] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setMinDeposit(String(data.settings.min_deposit));
  }, [data]);

  const save = async () => {
    const v = Number(minDeposit);
    if (!Number.isFinite(v) || v < 0) {
      push("Enter a valid amount (0 or more)", "error");
      return;
    }
    setSaving(true);
    try {
      await api.updateSettings({ min_deposit: v });
      push("Settings saved", "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const label = "mb-1.5 block text-sm font-medium text-txt";
  const hint = "mt-1.5 text-xs text-txt-3";

  return (
    <div>
      <PageHeader title="Settings" subtitle="Payment & platform settings" />

      {loading && <Spinner />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {data && (
        <Card className="max-w-md p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-txt-4">Deposits</h2>
          <label className={label}>Minimum deposit (birr)</label>
          <Input type="number" min={0} value={minDeposit} onChange={(e) => setMinDeposit(e.target.value)} />
          <p className={hint}>Players cannot deposit less than this. Applies to new deposits immediately.</p>
          <div className="mt-4 flex items-center gap-3 border-t border-edgeSoft pt-4">
            <Button icon="check" loading={saving} onClick={save}>
              Save
            </Button>
            <span className="text-xs text-txt-4">Updated {date(data.settings.updated_at)}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

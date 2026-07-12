import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type SupportCategory, type SupportReport, type SupportStatus } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, Spinner, ErrorNote, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { date, fullName, shortId } from "@/lib/format";

type TabKey = "open" | "resolved" | "all";

const TABS: { key: TabKey; label: string; status?: SupportStatus }[] = [
  { key: "open", label: "Open", status: "open" },
  { key: "resolved", label: "Resolved", status: "resolved" },
  { key: "all", label: "All" },
];

const CATEGORY_META: Record<SupportCategory, { label: string; tone: string }> = {
  transaction: { label: "Transaction", tone: "purple" },
  gameplay: { label: "Gameplay", tone: "blue" },
  other: { label: "Other", tone: "neutral" },
};

export function Reports() {
  const [tab, setTab] = useState<TabKey>("open");
  const [resolving, setResolving] = useState<string | null>(null);
  const push = useToast((s) => s.push);

  const active = TABS.find((t) => t.key === tab)!;
  const { data, loading, error, reload } = useApi(
    () => api.reports(active.status, 200, 0),
    [tab],
  );

  async function resolve(r: SupportReport) {
    setResolving(r.id);
    try {
      await api.resolveReport(r.id);
      push("Report marked resolved", "success");
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed to resolve", "error");
    } finally {
      setResolving(null);
    }
  }

  const reports = data?.reports ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Reports</h1>
        {data && <span className="text-sm text-neutral-400">{data.count} total</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              tab === t.key
                ? "bg-indigo-600 text-white"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading reports…" />
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : reports.length === 0 ? (
        <EmptyState message={tab === "open" ? "No open reports 🎉" : "No reports here."} />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const cat = CATEGORY_META[r.category] ?? CATEGORY_META.other;
            return (
              <Card key={r.id} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={cat.tone}>{cat.label}</Badge>
                  <Badge tone={r.status === "open" ? "yellow" : "green"}>{r.status}</Badge>
                  <span className="text-sm text-neutral-400">{date(r.created_at)}</span>
                </div>

                <p className="whitespace-pre-wrap break-words text-sm text-neutral-100">{r.message}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-400">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link to={`/users/${r.user_id}`} className="text-indigo-400 hover:underline">
                      {fullName(r.reporter_first_name, r.reporter_last_name) || shortId(r.user_id)}
                    </Link>
                    {r.reporter_phone && <span>{r.reporter_phone}</span>}
                    {r.reporter_telegram_id ? (
                      <a
                        href={`tg://user?id=${r.reporter_telegram_id}`}
                        className="text-indigo-400 hover:underline"
                      >
                        Telegram
                      </a>
                    ) : null}
                    {r.game_id && (
                      <Link to={`/games/${r.game_id}`} className="text-indigo-400 hover:underline">
                        Game {shortId(r.game_id)}
                      </Link>
                    )}
                  </div>
                  {r.status === "open" && (
                    <Button onClick={() => resolve(r)} disabled={resolving === r.id}>
                      {resolving === r.id ? "Resolving…" : "Mark resolved"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

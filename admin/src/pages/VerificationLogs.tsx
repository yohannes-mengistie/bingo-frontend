import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type VerificationLog, type VerificationOutcome, type UserWithWallet } from "@/lib/api";
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
  SearchInput,
  Skeleton,
  ErrorNote,
  EmptyState,
  PageHeader,
  Drawer,
  DetailRow,
} from "@/components/ui";
import { birr, date, fullName, initials, shortId } from "@/lib/format";

const PAGE_SIZE = 50;

// Tone for each verdict: verified = good, rejected = hard fail, unavailable =
// couldn't be judged (went to manual review).
function outcomeTone(o: VerificationOutcome): "green" | "red" | "yellow" {
  return o === "verified" ? "green" : o === "rejected" ? "red" : "yellow";
}

function outcomeLabel(o: VerificationOutcome): string {
  return o === "verified" ? "Verified" : o === "rejected" ? "Rejected" : "Unverified";
}

// Pretty-print the raw provider JSON; fall back to the raw string if it isn't JSON.
function prettyRaw(raw: string): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function VerificationLogs() {
  // The reference filter is applied server-side (substring match). Kept separate
  // from the input so we only refetch when the admin submits, not per keystroke.
  const [query, setQuery] = useState("");
  const [reference, setReference] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<VerificationLog | null>(null);

  const { data, loading, error, reload, updatedAt } = usePolling(
    () => api.verificationLogs({ reference, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [reference, page],
    10000,
  );

  // Names for the player column (fallback map, refreshed slowly).
  const { data: usersData } = usePolling(() => api.users(1000, 0), [], 60000);
  const userMap = useMemo(() => {
    const m = new Map<string, UserWithWallet>();
    for (const u of usersData?.users ?? []) m.set(u.id, u);
    return m;
  }, [usersData]);

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;

  const applySearch = () => {
    setPage(0);
    setReference(query.trim());
  };

  return (
    <div>
      <PageHeader
        title="Verification logs"
        subtitle="Every external payment-verifier lookup — the raw response and verdict per receipt"
        updatedAt={updatedAt}
        onReload={reload}
      />

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-edgeSoft p-4">
          <div className="text-sm text-txt-3">
            Investigate a disputed deposit — paste the receipt number to see what the verifier returned.
          </div>
          <div className="ml-auto flex items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applySearch();
              }}
            >
              <SearchInput value={query} onChange={setQuery} placeholder="Search by receipt reference…" />
            </form>
            {reference && (
              <Button
                variant="ghost"
                icon="x"
                onClick={() => {
                  setQuery("");
                  setReference("");
                  setPage(0);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {loading && !data ? (
          <Skeleton />
        ) : error && !data ? (
          <div className="p-4">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            message={reference ? `No verifier lookups for "${reference}".` : "No verification lookups yet."}
            icon="shield"
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thClass}>When</th>
                <th className={thClass}>Player</th>
                <th className={thClass}>Method</th>
                <th className={thClass}>Reference</th>
                <th className={thClass}>Verdict</th>
                <th className={`${thClass} text-right`}>Amount</th>
                <th className={thClass}>Reason</th>
                <th className={`${thClass} text-right`}>Raw</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const u = l.user_id ? userMap.get(l.user_id) : undefined;
                const name = u ? fullName(u.first_name, u.last_name) : "";
                return (
                  <tr key={l.id} className={trClass}>
                    <td className={`${tdClass} whitespace-nowrap text-txt-3`}>{date(l.created_at)}</td>
                    <td className={tdClass}>
                      {l.user_id ? (
                        <Link to={`/users/${l.user_id}`} className="flex items-center gap-2.5">
                          <Avatar initials={name ? initials(name) : "?"} size={22} />
                          <span className="min-w-0 truncate font-medium text-txt">
                            {name || u?.phone_number || shortId(l.user_id)}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-txt-4">—</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      <Badge tone="neutral">{l.method}</Badge>
                    </td>
                    <td className={`${tdClass} font-mono text-xs text-txt-2`}>{l.reference}</td>
                    <td className={tdClass}>
                      <StatusBadge value={outcomeLabel(l.outcome)} tone={outcomeTone(l.outcome)} />
                    </td>
                    <td className={`${tdClass} text-right tabular-nums text-txt`}>
                      {l.amount != null ? birr(l.amount) : <span className="text-txt-4">—</span>}
                    </td>
                    <td className={`${tdClass} max-w-[22rem] truncate text-txt-3`} title={l.reason}>
                      {l.reason || <span className="text-txt-4">—</span>}
                    </td>
                    <td className={tdClass}>
                      <div className="flex justify-end">
                        <IconButton icon="eye" title="View raw response" onClick={() => setDetail(l)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {total > PAGE_SIZE && (
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

      <VerificationDrawer log={detail} user={detail?.user_id ? userMap.get(detail.user_id) : undefined} onClose={() => setDetail(null)} />
    </div>
  );
}

function VerificationDrawer({
  log,
  user,
  onClose,
}: {
  log: VerificationLog | null;
  user?: UserWithWallet;
  onClose: () => void;
}) {
  if (!log) return null;
  const name = user ? fullName(user.first_name, user.last_name) : "";

  return (
    <Drawer open title="Verifier lookup" subtitle={date(log.created_at)} onClose={onClose}>
      <div className="mb-4 flex items-center justify-center">
        <StatusBadge value={outcomeLabel(log.outcome)} tone={outcomeTone(log.outcome)} />
      </div>

      {log.outcome === "rejected" && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          The verifier rejected this receipt. Do not credit it unless you have confirmed the payment yourself.
        </div>
      )}
      {log.outcome === "unavailable" && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          The verifier could not judge this receipt (it went to manual review). Confirm the payment before approving.
        </div>
      )}

      <DetailRow label="Method">{log.method}</DetailRow>
      <DetailRow label="Reference" mono>{log.reference}</DetailRow>
      <DetailRow label="Verified amount">{log.amount != null ? birr(log.amount) : "—"}</DetailRow>
      <DetailRow label="Player">
        {log.user_id ? (
          <Link to={`/users/${log.user_id}`} className="inline-flex items-center gap-2 hover:text-brand" onClick={onClose}>
            <Avatar initials={user ? initials(user.first_name, user.last_name) : "?"} size={22} />
            {name || user?.phone_number || shortId(log.user_id)}
          </Link>
        ) : (
          "—"
        )}
      </DetailRow>
      <DetailRow label="Reason">{log.reason || "—"}</DetailRow>
      <DetailRow label="When">{date(log.created_at)}</DetailRow>

      <div className="mt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-txt-4">Raw provider response</div>
        <pre className="max-h-96 overflow-auto rounded-xl border border-edgeSoft bg-panel2 p-3 font-mono text-[12px] leading-relaxed text-txt-2">
          {prettyRaw(log.raw_response) || <span className="text-txt-4">No body captured.</span>}
        </pre>
      </div>
    </Drawer>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, Spinner, ErrorNote, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { birr, date } from "@/lib/format";
import { isCancellable, stateTone } from "@/pages/Games";

export function GameDetail() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useApi(() => api.gameDetail(id), [id]);
  const push = useToast((s) => s.push);
  const [busy, setBusy] = useState(false);

  const g = data?.game;
  const players = data?.players ?? [];

  const cancel = async () => {
    if (!g) return;
    const ok = window.confirm(
      `Cancel ${g.game_type} game and refund all ${g.player_count} player(s) ${birr(
        g.bet_amount,
      )} each?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.cancelGame(id);
      push(
        `Cancelled — refunded ${res.refunded_count} player(s) ${birr(res.refunded_amount)} total`,
        "success",
      );
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Cancel failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/games" className="text-sm text-sky-300 hover:underline">
        ← Back to games
      </Link>

      {loading && <Spinner />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {g && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-lg font-bold">{g.game_type} game</h1>
              <Badge tone={stateTone(g.state)}>{g.state}</Badge>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Game ID" value={g.id} />
              <Row label="Stake" value={birr(g.bet_amount)} />
              <Row label="Players" value={String(g.player_count)} />
              <Row label="Prize pool" value={birr(g.prize_pool)} />
              <Row label="House cut" value={`${Math.round(g.house_cut * 100)}%`} />
              <Row label="Created" value={date(g.created_at)} />
              {g.started_at && <Row label="Started" value={date(g.started_at)} />}
              {g.finished_at && <Row label="Finished" value={date(g.finished_at)} />}
            </dl>

            {isCancellable(g.state) && (
              <div className="mt-4 border-t border-edge pt-4">
                <Button variant="danger" disabled={busy} onClick={cancel} className="w-full">
                  Cancel game & refund all stakes
                </Button>
                <p className="mt-2 text-xs text-slate-500">
                  Refunds {birr(g.bet_amount)} to each active player and marks the game cancelled.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Players ({players.length})
            </h2>
            {players.length === 0 ? (
              <EmptyState message="No active players." />
            ) : (
              <div className="space-y-2">
                {players.map((p) => (
                  <div
                    key={p.user_id}
                    className="flex items-center justify-between rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                  >
                    <div>
                      <Link to={`/users/${p.user_id}`} className="font-medium text-sky-300 hover:underline">
                        {p.first_name} {p.last_name ?? ""}
                      </Link>
                      <div className="text-xs text-slate-500">{p.phone_number || "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Card {p.card_id}</span>
                      {p.is_eliminated && <Badge tone="red">out</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="break-all text-right font-medium text-slate-200">{value}</dd>
    </div>
  );
}

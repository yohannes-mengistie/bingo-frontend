export function money(n: number | undefined | null): string {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export function birr(n: number | undefined | null): string {
  return `${money(n)} Br`;
}

export function date(s: string | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortId(id: string | undefined): string {
  if (!id) return "—";
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function fullName(first?: string, last?: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

/** Compact "3s / 5m / 2h / 4d ago" for freshness indicators and recent rows. */
export function ago(s: string | number | undefined): string {
  if (!s) return "—";
  const then = typeof s === "number" ? s : new Date(s).getTime();
  if (isNaN(then)) return "—";
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/** Two-letter initials for an avatar chip. */
export function initials(first?: string, last?: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const a = f[0] ?? "";
  const b = l[0] ?? f[1] ?? "";
  return (a + b).toUpperCase() || "?";
}

export type Tone = "neutral" | "green" | "yellow" | "red" | "blue" | "gold";

/** Maps a status/state/category string to a badge tone, so color is consistent
 *  across every table without each page re-deciding. */
export function statusTone(value: string | undefined | null): Tone {
  switch ((value ?? "").toLowerCase()) {
    case "completed":
    case "active":
    case "success":
    case "resolved":
    case "winnings":
    case "approved":
      return "green";
    case "pending":
    case "countdown":
    case "drawing":
    case "sending":
    case "open":
      return "yellow";
    case "failed":
    case "cancelled":
    case "rejected":
    case "banned":
      return "red";
    case "waiting":
    case "transfer_in":
    case "transfer_out":
    case "deposit":
      return "blue";
    case "bonus_grant":
    case "bonus_stake":
    case "admin_credit":
    case "vip":
      return "gold";
    default:
      return "neutral";
  }
}

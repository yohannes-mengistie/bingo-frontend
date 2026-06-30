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

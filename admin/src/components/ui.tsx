import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { ago as agoFmt, type Tone } from "@/lib/format";

/* ---------------------------------------------------------------- Card ---- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-edgeSoft bg-panel ${className || "p-4"}`}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- Button ---- */

type Variant = "primary" | "ghost" | "danger" | "success" | "subtle";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-ink hover:brightness-105 shadow-glow",
  ghost: "bg-panel2 text-txt-2 hover:bg-edge border border-edge",
  subtle: "bg-transparent text-txt-2 hover:bg-panel2 border border-transparent",
  danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
  success: "bg-success/15 text-success border border-success/30 hover:bg-success/25",
};

export function Button({
  variant = "primary",
  icon,
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: {
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon && <Icon name={icon} size={15} />
      )}
      {children}
    </button>
  );
}

/** Compact square icon-only button for table row actions. */
export function IconButton({
  icon,
  tone = "neutral",
  title,
  loading,
  className = "",
  ...rest
}: {
  icon: IconName;
  tone?: "neutral" | "green" | "red" | "gold";
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const tones = {
    neutral: "hover:border-txt-3 hover:text-txt",
    green: "hover:border-success hover:bg-success/10 hover:text-success",
    red: "hover:border-danger hover:bg-danger/10 hover:text-danger",
    gold: "hover:border-brand hover:bg-brand/10 hover:text-brand",
  };
  return (
    <button
      title={title}
      disabled={loading || rest.disabled}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-edge bg-panel2 text-txt-2 transition disabled:opacity-40 ${tones[tone]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon name={icon} size={15} />
      )}
    </button>
  );
}

/* --------------------------------------------------------------- Badge ---- */

const badgeTones: Record<Tone | "purple", string> = {
  neutral: "bg-panel3 text-txt-2 border-edge",
  green: "bg-success/12 text-success border-success/25",
  yellow: "bg-warning/12 text-warning border-warning/25",
  red: "bg-danger/12 text-danger border-danger/25",
  blue: "bg-info/12 text-info border-info/25",
  gold: "bg-brand/12 text-brand border-brand/25",
  purple: "bg-fuchsia-500/12 text-fuchsia-300 border-fuchsia-500/25",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  const cls = badgeTones[(tone as Tone) ?? "neutral"] ?? badgeTones.neutral;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

/** A status badge with a leading dot, tone chosen automatically from the value. */
export function StatusBadge({ value, tone }: { value: string; tone: Tone }) {
  const cls = badgeTones[tone] ?? badgeTones.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}

/* ------------------------------------------------------------- Spinner ---- */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-10 text-txt-3">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-brand" />
      <span className="text-sm">{label ?? "Loading…"}</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message, icon }: { message: string; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      {icon && (
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-panel2 text-txt-3">
          <Icon name={icon} size={20} />
        </div>
      )}
      <span className="text-sm text-txt-3">{message}</span>
    </div>
  );
}

/** Shimmer placeholder rows for a loading table. */
export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-panel2" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- Toggle ---- */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm text-txt-2"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-edge"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------ StatCard ---- */

export function StatCard({
  icon,
  tone = "gold",
  label,
  value,
  sub,
}: {
  icon: IconName;
  tone?: "gold" | "green" | "blue" | "red";
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  const tones = {
    gold: "bg-brand/12 text-brand",
    green: "bg-success/12 text-success",
    blue: "bg-info/12 text-info",
    red: "bg-danger/12 text-danger",
  };
  return (
    <Card className="p-4">
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}>
        <Icon name={icon} size={18} />
      </div>
      <div className="text-xs font-medium text-txt-3">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-txt">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-txt-3">{sub}</div>}
    </Card>
  );
}

/* ----------------------------------------------------------- PageHeader ---- */

export function PageHeader({
  title,
  subtitle,
  actions,
  updatedAt,
  onReload,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  updatedAt?: number | null;
  onReload?: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-txt">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-txt-3">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {updatedAt !== undefined && <LiveIndicator updatedAt={updatedAt} onReload={onReload} />}
      </div>
    </div>
  );
}

/** "Live · updated Ns ago" chip; clicking it forces a reload. */
export function LiveIndicator({ updatedAt, onReload }: { updatedAt: number | null; onReload?: () => void }) {
  return (
    <button
      onClick={onReload}
      title="Auto-refreshing · click to refresh now"
      className="flex items-center gap-2 rounded-full border border-edgeSoft bg-panel px-3 py-1.5 text-xs text-txt-3 transition hover:border-edge hover:text-txt-2"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      Live · {updatedAt ? agoFmt(updatedAt) : "—"}
    </button>
  );
}

/* --------------------------------------------------------------- Table ---- */

/** A scrollable, sticky-header table inside a card. Pass thead/tbody as children. */
export function Table({ children, maxH = "60vh" }: { children: ReactNode; maxH?: string }) {
  return (
    <div className="overflow-auto" style={{ maxHeight: maxH }}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export const thClass =
  "sticky top-0 z-[1] bg-panel px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-txt-4 border-b border-edgeSoft";
export const tdClass = "px-4 py-3 border-b border-edgeSoft align-middle";
export const trClass = "transition hover:bg-panel2";

/** Avatar chip with initials. */
export function Avatar({ initials, size = 30 }: { initials: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-panel3 font-bold text-txt-2"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

/* --------------------------------------------------------------- Tabs ---- */

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
            active === t.key ? "bg-panel3 text-txt" : "text-txt-3 hover:bg-panel2 hover:text-txt-2"
          }`}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={`ml-1.5 text-[11px] ${active === t.key ? "text-brand" : "text-txt-4"}`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------- SearchInput ---- */

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3 py-2 ${className}`}>
      <Icon name="search" size={15} className="text-txt-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] text-txt outline-none placeholder:text-txt-4"
      />
    </div>
  );
}

/** Plain text input matching the design (for forms). */
export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-txt outline-none transition focus:border-brand placeholder:text-txt-4 ${className}`}
      {...rest}
    />
  );
}

/* --------------------------------------------------------- Pagination ---- */

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  shown,
}: {
  page: number; // 0-based
  pageSize: number;
  total?: number;
  onPage: (p: number) => void;
  shown: number; // rows on this page
}) {
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + shown;
  const hasMore = total !== undefined ? to < total : shown === pageSize;
  return (
    <div className="flex items-center justify-between border-t border-edgeSoft px-4 py-3 text-[13px] text-txt-3">
      <span>
        {total !== undefined ? (
          <>
            Showing <span className="text-txt-2">{from}</span>–<span className="text-txt-2">{to}</span> of{" "}
            <span className="text-txt-2">{total.toLocaleString()}</span>
          </>
        ) : (
          <>
            Page <span className="text-txt-2">{page + 1}</span>
          </>
        )}
      </span>
      <div className="flex gap-2">
        <IconButton icon="chevronLeft" title="Previous" disabled={page === 0} onClick={() => onPage(page - 1)} />
        <IconButton icon="chevronRight" title="Next" disabled={!hasMore} onClick={() => onPage(page + 1)} />
      </div>
    </div>
  );
}

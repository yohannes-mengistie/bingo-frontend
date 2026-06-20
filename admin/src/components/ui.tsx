import type { ReactNode, ButtonHTMLAttributes } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-edge bg-panel p-4 ${className}`}>{children}</div>;
}

type Variant = "primary" | "ghost" | "danger" | "success";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-ink hover:bg-brandDark",
  ghost: "bg-panel2 text-slate-200 hover:bg-edge border border-edge",
  danger: "bg-red-600/90 text-white hover:bg-red-600",
  success: "bg-emerald-600/90 text-white hover:bg-emerald-600",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-edge text-slate-300",
    green: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    yellow: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    red: "bg-red-500/15 text-red-300 border border-red-500/30",
    blue: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
    purple: "bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30",
  };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.neutral}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-slate-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-brand" />
      <span className="text-sm">{label ?? "Loading…"}</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-slate-500">{message}</div>;
}

import { ButtonHTMLAttributes, forwardRef } from "react";
import { haptic } from "@/lib/telegram";
import { useSettings } from "@/store/settingsStore";

type Variant = "primary" | "gold" | "ghost" | "danger" | "cyan";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-grad-purple text-white shadow-glow",
  gold: "bg-grad-gold text-bg shadow-glow-gold font-extrabold",
  cyan: "bg-grad-cyan text-white shadow-glow-cyan",
  ghost: "bg-white/5 text-ink border border-white/10",
  danger: "bg-neon-red/90 text-white",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", loading, fullWidth, className = "", children, onClick, disabled, ...rest },
  ref,
) {
  const hapticsEnabled = useSettings((s) => s.hapticsEnabled);
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      onClick={(e) => {
        if (hapticsEnabled) haptic.impact("medium");
        onClick?.(e);
      }}
      className={[
        "relative inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5",
        "font-display font-bold text-base active:scale-[0.97] transition-transform",
        "disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed",
        VARIANTS[variant],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : children}
    </button>
  );
});

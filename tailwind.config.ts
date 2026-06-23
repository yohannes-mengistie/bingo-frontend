import type { Config } from "tailwindcss";

// Neon / gradient dark theme — bold and premium to stand out from competitor
// bingo apps. Colors are exposed as CSS-var friendly tokens.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a14",
          soft: "#12122a",
          card: "#1a1a38",
          elevated: "#222247",
        },
        // Single brand accent (DESIGN.md). Used sparingly: primary CTAs and
        // active states only. Press = active, faded = disabled. Currently
        // Claude "coral" — swap these three values to re-theme the whole app.
        accent: {
          DEFAULT: "#cc785c",
          active: "#a9583e",
          disabled: "#e6dfd8",
        },
        neon: {
          purple: "#a855f7",
          blue: "#3b82f6",
          pink: "#ec4899",
          cyan: "#22d3ee",
          green: "#34d399",
          gold: "#fbbf24",
          red: "#f87171",
        },
        ink: {
          DEFAULT: "#f5f5ff",
          muted: "#9a9ac0",
          faint: "#5a5a7a",
        },
      },
      fontFamily: {
        display: ["'Baloo 2'", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(168,85,247,0.6)",
        "glow-cyan": "0 0 24px -4px rgba(34,211,238,0.6)",
        "glow-gold": "0 0 28px -2px rgba(251,191,36,0.7)",
        // Airbnb caps elevation at one soft tier (DESIGN.md) — used on raised
        // cards/menus, never on buttons (those stay flat).
        soft: "rgba(0,0,0,0.04) 0 0 0 1px, rgba(0,0,0,0.12) 0 2px 6px, rgba(0,0,0,0.18) 0 4px 8px",
      },
      backgroundImage: {
        "grad-purple": "linear-gradient(135deg,#a855f7 0%,#ec4899 100%)",
        // Primary brand accent — cyan → blue (no purple, per client).
        "grad-cyan": "linear-gradient(135deg,#22d3ee 0%,#3b82f6 100%)",
        "grad-gold": "linear-gradient(135deg,#fbbf24 0%,#f59e0b 100%)",
        "grad-dark": "radial-gradient(1200px 600px at 50% -10%,#1f1f45 0%,#0a0a14 60%)",
      },
      keyframes: {
        "ball-pop": {
          "0%": { transform: "scale(0.4) rotate(-20deg)", opacity: "0" },
          "60%": { transform: "scale(1.15) rotate(6deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        "pulse-ring": {
          "0%,100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "ball-pop": "ball-pop 0.5s cubic-bezier(0.18,0.89,0.32,1.28)",
        "pulse-ring": "pulse-ring 1.5s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;

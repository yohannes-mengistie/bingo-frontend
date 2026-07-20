import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm navy-black neutrals: body → panels → raised surfaces.
        ink: "#090b12",
        panel: "#11131c",
        panel2: "#171a26",
        panel3: "#1d2130",
        edge: "#262b3b",
        edgeSoft: "#1e2230",
        // Gold identity — primary actions and active nav only.
        brand: "#f5b301",
        brandDark: "#a87f0a",
        // Semantic — status colors, never used as the accent.
        success: "#34d399",
        danger: "#f87171",
        warning: "#fbbf24",
        info: "#60a5fa",
        // Text ramp.
        txt: "#e8ecf6",
        "txt-2": "#aab3c8",
        "txt-3": "#6b7488",
        "txt-4": "#454c5e",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 4px 16px -4px rgba(245,179,1,0.45)",
      },
    },
  },
  plugins: [],
} satisfies Config;

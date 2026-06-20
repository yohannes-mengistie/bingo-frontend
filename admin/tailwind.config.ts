import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a14",
        panel: "#12121f",
        panel2: "#1a1a2b",
        edge: "#262638",
        brand: "#f5b301",
        brandDark: "#c98f00",
      },
    },
  },
  plugins: [],
} satisfies Config;

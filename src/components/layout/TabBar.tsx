import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { haptic } from "@/lib/telegram";

const TABS = [
  { to: "/", key: "play", icon: "🎯" },
  { to: "/wallet", key: "wallet", icon: "💰" },
  { to: "/profile", key: "profile", icon: "👤" },
] as const;

export function TabBar() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="sticky bottom-0 z-40 mt-auto">
      <div className="glass mx-3 mb-3 flex items-center justify-around rounded-3xl px-2 py-2">
        {TABS.map((tab) => {
          const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
          return (
            <button
              key={tab.to}
              onClick={() => {
                haptic.select();
                nav(tab.to);
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors ${
                active ? "text-neon-purple" : "text-ink-faint"
              }`}
            >
              <span className={`text-xl ${active ? "drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" : ""}`}>
                {tab.icon}
              </span>
              <span className="text-[11px] font-semibold">{t(`nav.${tab.key}`)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

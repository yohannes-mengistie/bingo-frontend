import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/store/auth";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/transactions", label: "Transactions" },
  { to: "/games", label: "Games" },
  { to: "/bots", label: "Bots" },
  { to: "/bonus", label: "Bonus" },
  { to: "/reports", label: "Reports" },
  { to: "/users", label: "Users" },
  { to: "/staff", label: "Staff" },
];

export function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Backdrop — mobile only, shown while the drawer is open */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — off-canvas drawer on mobile, static column on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-edge bg-panel transition-transform duration-200 lg:static lg:w-56 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <span className="text-lg font-bold text-brand">🎰 Bingo Admin</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="text-xl leading-none text-slate-400 hover:text-slate-200 lg:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-brand text-ink" : "text-slate-300 hover:bg-panel2"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-edge px-4 py-4 text-xs text-slate-400">
          <div className="mb-2">
            Signed in as <span className="text-slate-200">{user?.first_name ?? "admin"}</span>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="font-semibold text-red-300 hover:text-red-200"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main column. min-w-0 lets inner tables scroll horizontally instead of
          stretching the whole page (which caused the displaced layout on mobile). */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — mobile only, holds the hamburger */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-edge bg-panel px-4 py-3 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="text-slate-200 hover:text-white"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-base font-bold text-brand">🎰 Bingo Admin</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

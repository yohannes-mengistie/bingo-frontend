import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/store/auth";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/transactions", label: "Transactions" },
  { to: "/games", label: "Games" },
  { to: "/users", label: "Users" },
  { to: "/staff", label: "Staff" },
];

export function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-panel">
        <div className="px-5 py-5 text-lg font-bold text-brand">🎰 Bingo Admin</div>
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

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

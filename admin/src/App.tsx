import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { isAuthed } from "@/store/auth";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Transactions } from "@/pages/Transactions";
import { Users } from "@/pages/Users";
import { UserDetail } from "@/pages/UserDetail";
import { Games } from "@/pages/Games";
import { GameDetail } from "@/pages/GameDetail";
import { Staff } from "@/pages/Staff";
import { Bots } from "@/pages/Bots";
import { Bonus } from "@/pages/Bonus";
import { PromoCodes } from "@/pages/PromoCodes";
import { Reports } from "@/pages/Reports";

function RequireAuth({ children }: { children: JSX.Element }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/games" element={<Games />} />
        <Route path="/games/:id" element={<GameDetail />} />
        <Route path="/bots" element={<Bots />} />
        <Route path="/bonus" element={<Bonus />} />
        <Route path="/promo" element={<PromoCodes />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/staff" element={<Staff />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

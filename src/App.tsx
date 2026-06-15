import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuth } from "@/store/authStore";
import { useWallet } from "@/store/walletStore";
import { ToastHost } from "@/components/ui/Toast";
import { Splash } from "@/screens/Splash";
import { NotRegistered } from "@/screens/NotRegistered";
import { Lobby } from "@/screens/Lobby";
import { CardSelect } from "@/screens/CardSelect";
import { GameRoom } from "@/screens/GameRoom";
import { WalletScreen } from "@/screens/Wallet";
import { Profile } from "@/screens/Profile";
import { Referral } from "@/screens/Referral";
import { Leaderboard } from "@/screens/Leaderboard";

export default function App() {
  const { status, authenticate, user } = useAuth();
  const refreshWallet = useWallet((s) => s.refresh);

  // Authenticate once on mount.
  useEffect(() => {
    if (status === "idle") authenticate();
  }, [status, authenticate]);

  // Hydrate wallet after auth.
  useEffect(() => {
    if (status === "authed") refreshWallet().catch(() => {});
  }, [status, refreshWallet]);

  return (
    <>
      <ToastHost />
      {renderByStatus(status, !!user)}
    </>
  );
}

function renderByStatus(
  status: ReturnType<typeof useAuth.getState>["status"],
  hasUser: boolean,
) {
  if (status === "authed" && hasUser) {
    return (
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/play/:gameType" element={<CardSelect />} />
        <Route path="/game/:gameId" element={<GameRoom />} />
        <Route path="/wallet" element={<WalletScreen />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/referral" element={<Referral />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="*" element={<Lobby />} />
      </Routes>
    );
  }
  if (status === "not_registered") return <NotRegistered />;
  return <Splash status={status} />;
}

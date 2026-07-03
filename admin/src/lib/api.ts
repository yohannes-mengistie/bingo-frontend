// Typed client for the Go backend admin API. All admin routes require a JWT
// from an admin login (POST /auth/login with telegram_id + password).

const BASE = (import.meta.env.VITE_API_BASE ?? "https://bingo-api-c6un.onrender.com").replace(/\/$/, "");
const API = `${BASE}/api/v1`;

const TOKEN_KEY = "bingo_admin_token";

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return token;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers });

  let body: any = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || res.statusText || "Request failed";
    throw new ApiError(typeof msg === "string" ? msg : "Request failed", res.status);
  }
  return body as T;
}

// ---- Types ----

export interface User {
  id: string;
  telegram_id: number;
  first_name: string;
  last_name?: string | null;
  phone_number: string;
  referal_code: string;
  role: "user" | "admin";
  banned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  balance: number;
  demo_balance: number;
}

export type UserWithWallet = User & { wallet?: Wallet };

export type TxType = "deposit" | "withdraw" | "transfer_in" | "transfer_out";
export type TxStatus = "pending" | "completed" | "failed" | "cancelled";

export interface Transaction {
  id: string;
  user_id: string;
  type: TxType;
  amount: number;
  status: TxStatus;
  transaction_type?: string | null; // payment method (Telebirr; legacy rows may be CBE)
  transaction_id?: string | null;
  reference?: string | null;
  created_at: string;
}

export type GameState = "WAITING" | "COUNTDOWN" | "DRAWING" | "FINISHED" | "CLOSED" | "CANCELLED";

export interface Game {
  id: string;
  game_type: string;
  state: GameState;
  bet_amount: number;
  min_players: number;
  player_count: number;
  prize_pool: number;
  house_cut: number;
  winner_id?: string | null;
  countdown_ends?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminGamePlayer {
  user_id: string;
  first_name: string;
  last_name?: string | null;
  phone_number: string;
  telegram_id: number;
  card_id: number;
  is_eliminated: boolean;
  joined_at: string;
}

export interface GameDetail {
  game: Game;
  players: AdminGamePlayer[];
}

export interface CancelGameResponse {
  message: string;
  game: Game;
  refunded_count: number;
  refunded_amount: number;
}

export interface DashboardStats {
  pending_deposits: number;
  pending_withdrawals: number;
  total_users: number;
  total_transactions: number;
  total_balance: number;
  games_by_type: Record<string, number>;
  total_house_cut: number;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ---- Endpoints ----

export const api = {
  login: (phone: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    }),

  dashboard: () => request<DashboardStats>("/admin/stats/dashboard"),

  users: (limit = 50, offset = 0) =>
    request<{ users: UserWithWallet[]; count: number }>(`/admin/users?limit=${limit}&offset=${offset}`),

  userDetail: (id: string) => request<{ user: UserWithWallet }>(`/admin/users/${id}`),

  setRole: (id: string, role: "user" | "admin") =>
    request<{ message: string }>(`/admin/users/${id}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),

  makeAdmin: (id: string, password: string) =>
    request<{ message: string }>(`/admin/users/${id}/make-admin`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  banUser: (id: string) => request<{ message: string }>(`/admin/users/${id}/ban`, { method: "POST" }),
  unbanUser: (id: string) => request<{ message: string }>(`/admin/users/${id}/unban`, { method: "POST" }),
  deleteUser: (id: string) => request<{ message: string }>(`/admin/users/${id}`, { method: "DELETE" }),

  adjustBalance: (id: string, amount: number, reason: string) =>
    request<{ message: string }>(`/admin/users/${id}/adjust-balance`, {
      method: "POST",
      body: JSON.stringify({ amount, reason }),
    }),

  // Transactions — all admin list endpoints return { transactions, count }.
  transactions: (limit = 50, offset = 0) =>
    request<{ transactions: Transaction[]; count: number }>(`/admin/transactions?limit=${limit}&offset=${offset}`),
  pendingDeposits: () => request<{ transactions: Transaction[] }>("/admin/transactions/pending/deposits"),
  pendingWithdrawals: () => request<{ transactions: Transaction[] }>("/admin/transactions/pending/withdrawals"),
  completedDeposits: () => request<{ transactions: Transaction[] }>("/admin/transactions/completed/deposits"),
  completedWithdrawals: () => request<{ transactions: Transaction[] }>("/admin/transactions/completed/withdrawals"),
  failed: () => request<{ transactions: Transaction[] }>("/admin/transactions/failed"),
  transfers: () => request<{ transactions: Transaction[] }>("/admin/transactions/transfers"),

  approveDeposit: (id: string) =>
    request<{ message: string }>(`/admin/transactions/${id}/approve-deposit`, { method: "POST" }),
  rejectDeposit: (id: string) =>
    request<{ message: string }>(`/admin/transactions/${id}/reject-deposit`, { method: "POST" }),
  approveWithdrawal: (id: string) =>
    request<{ message: string }>(`/admin/transactions/${id}/approve-withdrawal`, { method: "POST" }),
  rejectWithdrawal: (id: string) =>
    request<{ message: string }>(`/admin/transactions/${id}/reject-withdrawal`, { method: "POST" }),
  cancelTransaction: (id: string) =>
    request<{ message: string }>(`/admin/transactions/${id}/cancel`, { method: "POST" }),

  // Games
  games: (opts: { state?: GameState; type?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.state) q.set("state", opts.state);
    if (opts.type) q.set("type", opts.type);
    q.set("limit", String(opts.limit ?? 100));
    q.set("offset", String(opts.offset ?? 0));
    return request<{ games: Game[]; total: number; count: number; limit: number; offset: number }>(
      `/admin/games?${q.toString()}`,
    );
  },
  gameDetail: (id: string) => request<GameDetail>(`/admin/games/${id}`),
  cancelGame: (id: string) =>
    request<CancelGameResponse>(`/admin/games/${id}/cancel`, { method: "POST" }),
};

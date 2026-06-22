// Typed fetch wrapper around the Go backend. Attaches the JWT and normalizes
// error handling. Endpoints mirror cmd/server/main.go.

import type {
  BingoCard,
  Game,
  GamePlayer,
  GameStateResponse,
  GameType,
  LoginResponse,
  PaymentMethod,
  RecentWinner,
  Transaction,
  User,
  Wallet,
} from "@/types/api";
import { DEV_MOCK, generateMockCard } from "@/lib/devMock";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error");
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  base: API_BASE,

  // ---- Auth ----
  telegramLogin: (initData: string) =>
    request<LoginResponse>("POST", "/api/v1/auth/telegram", {
      init_data: initData,
    }),

  // ---- Profile ----
  me: () => request<{ user: User }>("GET", "/api/v1/me").then((r) => r.user),
  updateName: (first_name: string, last_name?: string | null) =>
    request<{ user: User }>("PUT", "/api/v1/me/name", { first_name, last_name }).then((r) => r.user),

  // ---- Wallet ----
  myWallet: () => request<{ wallet: Wallet }>("GET", "/api/v1/me/wallet").then((r) => r.wallet),
  deposits: () =>
    request<{ deposits?: Transaction[] }>("GET", "/api/v1/me/wallet/deposits").then((r) => ({
      transactions: r.deposits ?? [],
    })),
  withdrawals: () =>
    request<{ withdrawals?: Transaction[] }>("GET", "/api/v1/me/wallet/withdrawals").then((r) => ({
      transactions: r.withdrawals ?? [],
    })),
  transfers: () =>
    request<{ transfers?: any[] }>("GET", "/api/v1/me/wallet/transfers"),
  deposit: (amount: number, transaction_type: PaymentMethod, transaction_id: string) =>
    request<{ transaction: Transaction }>("POST", "/api/v1/wallet/deposit", {
      amount,
      transaction_type,
      transaction_id,
    }),
  withdraw: (amount: number, account_number: string, account_type: PaymentMethod) =>
    request<{ transaction: Transaction }>("POST", "/api/v1/wallet/withdraw", {
      amount,
      account_number,
      account_type,
    }),
  transfer: (receiver_id: string, amount: number) =>
    request<unknown>("POST", "/api/v1/wallet/transfer", { receiver_id, amount }),

  // ---- Games ----
  games: (type?: GameType) =>
    request<{ games: Game[] }>(
      "GET",
      `/api/v1/games${type ? `?type=${type}` : ""}`,
    ),
  recentWinners: (limit = 8) =>
    request<{ winners: RecentWinner[] }>(
      "GET",
      `/api/v1/games/recent-winners?limit=${limit}`,
    ),
  gameState: (gameId: string) =>
    request<GameStateResponse>("GET", `/api/v1/games/${gameId}/state`),
  card: (cardId: number) =>
    DEV_MOCK
      ? Promise.resolve({ card: generateMockCard(cardId) })
      : request<{ card: BingoCard }>("GET", `/api/v1/cards/${cardId}`),
  myGames: (limit = 20, offset = 0) =>
    request<{ games: any[]; count: number }>(
      "GET",
      `/api/v1/me/games?limit=${limit}&offset=${offset}`,
    ),
  myPlayerInGame: (gameId: string) =>
    request<{ player: GamePlayer | null }>(
      "GET",
      `/api/v1/me/games/${gameId}`,
    ),
  join: (gameId: string, card_id: number) =>
    request<{ player: GamePlayer }>("POST", `/api/v1/games/${gameId}/join`, {
      card_id,
    }),
  leave: (gameId: string) =>
    request<{ message: string }>("POST", `/api/v1/games/${gameId}/leave`, {}),
  claimBingo: (gameId: string, marked_numbers: number[]) =>
    request<{ winner: boolean; message: string }>(
      "POST",
      `/api/v1/games/${gameId}/bingo`,
      { marked_numbers },
    ),
};

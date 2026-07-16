// Mirrors the Go backend domain types (internal/domain/*.go). Field names match
// the JSON tags exactly — do not rename without checking the backend.

export type GameType = "REGULAR" | "VIP";

export type GameState =
  | "WAITING"
  | "COUNTDOWN"
  | "DRAWING"
  | "FINISHED"
  | "CLOSED"
  | "CANCELLED";

export type BingoLetter = "B" | "I" | "N" | "G" | "O";

// Mirrors backend domain.SupportedPaymentMethods — all phone-based mobile money.
export type PaymentMethod = "Telebirr" | "CBEBirr" | "Mpesa";

export interface User {
  id: string;
  telegram_id: number;
  first_name: string;
  last_name?: string | null;
  phone_number: string;
  referal_code: string; // note: backend spells it "referal_code"
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  user_id: string;
  balance: number;
  demo_balance: number;
  updated_at: string;
}

export interface Game {
  id: string;
  game_type: GameType;
  state: GameState;
  bet_amount: number;
  min_players: number;
  player_count: number;
  prize_pool: number;
  house_cut: number;
  round_code?: string | null;
  winner_id?: string | null;
  countdown_ends?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecentWinner {
  game_id: string;
  game_type: GameType;
  winner_name: string;
  prize: number;
  finished_at: string;
}

export interface GamePlayer {
  id: string;
  game_id: string;
  user_id: string;
  card_id: number;
  is_eliminated: boolean;
  joined_at: string;
  left_at?: string | null;
}

export interface BingoCard {
  id: number;
  numbers: number[][]; // 5x5; center (numbers[2][2]) is 0 = FREE
}

export interface DrawnNumber {
  letter: BingoLetter;
  number: number;
  drawn_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  transaction_type?: PaymentMethod | null;
  transaction_id?: string | null;
  reference?: string | null;
  created_at: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface GameStateResponse {
  game: Game;
  drawnNumbers: DrawnNumber[] | null;
  takenCards: number[] | null;
}

// ---- WebSocket events ----

export type WsEvent =
  | "INITIAL_STATE"
  | "GAME_STATUS"
  | "PLAYER_COUNT"
  | "CARDS_TAKEN"
  | "COUNTDOWN"
  | "NUMBER_DRAWN"
  | "PLAYER_JOINED"
  | "PLAYER_ELIMINATED"
  | "WINNER"
  | "PLAYER_LEFT"
  | "NEW_GAME_AVAILABLE";

export interface WsMessage<T = any> {
  event: WsEvent;
  data: T;
}

/** One winning card of a finished game (its owner, split share, and marks). */
export interface GameWinner {
  user_id: string;
  winner_name: string;
  card_id: number;
  prize: number;
  marked_numbers: number[];
}

export interface WinnerData {
  user_id: string;
  prize: number;
  // newer backend also sends name / card / marked numbers (see git history)
  winner_name?: string;
  card_id?: number;
  marked_numbers?: number[];
  // When multiple cards complete on the same draw they split the pot. `winners`
  // lists every co-winner and their share; the top-level fields above mirror the
  // primary (first) winner for backward compatibility. `prize_pool` is the full
  // pot, `split` is true when there is more than one winner.
  winners?: GameWinner[];
  prize_pool?: number;
  split?: boolean;
}

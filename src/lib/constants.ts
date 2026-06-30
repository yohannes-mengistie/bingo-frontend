// Game constants — mirror of internal/domain/constants.go & game.go.
import type { GameType } from "@/types/api";

export type Stake = { type: GameType; bet: number; vip: boolean };

// Two tiers only: a standard 10-birr game and a premium 50-birr VIP game.
// Mirrors the backend GameType enum (REGULAR / VIP).
export const STAKES: Stake[] = [
  { type: "REGULAR", bet: 10, vip: false },
  { type: "VIP", bet: 50, vip: true },
];

export const BET_BY_TYPE: Record<GameType, number> = Object.fromEntries(
  STAKES.map((s) => [s.type, s.bet]),
) as Record<GameType, number>;

export const MIN_PLAYERS = 2;
export const MAX_CARDS_PER_PLAYER = 4; // mirror of domain.MaxCardsPerPlayer
export const HOUSE_CUT = 0.2; // 20% — prize = bet * players * 0.8
export const COUNTDOWN_SECONDS = 60;
export const MIN_CARD_ID = 1;
export const MAX_CARD_ID = 200;
export const GRID = 5;
export const CENTER_INDEX = 12; // numbers[2][2] = FREE

// House payment accounts shown on the deposit screen so players know where to
// send money. Configure the real values via Vercel/.env (VITE_* are inlined
// into the public bundle — these are destination accounts, not secrets).
export const PAYMENT_ACCOUNTS: Record<
  "Telebirr" | "CBE",
  { number: string; name: string }
> = {
  Telebirr: {
    number: import.meta.env.VITE_TELEBIRR_NUMBER ?? "0962860754",
    name: import.meta.env.VITE_PAYMENT_NAME ?? "Habesha Bingo",
  },
  CBE: {
    number: import.meta.env.VITE_CBE_ACCOUNT ?? "1000470126934",
    name: import.meta.env.VITE_PAYMENT_NAME ?? "Habesha Bingo",
  },
};

export const LETTERS = ["B", "I", "N", "G", "O"] as const;

// Column number ranges, mirroring constants.go
export const COLUMN_RANGES: Record<(typeof LETTERS)[number], [number, number]> = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};

/** Prize pool a winner takes for a full game of `players` at `bet`. */
export function estimatedPrize(bet: number, players: number): number {
  return bet * players * (1 - HOUSE_CUT);
}

export const CURRENCY = "Birr";

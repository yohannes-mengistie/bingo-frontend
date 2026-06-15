// Game constants — mirror of internal/domain/constants.go & game.go.
import type { GameType } from "@/types/api";

export const STAKES: { type: GameType; bet: number }[] = [
  { type: "G1", bet: 5 },
  { type: "G2", bet: 7 },
  { type: "G3", bet: 10 },
  { type: "G4", bet: 20 },
  { type: "G5", bet: 50 },
  { type: "G6", bet: 100 },
  { type: "G7", bet: 200 },
];

export const BET_BY_TYPE: Record<GameType, number> = Object.fromEntries(
  STAKES.map((s) => [s.type, s.bet]),
) as Record<GameType, number>;

export const MIN_PLAYERS = 2;
export const HOUSE_CUT = 0.2; // 20% — prize = bet * players * 0.8
export const COUNTDOWN_SECONDS = 60;
export const MIN_CARD_ID = 1;
export const MAX_CARD_ID = 200;
export const GRID = 5;
export const CENTER_INDEX = 12; // numbers[2][2] = FREE

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

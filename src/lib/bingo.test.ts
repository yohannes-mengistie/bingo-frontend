import { describe, expect, it } from "vitest";
import {
  CENTER,
  claimPositions,
  findWinningPositions,
  flattenCard,
  hasBingo,
  letterForNumber,
} from "./bingo";
import type { BingoCard } from "@/types/api";

// Card 1 from the backend's hardcoded data (pkg/bingo/card.go), already in
// [row][col] order with col 0..4 = B,I,N,G,O and center (numbers[2][2]) = 0.
const CARD1: BingoCard = {
  id: 1,
  numbers: [
    [15, 28, 31, 58, 61],
    [5, 30, 45, 46, 73],
    [3, 16, 0, 48, 65],
    [1, 20, 33, 50, 75],
    [12, 18, 43, 60, 63],
  ],
};

describe("letterForNumber", () => {
  it("maps number ranges to BINGO columns", () => {
    expect(letterForNumber(1)).toBe("B");
    expect(letterForNumber(15)).toBe("B");
    expect(letterForNumber(16)).toBe("I");
    expect(letterForNumber(45)).toBe("N");
    expect(letterForNumber(60)).toBe("G");
    expect(letterForNumber(75)).toBe("O");
  });
});

describe("flattenCard", () => {
  it("flattens row-major to length 25 with center = 0", () => {
    const flat = flattenCard(CARD1);
    expect(flat).toHaveLength(25);
    expect(flat[CENTER]).toBe(0);
    expect(flat[0]).toBe(15);
    expect(flat[24]).toBe(63);
  });
});

describe("findWinningPositions", () => {
  it("has no bingo for an empty board (center alone is not a line)", () => {
    expect(hasBingo(new Set())).toBe(false);
  });

  it("detects a full top row (positions 0-4)", () => {
    const marked = new Set([0, 1, 2, 3, 4]);
    expect(findWinningPositions(marked)).toEqual([0, 1, 2, 3, 4]);
  });

  it("detects a column", () => {
    const marked = new Set([0, 5, 10, 15, 20]);
    expect(hasBingo(marked)).toBe(true);
  });

  it("uses the free center for the main diagonal", () => {
    // diagonal 0,6,12,18,24 — 12 is the free center and need not be marked.
    const marked = new Set([0, 6, 18, 24]);
    expect(findWinningPositions(marked)).toEqual([0, 6, 12, 18, 24]);
  });

  it("detects four corners", () => {
    const marked = new Set([0, 4, 20, 24]);
    expect(findWinningPositions(marked)).toEqual([0, 4, 20, 24]);
  });

  it("does not falsely detect an incomplete line", () => {
    expect(hasBingo(new Set([0, 1, 2, 3]))).toBe(false);
  });
});

describe("claimPositions", () => {
  it("always includes the free center and is sorted", () => {
    expect(claimPositions(new Set([4, 0]))).toEqual([0, 4, CENTER].sort((a, b) => a - b));
  });
});

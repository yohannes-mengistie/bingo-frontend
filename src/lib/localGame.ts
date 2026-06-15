// Client-side practice game. Emits the SAME message shape as the real
// GameSocket so GameRoom can render demo and live games identically. It never
// contacts the backend and never touches the wallet — it's purely for practice.

import { letterForNumber } from "./bingo";
import { BET_BY_TYPE, estimatedPrize } from "./constants";
import type { GameType, WsMessage } from "@/types/api";

type Listener = (msg: WsMessage) => void;
type StatusListener = (s: "connecting" | "open" | "closed") => void;

const COUNTDOWN_FROM = 5;
const DRAW_INTERVAL_MS = 2500;

function shuffled(): number[] {
  const a = Array.from({ length: 75 }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class LocalGameEngine {
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pool = shuffled();
  private drawnCount = 0;
  private readonly bet: number;
  private readonly players: number;

  constructor(type: GameType) {
    this.bet = BET_BY_TYPE[type] ?? 5;
    this.players = 2 + Math.floor(Math.random() * 5); // simulated 2..6
  }

  on(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  onStatus(l: StatusListener) {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }
  private emit(msg: WsMessage) {
    this.listeners.forEach((l) => l(msg));
  }
  private status(s: "connecting" | "open" | "closed") {
    this.statusListeners.forEach((l) => l(s));
  }
  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  connect() {
    this.status("open");
    this.emit({
      event: "INITIAL_STATE",
      data: {
        game: {
          id: "demo",
          state: "COUNTDOWN",
          bet_amount: this.bet,
          player_count: this.players,
          prize_pool: estimatedPrize(this.bet, this.players),
        },
        drawnNumbers: [],
        takenCards: [],
        playerCount: this.players,
        secondsLeft: COUNTDOWN_FROM,
      },
    });

    for (let s = COUNTDOWN_FROM; s >= 1; s--) {
      this.later(
        () => this.emit({ event: "COUNTDOWN", data: { secondsLeft: s } }),
        (COUNTDOWN_FROM - s) * 1000,
      );
    }
    this.later(() => this.startDrawing(), COUNTDOWN_FROM * 1000);
  }

  private startDrawing() {
    this.emit({
      event: "GAME_STATUS",
      data: { state: "DRAWING", player_count: this.players },
    });
    this.drawNext();
  }

  private drawNext() {
    if (this.drawnCount >= this.pool.length) return;
    const number = this.pool[this.drawnCount++];
    this.emit({
      event: "NUMBER_DRAWN",
      data: {
        letter: letterForNumber(number),
        number,
        drawn_at: new Date().toISOString(),
      },
    });
    this.later(() => this.drawNext(), DRAW_INTERVAL_MS);
  }

  close() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.listeners.clear();
    this.statusListeners.clear();
    this.status("closed");
  }
}

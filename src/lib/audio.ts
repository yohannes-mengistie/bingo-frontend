// Number caller + sound effects. Plays an Amharic voice clip for each drawn
// number when available (public/audio/am/<n>.mp3); otherwise degrades to a
// short synthesized beep so the game still has audible feedback.

import { letterForNumber } from "./bingo";

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

const cache = new Map<string, HTMLAudioElement>();
function clip(src: string): HTMLAudioElement {
  let a = cache.get(src);
  if (!a) {
    a = new Audio(src);
    a.preload = "auto";
    cache.set(src, a);
  }
  return a;
}

function beep(freq: number, durationMs = 160) {
  const c = audioCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + durationMs / 1000);
}

function tryPlay(src: string, fallback: () => void) {
  const a = clip(src);
  a.currentTime = 0;
  const p = a.play();
  if (p && typeof p.catch === "function") p.catch(() => fallback());
}

export const sound = {
  enabled: true,

  /** Call out a drawn number in Amharic (with letter), beep fallback. */
  callNumber(n: number) {
    if (!this.enabled) return;
    const letter = letterForNumber(n);
    // Map column letter to a rising tone for the beep fallback.
    const tones: Record<string, number> = { B: 392, I: 440, N: 494, G: 523, O: 587 };
    const base = tones[letter] ?? 440;
    tryPlay(`audio/am/${n}.mp3`, () => beep(base + (n % 15) * 6));
  },

  win() {
    if (!this.enabled) return;
    tryPlay("sounds/win.mp3", () => {
      beep(660, 120);
      setTimeout(() => beep(880, 200), 130);
    });
  },

  daub() {
    if (!this.enabled) return;
    tryPlay("sounds/daub.mp3", () => beep(720, 70));
  },

  join() {
    if (!this.enabled) return;
    tryPlay("sounds/join.mp3", () => beep(540, 90));
  },
};

// Number caller + sound effects.
//
// Playback uses the Web Audio API: each clip is fetched once and decoded into an
// AudioBuffer, then played through a short gain envelope. Versus HTMLAudio this
// gives gapless, zero-latency, click-free calls with no cross-clip overlap — so
// the caller flows instead of stuttering. Falls back to a synthesized beep if a
// clip is missing or can't decode.

import { letterForNumber } from "./bingo";

const MAX_CALL = 75; // clips are /audio/am/1..75.mp3

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

function resume() {
  const c = audioCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// Decoded-buffer cache. The value is a promise (resolving to the buffer or null)
// so concurrent requests for the same clip share one fetch+decode.
const buffers = new Map<string, Promise<AudioBuffer | null>>();
function load(src: string): Promise<AudioBuffer | null> {
  let p = buffers.get(src);
  if (!p) {
    const c = audioCtx();
    p = c
      ? fetch(src)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((buf) => c.decodeAudioData(buf))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(src, p);
  }
  return p;
}

// The currently-playing source per exclusive group, so a new call cleanly cuts
// the previous one (they never pile up on top of each other).
const active = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();

function playBuffer(
  src: string,
  opts: { volume?: number; group?: string; fallback?: () => void } = {},
) {
  const c = audioCtx();
  if (!c) return opts.fallback?.();
  resume();
  load(src)
    .then((buffer) => {
      if (!buffer) return opts.fallback?.();
      const now = c.currentTime;
      const vol = opts.volume ?? 1;

      // Fade out + stop whatever is already playing in this group (avoids the
      // click of a hard stop and any muddy overlap of two calls).
      if (opts.group) {
        const prev = active.get(opts.group);
        if (prev) {
          try {
            prev.gain.gain.cancelScheduledValues(now);
            prev.gain.gain.setValueAtTime(prev.gain.gain.value, now);
            prev.gain.gain.linearRampToValueAtTime(0.0001, now + 0.02);
            prev.src.stop(now + 0.03);
          } catch {
            /* already stopped */
          }
          active.delete(opts.group);
        }
      }

      const source = c.createBufferSource();
      source.buffer = buffer;
      const gain = c.createGain();

      // Micro fade in/out so the clip edges never click.
      const end = now + buffer.duration;
      const fadeIn = 0.012;
      const fadeOut = Math.min(0.04, buffer.duration / 3);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + fadeIn);
      gain.gain.setValueAtTime(vol, Math.max(now + fadeIn, end - fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, end);

      source.connect(gain).connect(c.destination);
      source.start(now);

      if (opts.group) {
        active.set(opts.group, { src: source, gain });
        source.onended = () => {
          if (active.get(opts.group!)?.src === source) active.delete(opts.group!);
        };
      }
    })
    .catch(() => opts.fallback?.());
}

function beep(freq: number, durationMs = 160) {
  const c = audioCtx();
  if (!c) return;
  resume();
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

const CALL_TONES: Record<string, number> = { B: 392, I: 440, N: 494, G: 523, O: 587 };

export const sound = {
  enabled: true,

  /**
   * Warm the audio pipeline: resume the context and fetch+decode every call clip
   * (and the win cue) up front, so the very first call plays instantly and every
   * later one is gapless. Safe to call repeatedly — cached after the first time.
   * Call it when the game room mounts.
   */
  preloadCalls() {
    if (!this.enabled) return;
    resume();
    for (let n = 1; n <= MAX_CALL; n++) load(`/audio/am/${n}.mp3`);
    load("/sounds/bingo.aac");
  },

  /** Call out a drawn number in Amharic (with letter); beep fallback. */
  callNumber(n: number) {
    if (!this.enabled) return;
    const base = CALL_TONES[letterForNumber(n)] ?? 440;
    // "voice" group: a new call cleanly replaces any still-playing one.
    playBuffer(`/audio/am/${n}.mp3`, {
      group: "voice",
      fallback: () => beep(base + (n % 15) * 6),
    });
  },

  /** The "Bingo!" voice announcement, played to the room when someone wins. */
  bingo() {
    if (!this.enabled) return;
    playBuffer("/sounds/bingo.aac", {
      group: "voice", // cuts any in-flight number call
      fallback: () => {
        beep(660, 120);
        setTimeout(() => beep(880, 200), 130);
      },
    });
  },

  daub() {
    if (!this.enabled) return;
    playBuffer("/sounds/daub.mp3", { volume: 0.8, fallback: () => beep(720, 70) });
  },

  join() {
    if (!this.enabled) return;
    playBuffer("/sounds/join.mp3", { volume: 0.8, fallback: () => beep(540, 90) });
  },
};

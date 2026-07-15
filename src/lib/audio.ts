// Number caller + sound effects.
//
// Playback uses the Web Audio API: each clip is fetched once and decoded into an
// AudioBuffer, then played through a short gain envelope. Versus HTMLAudio this
// gives gapless, zero-latency, click-free calls with no cross-clip overlap — so
// the caller flows instead of stuttering. Falls back to a synthesized beep if a
// clip is missing or can't decode.

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

// ---- Sequential voice caller ----------------------------------------------
// Number calls are QUEUED and played one-at-a-time to completion, so every
// called number is announced in order and none get cut off by the next call
// (the old "replace the in-flight clip" behaviour dropped voices whenever calls
// bunched up). Clips are pre-decoded (see preloadCalls) so each starts instantly
// when dequeued; in steady play the queue empties between calls, keeping the
// voice tight to the board.

let voiceQueue: number[] = [];
let voiceDraining = false;
let currentVoice: AudioBufferSourceNode | null = null;

function stopCurrentVoice() {
  if (currentVoice) {
    try {
      currentVoice.onended = null;
      currentVoice.stop();
    } catch {
      /* already stopped */
    }
    currentVoice = null;
  }
}

// Play one clip to its end, resolving when it finishes (or immediately on error).
function playVoiceClip(src: string): Promise<void> {
  return new Promise((resolve) => {
    const c = audioCtx();
    if (!c) return resolve();
    resume();
    load(src)
      .then((buffer) => {
        const cc = audioCtx();
        if (!cc) return resolve();
        if (!buffer) {
          // Missing/undecodable clip: short beep so the call isn't fully silent.
          beep(460, 180);
          return void setTimeout(resolve, 240);
        }
        const now = cc.currentTime;
        const source = cc.createBufferSource();
        source.buffer = buffer;
        const gain = cc.createGain();
        const end = now + buffer.duration;
        const fadeIn = 0.01;
        const fadeOut = Math.min(0.035, buffer.duration / 4);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(1, now + fadeIn);
        gain.gain.setValueAtTime(1, Math.max(now + fadeIn, end - fadeOut));
        gain.gain.linearRampToValueAtTime(0.0001, end);
        source.connect(gain).connect(cc.destination);
        currentVoice = source;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (currentVoice === source) currentVoice = null;
          resolve();
        };
        source.onended = finish;
        // Backstop: never let the queue hang if onended doesn't fire.
        setTimeout(finish, buffer.duration * 1000 + 300);
        source.start(now);
      })
      .catch(() => resolve());
  });
}

async function drainVoiceQueue() {
  if (voiceDraining) return;
  voiceDraining = true;
  try {
    while (voiceQueue.length) {
      const n = voiceQueue.shift()!;
      await playVoiceClip(`/audio/am/${n}.mp3`);
    }
  } finally {
    voiceDraining = false;
  }
}

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

  /** Queue a drawn number's Amharic call — played in order, never cut off. */
  callNumber(n: number) {
    if (!this.enabled) return;
    resume();
    voiceQueue.push(n);
    // Safety valve: if calls ever run far ahead of the voice (e.g. a burst after
    // a reconnect), keep only the most recent few so the caller re-syncs.
    if (voiceQueue.length > 4) voiceQueue = voiceQueue.slice(-4);
    drainVoiceQueue();
  },

  /** The "Bingo!" voice announcement — stops number calls and plays once. */
  bingo() {
    if (!this.enabled) return;
    voiceQueue = [];
    stopCurrentVoice();
    playBuffer("/sounds/bingo.aac", {
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

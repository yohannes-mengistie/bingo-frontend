import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/components/ui/Toast";
import { FullSpinner } from "@/components/ui/Spinner";
import { BalancePill } from "@/components/ui/BalancePill";
import { LangToggle } from "@/components/ui/LangToggle";
import {
  MAX_CARD_ID,
  MIN_CARD_ID,
  BET_BY_TYPE,
  MAX_CARDS_PER_PLAYER,
} from "@/lib/constants";
import { money } from "@/lib/format";
import { api, ApiError } from "@/lib/api";
import { GameSocket } from "@/lib/ws";
import { haptic } from "@/lib/telegram";
import { sound } from "@/lib/audio";
import { finishedGames } from "@/lib/finishedGames";
import { useWallet } from "@/store/walletStore";
import { useSettings } from "@/store/settingsStore";
import type { GameType } from "@/types/api";

const ALL_CARDS = Array.from({ length: MAX_CARD_ID - MIN_CARD_ID + 1 }, (_, i) => i + MIN_CARD_ID);

// `home` = this is the Play tab landing (route "/"): it shows the bottom tab
// bar and a balance + VIP + language header instead of a back button. Without
// it, it's the VIP sub-screen (back button, no tabs) reached from the home VIP
// button.
//
// Flow: tapping a card RESERVES it immediately (no charge, no Join button). The
// stake is taken for everyone when the 40s countdown ends, at which point the
// game starts and reserved players are pulled straight into the board.
export function CardSelect({ home = false }: { home?: boolean }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { gameType } = useParams<{ gameType: GameType }>();
  const type = (gameType ?? "REGULAR") as GameType;
  const bet = BET_BY_TYPE[type] ?? 0;
  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  const push = useToast((s) => s.push);
  const soundEnabled = useSettings((s) => s.soundEnabled);
  sound.enabled = soundEnabled;

  // Pull a fresh balance whenever the picker opens, so the affordability gating
  // reflects real money — not a stale cached value from a prior game / deposit.
  useEffect(() => {
    refreshWallet().catch(() => {});
  }, [refreshWallet]);

  // Optimistic selection overlay: cards whose on-screen state is ahead of the
  // server. A tap flips the card here INSTANTLY (glow appears/disappears like
  // a click); the reserve/release request then runs in the background and the
  // entry is dropped once the server confirms — or reverted if it refuses.
  const [overlay, setOverlay] = useState<Map<number, "add" | "remove">>(new Map());

  // Fetch/create the active game for this stake (creates if none).
  const gameQ = useQuery({
    queryKey: ["game-for-type", type],
    queryFn: async () => (await api.games(type)).games[0] ?? null,
  });
  const gameId = gameQ.data?.id ?? null;

  // Poll taken cards + live game state (fallback / periodic reconcile).
  const stateQ = useQuery({
    queryKey: ["game-state", gameId],
    queryFn: () => api.gameState(gameId!),
    enabled: !!gameId,
    refetchInterval: 3000,
  });

  // Live taken-cards set: seeded from poll snapshots, then kept current in
  // REAL TIME by the game WebSocket — the backend broadcasts PLAYER_JOINED /
  // PLAYER_LEFT with the card_id on every reservation and release, so other
  // players' picks grey out here within milliseconds instead of waiting for
  // the next 3s poll. That makes two-players-tap-the-same-card races rare;
  // when one still happens, the server arbitrates and the loser's optimistic
  // tap reverts (see syncCard).
  const [takenLive, setTakenLive] = useState<Set<number>>(new Set());
  const [livePrize, setLivePrize] = useState<number | null>(null);
  useEffect(() => {
    if (stateQ.data?.takenCards) setTakenLive(new Set(stateQ.data.takenCards));
  }, [stateQ.data]);
  useEffect(() => {
    if (!gameId) return;
    setLivePrize(null); // prize belongs to a game; reset when it changes
    const feed = new GameSocket(gameId);
    const off = feed.on((msg) => {
      switch (msg.event) {
        case "INITIAL_STATE":
          if (Array.isArray(msg.data?.takenCards)) {
            setTakenLive(new Set<number>(msg.data.takenCards));
          }
          if (typeof msg.data?.game?.prize_pool === "number") {
            setLivePrize(msg.data.game.prize_pool);
          }
          break;
        case "PLAYER_JOINED":
        case "PLAYER_LEFT": {
          const cardId = msg.data?.card_id;
          if (typeof cardId === "number") {
            setTakenLive((prev) => {
              const n = new Set(prev);
              if (msg.event === "PLAYER_JOINED") n.add(cardId);
              else n.delete(cardId);
              return n;
            });
          }
          if (typeof msg.data?.prize_pool === "number") {
            setLivePrize(msg.data.prize_pool);
          }
          break;
        }
      }
    });
    feed.connect();
    return () => {
      off();
      feed.close();
    };
  }, [gameId]);
  const taken = takenLive;

  // Live snapshot for the hero: prize, player count, state and the countdown.
  const liveGame = stateQ.data?.game ?? gameQ.data ?? null;
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const countdownEnds = liveGame?.countdown_ends ? Date.parse(liveGame.countdown_ends) : null;
  const secondsLeft =
    countdownEnds != null ? Math.max(0, Math.ceil((countdownEnds - nowTs) / 1000)) : null;
  const isCountdown = liveGame?.state === "COUNTDOWN" && secondsLeft != null;
  // Human-readable daily round code from the backend, e.g. "3" (3rd game of the
  // day). Falls back to a game-id slice for older games without the field.
  const roundCode =
    liveGame?.round_code ||
    (gameId ? gameId.replace(/-/g, "").slice(0, 4).toUpperCase() : "----");

  // Cards this player has reserved in the current game.
  const ownedQ = useQuery({
    queryKey: ["my-cards", gameId],
    queryFn: () => api.myCardsInGame(gameId!),
    enabled: !!gameId,
    refetchInterval: 3000,
  });
  const serverOwned = useMemo(
    () => new Set((ownedQ.data?.cards ?? []).map((c) => c.card_id)),
    [ownedQ.data],
  );

  // What the player sees = server state + optimistic overlay.
  const owned = useMemo(() => {
    const s = new Set(serverOwned);
    overlay.forEach((op, id) => (op === "add" ? s.add(id) : s.delete(id)));
    return s;
  }, [serverOwned, overlay]);

  // Per-card background sync machinery: `desired` is the latest intent (what
  // the player wants the card to be), `confirmed` the last state the server
  // acknowledged to us directly (poll data may lag it by up to 3s), `inFlight`
  // guards one request chain per card. A rapid select→unselect while the first
  // request is still on the wire simply updates `desired`; the chain fires the
  // follow-up call when the first completes — latest intent always wins.
  const desired = useRef(new Map<number, boolean>());
  const confirmed = useRef(new Map<number, boolean>());
  const inFlight = useRef(new Set<number>());
  const serverOwnedRef = useRef(serverOwned);
  serverOwnedRef.current = serverOwned;

  // Drop overlay entries (and per-card confirmations) once a poll agrees with
  // them — the server has caught up, the base data is now authoritative. Until
  // then the overlay keeps the glow correct even if a stale in-flight poll
  // response lands after a successful reserve.
  useEffect(() => {
    setOverlay((prev) => {
      const n = new Map(prev);
      let changed = false;
      n.forEach((op, id) => {
        if ((op === "add") === serverOwned.has(id)) {
          n.delete(id);
          confirmed.current.delete(id);
          changed = true;
        }
      });
      return changed ? n : prev;
    });
  }, [serverOwned]);

  const ownedCount = owned.size;
  const takenCount = taken.size; // total cards reserved in this game (all players)

  // When the countdown ends and drawing begins, pull reserved players straight
  // into the game board (only once).
  // Once a round is being drawn, everyone goes into the room — players to play,
  // and anyone who didn't pick a card to spectate ("wait for next round"). One
  // game per table, so the picker only ever shows the single current game.
  //
  // Players are sent in the moment their local countdown hits 0 — not when the
  // 3s state-poll notices DRAWING — so the game socket connects during the grace
  // before the first number is drawn and doesn't miss its call/voice.
  const enteredRef = useRef(false);
  useEffect(() => {
    const drawing = liveGame?.state === "DRAWING";
    const countdownEnded =
      isCountdown && secondsLeft !== null && secondsLeft <= 0 && ownedCount > 0;
    if (
      (drawing || countdownEnded) &&
      gameId &&
      !finishedGames.has(gameId) && // never bounce back into a game that's over
      !enteredRef.current
    ) {
      enteredRef.current = true;
      haptic.impact("medium");
      nav(`/game/${gameId}`);
    }
  }, [liveGame?.state, isCountdown, secondsLeft, ownedCount, gameId, nav]);

  // Tapping a card reserves it (or releases it if already reserved). No charge
  // happens here — reserved cards are billed together when the game starts.
  //
  // The tap is OPTIMISTIC: the glow flips immediately (feels like a click) and
  // the reserve/release request runs in the background via syncCard. If the
  // server refuses (e.g. another player grabbed the card in the same second),
  // the card visibly reverts and a toast explains why.
  const toggle = (id: number) => {
    if (!gameId) return;
    // Unlock + warm the caller audio on this real user gesture: resume the
    // AudioContext (it starts suspended) and fetch+decode the call clips now, so
    // the FIRST number call in the game room plays instantly instead of being
    // swallowed by a still-suspended context. Idempotent (cached after first).
    sound.preloadCalls();
    const isMine = owned.has(id);
    if (takenByOther(id, isMine)) return; // reserved by someone else

    if (!isMine) {
      if (ownedCount >= MAX_CARDS_PER_PLAYER) {
        push(t("card.maxCards", { max: MAX_CARDS_PER_PLAYER }), "error");
        return;
      }
      if (balance() < (ownedCount + 1) * bet) {
        push(t("card.insufficient"), "error");
        return;
      }
    }

    haptic.select();
    const want = !isMine;
    desired.current.set(id, want);
    setOverlay((prev) => new Map(prev).set(id, want ? "add" : "remove"));
    void syncCard(id);
  };

  // A card counts as taken by ANOTHER player only when it isn't mine in any
  // sense — not on screen, not on the server, not mid-flight. The WS echoes my
  // own reservation into `taken` almost instantly, so without the extra
  // checks a card I'm releasing would flash the "taken by someone else" style
  // until the release round-trip completes.
  const takenByOther = (id: number, isMine: boolean) =>
    taken.has(id) && !isMine && !serverOwned.has(id) && !overlay.has(id);

  // Background request chain for one card: keep issuing join/leave until the
  // server state matches the player's latest intent. Never runs more than one
  // request per card at a time; new taps just update `desired` and the chain
  // catches up — so a select→unselect faster than one round-trip still ends
  // released on the server (a stale reservation here would bill the player at
  // countdown end).
  const syncCard = async (id: number) => {
    if (!gameId || inFlight.current.has(id)) return;
    inFlight.current.add(id);
    try {
      for (;;) {
        const want = desired.current.get(id);
        const actual = confirmed.current.get(id) ?? serverOwnedRef.current.has(id);
        if (want === undefined || want === actual) break;
        if (want) {
          await api.join(gameId, id); // reserve the card (charged at game start)
        } else {
          await api.leave(gameId, id); // release the reservation (nothing charged)
        }
        confirmed.current.set(id, want);
      }
    } catch (e) {
      // Server refused (card taken in a race, game already started, …): revert
      // this card's optimistic state and re-sync the grid so the player sees
      // the truth.
      desired.current.delete(id);
      setOverlay((prev) => {
        const n = new Map(prev);
        n.delete(id);
        return n;
      });
      const msg = e instanceof ApiError ? e.message : "error";
      push(msg === "insufficient balance" ? t("card.insufficient") : msg, "error");
      void Promise.all([ownedQ.refetch(), stateQ.refetch()]);
    } finally {
      inFlight.current.delete(id);
    }
  };

  if (gameQ.isLoading) {
    return (
      <ScreenShell tabs={home}>
        {!home && <Header back title={`${type} · ${money(bet)}`} />}
        <FullSpinner label={t("common.loading")} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell tabs={home}>
      {home ? (
        // Landing header: balance, a VIP-room shortcut, sound + language toggles.
        <div className="mb-3 flex items-center justify-between gap-2">
          <BalancePill />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                haptic.impact("medium");
                nav("/play/VIP");
              }}
              className="flex items-center gap-1 rounded-full border border-neon-gold/40 bg-neon-gold/10 px-3 py-1.5 text-xs font-bold text-neon-gold active:scale-95"
            >
              👑 {t("lobby.vipRoom")}
            </button>
            <LangToggle />
          </div>
        </div>
      ) : (
        <Header
          back
          title={
            <span>
              {money(bet)}{" "}
              <span className="text-sm text-ink-faint">{`· ${type}`}</span>
            </span>
          }
        />
      )}
      {/* Live game hero — PLAY · ደራሽ (+taken) · WIN, with countdown. Display only. */}
      <div className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-bg-elevated to-bg-card p-4">
        <div className="grid grid-cols-3 items-start gap-2">
          {/* PLAY — the stake for this table */}
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              🎮 PLAY
            </div>
            <div className="font-display text-2xl font-extrabold text-ink">
              {type === "VIP" ? "👑 " : ""}
              {money(bet)}
            </div>
          </div>
          {/* ደራሽ — the prize pool + how many cards are taken */}
          <div className="min-w-0 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              {t("card.prize")}
            </div>
            <div className="font-display text-2xl font-extrabold text-neon-cyan">
              {money(livePrize ?? liveGame?.prize_pool ?? 0)}
            </div>
            <div className="text-[10px] text-ink-faint">
              {t("card.takenCards", { count: takenCount })}
            </div>
          </div>
          {/* WIN — the player's winnings (0 until they win) */}
          <div className="min-w-0 text-right">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              🏆 WIN
            </div>
            <div className="font-display text-2xl font-extrabold text-neon-gold">
              {money(0)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5 text-xs text-ink-muted">
          <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono font-bold text-ink">
            {t("card.round")} #{roundCode}
          </span>
          {isCountdown ? (
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-ink-faint">{t("card.startingIn")}</span>
              <span className="rounded-lg border border-neon-cyan/50 px-2.5 py-0.5 font-display text-lg font-extrabold tabular-nums text-neon-cyan shadow-glow-cyan">
                {secondsLeft}
              </span>
            </span>
          ) : liveGame?.state === "DRAWING" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neon-green/15 px-2.5 py-1 text-[11px] font-bold text-neon-green">
              <span className="size-1.5 animate-pulse rounded-full bg-neon-green" />
              {t("card.live")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-ink-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-ink-faint" />
              {t("card.waitingPlayers")}
            </span>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-ink-faint">
        {t("card.tapToPick")} ·{" "}
        {t("card.capHint", { count: ownedCount, max: MAX_CARDS_PER_PLAYER })}
      </p>

      <div className="grid grid-cols-7 gap-1 pb-3 sm:grid-cols-9">
        {ALL_CARDS.map((id) => {
          const isMine = owned.has(id);
          const isTaken = takenByOther(id, isMine);
          // Only cards taken by someone else are disabled. Cards the player
          // can't currently afford — or that exceed their card cap — stay
          // TAPPABLE: tapping shows a clear "insufficient balance" / "max
          // cards" message (see toggle) instead of greying out the whole grid.
          // No in-flight lock: taps apply optimistically and sync behind.
          return (
            <button
              key={id}
              disabled={isTaken}
              onClick={() => toggle(id)}
              className={[
                "flex aspect-square items-center justify-center rounded-md text-[11px] font-bold transition-all duration-100 active:scale-90",
                isMine
                  ? // YOURS: glowing cyan cell (matches the design) — unmistakable.
                    "scale-105 bg-neon-cyan/15 text-white ring-2 ring-neon-cyan shadow-glow-cyan"
                  : isTaken
                    ? // TAKEN by someone else: near-black, dim + struck — clearly blocked.
                      "cursor-not-allowed bg-black/60 text-ink-faint/25 line-through ring-1 ring-white/5"
                    : // AVAILABLE (incl. low balance / at cap): bright, tappable tile.
                      "bg-bg-card text-ink ring-1 ring-white/10 hover:ring-neon-cyan/60",
              ].join(" ")}
            >
              {id}
            </button>
          );
        })}
      </div>

      {/* Spacer so the last row clears the sticky tab bar. */}
      <div aria-hidden className={home ? "h-24" : "h-6"} />
    </ScreenShell>
  );
}

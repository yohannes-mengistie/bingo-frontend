import { create } from "zustand";
import type { Wallet } from "@/types/api";
import { api } from "@/lib/api";
import { DEV_MOCK, mockWallet } from "@/lib/devMock";

export type PlayMode = "real" | "demo";

interface WalletState {
  wallet: Wallet | null;
  mode: PlayMode;
  loading: boolean;
  setMode: (m: PlayMode) => void;
  balance: () => number; // active balance for current mode
  refresh: () => Promise<void>;
}

export const useWallet = create<WalletState>((set, get) => ({
  wallet: null,
  mode: "real",
  loading: false,

  setMode: (mode) => set({ mode }),

  balance: () => {
    const w = get().wallet;
    if (!w) return 0;
    return get().mode === "demo" ? w.demo_balance : w.balance;
  },

  refresh: async () => {
    if (DEV_MOCK) {
      set({ wallet: mockWallet });
      return;
    }
    set({ loading: true });
    try {
      const wallet = await api.myWallet();
      set({ wallet });
    } finally {
      set({ loading: false });
    }
  },
}));

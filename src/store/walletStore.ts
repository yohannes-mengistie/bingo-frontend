import { create } from "zustand";
import type { Wallet } from "@/types/api";
import { api } from "@/lib/api";
import { DEV_MOCK, mockWallet } from "@/lib/devMock";

interface WalletState {
  wallet: Wallet | null;
  loading: boolean;
  balance: () => number;
  refresh: () => Promise<void>;
}

export const useWallet = create<WalletState>((set, get) => ({
  wallet: null,
  loading: false,

  balance: () => get().wallet?.balance ?? 0,

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

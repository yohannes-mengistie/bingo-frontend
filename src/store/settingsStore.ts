import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lang = "am" | "en";

interface SettingsState {
  lang: Lang;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  autoDaub: boolean;
  setLang: (l: Lang) => void;
  toggleSound: () => void;
  toggleHaptics: () => void;
  toggleAutoDaub: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: "am",
      soundEnabled: true,
      hapticsEnabled: true,
      autoDaub: false,
      setLang: (lang) => set({ lang }),
      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
      toggleHaptics: () => set((s) => ({ hapticsEnabled: !s.hapticsEnabled })),
      toggleAutoDaub: () => set((s) => ({ autoDaub: !s.autoDaub })),
    }),
    { name: "habesha_settings" },
  ),
);

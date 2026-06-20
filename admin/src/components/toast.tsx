import { create } from "zustand";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Tone) => void;
  remove: (id: number) => void;
}

let seq = 1;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = "info") => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const toneStyles: Record<Tone, string> = {
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  error: "border-red-500/40 bg-red-500/15 text-red-200",
  info: "border-sky-500/40 bg-sky-500/15 text-sky-200",
};

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const remove = useToast((s) => s.remove);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t.id)}
          className={`max-w-sm rounded-lg border px-4 py-2 text-left text-sm shadow-lg ${toneStyles[t.tone]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { useWallet } from "@/store/walletStore";
import { money } from "@/lib/format";
import { haptic } from "@/lib/telegram";

/** Shows the active balance with a Real/Demo toggle. */
export function BalancePill() {
  const { t } = useTranslation();
  const { wallet, mode, setMode } = useWallet();
  const value = mode === "demo" ? wallet?.demo_balance : wallet?.balance;

  return (
    <div className="flex items-center gap-2">
      <div className="glass rounded-full px-4 py-2">
        <div className="text-[10px] uppercase tracking-wide text-ink-faint">
          {t("lobby.balance")}
        </div>
        <div className="font-display text-lg font-extrabold leading-none text-neon-gold">
          {money(value)}
        </div>
      </div>
      <div className="inline-flex rounded-full bg-white/5 p-1 text-[11px] font-bold">
        {(["real", "demo"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              haptic.select();
              setMode(m);
            }}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              mode === m ? "bg-grad-cyan text-white" : "text-ink-muted"
            }`}
          >
            {t(`common.${m}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

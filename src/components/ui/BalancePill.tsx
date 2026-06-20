import { useTranslation } from "react-i18next";
import { useWallet } from "@/store/walletStore";
import { money } from "@/lib/format";

/** Shows the player's wallet balance. */
export function BalancePill() {
  const { t } = useTranslation();
  const wallet = useWallet((s) => s.wallet);

  return (
    <div className="flex items-center gap-2">
      <div className="glass rounded-full px-4 py-2">
        <div className="text-[10px] uppercase tracking-wide text-ink-faint">
          {t("lobby.balance")}
        </div>
        <div className="font-display text-lg font-extrabold leading-none text-neon-gold">
          {money(wallet?.balance)}
        </div>
      </div>
    </div>
  );
}

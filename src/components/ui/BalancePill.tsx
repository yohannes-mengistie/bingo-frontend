import { useTranslation } from "react-i18next";
import { useWallet } from "@/store/walletStore";
import { money } from "@/lib/format";

/** Shows the player's wallet balance. */
export function BalancePill() {
  const { t } = useTranslation();
  const wallet = useWallet((s) => s.wallet);
  const bonus = useWallet((s) => s.bonus);

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
      {/* Bonus sits beside the cash balance rather than added into it: it is
          spent first but cannot be withdrawn, so merging the two figures would
          overstate what the player can actually cash out. */}
      {bonus > 0 && (
        <div className="glass rounded-full border border-neon-cyan/30 px-4 py-2">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">
            🎁 {t("lobby.bonus")}
          </div>
          <div className="font-display text-lg font-extrabold leading-none text-neon-cyan">
            {money(bonus)}
          </div>
        </div>
      )}
    </div>
  );
}

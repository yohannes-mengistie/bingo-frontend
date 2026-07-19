import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { useWallet } from "@/store/walletStore";

/**
 * The "today's bonus" banner: a pot split among the first N players, claimed
 * first-come-first-served.
 *
 * Renders nothing at all when no campaign is running, which is most days — an
 * empty gold banner saying "no bonus today" would train players to ignore the
 * spot the promotion needs to own.
 */
export function BonusCampaign() {
  const { t } = useTranslation();
  const push = useToast((s) => s.push);
  const refreshWallet = useWallet((s) => s.refresh);
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ["bonus-campaign"],
    queryFn: () => api.myBonusCampaign(),
    // Slots drain in seconds once the announcement goes out, so a stale "4
    // left" is worse than a slightly chatty poll — it invites a player to tap
    // a button that is already dead.
    refetchInterval: 15000,
    retry: false,
  });

  const data = status.data;
  const campaign = data?.campaign;
  if (!campaign) return null;

  const left = Math.max(0, campaign.slots - campaign.claimed_count);
  const taken = campaign.slots - left;

  const claim = async () => {
    setBusy(true);
    try {
      const res = await api.claimBonus();
      haptic.notify("success");
      push(t("bonus.claimedToast", { amount: res.claim.amount }), "success");
      // Both refreshes matter: the wallet so the bonus pill updates instantly,
      // the campaign so the slot counter reflects the one this player took.
      await Promise.all([refreshWallet(), status.refetch()]);
    } catch (e) {
      haptic.notify("error");
      const reason = e instanceof ApiError ? e.reason : undefined;
      // Never surface the server's English prose — map the code to a
      // translated string, falling back to a generic failure.
      const key = reason ? `bonus.refused.${reason}` : "bonus.refused.failed";
      const msg = t(key, { defaultValue: t("bonus.refused.failed") });
      push(msg, "error");
      // A refusal usually means the world moved on (slots gone, already
      // claimed), so re-read rather than leaving a stale button on screen.
      status.refetch();
    } finally {
      setBusy(false);
    }
  };

  // Already claimed: keep the banner, but as a receipt rather than a button.
  // Removing it would make the player wonder whether the claim really worked.
  if (data?.claimed) {
    return (
      <Shell>
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-sm font-bold">
            ✅ {t("bonus.claimedBanner", { amount: data.claimed_amount ?? campaign.amount_per_slot })}
          </span>
          <span className="rounded-full bg-bg/20 px-2.5 py-1 text-xs font-bold">
            {t("bonus.slotsLeft", { left, total: campaign.slots })}
          </span>
        </div>
      </Shell>
    );
  }

  const soldOut = left <= 0;
  const blocked = soldOut || !data?.can_claim;

  return (
    <Shell>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-sm font-bold leading-tight">
            🎁 {t("bonus.title", { amount: campaign.total_amount })}
          </div>
          <div className="text-xs opacity-80">
            {soldOut
              ? t("bonus.allGone")
              : t("bonus.subtitle", {
                  each: campaign.amount_per_slot,
                  total: campaign.slots,
                })}
          </div>
        </div>

        <button
          onClick={claim}
          disabled={blocked || busy}
          className="shrink-0 rounded-full bg-bg/20 px-4 py-1.5 text-sm font-bold transition disabled:opacity-50"
        >
          {busy ? t("bonus.claiming") : soldOut ? t("bonus.gone") : t("bonus.claim")}
        </button>
      </div>

      {/* Slot meter — the scarcity is the whole pitch, so show it moving. */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg/20">
        <div
          className="h-full rounded-full bg-bg/60 transition-all duration-500"
          style={{ width: `${Math.round((taken / campaign.slots) * 100)}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] opacity-80">
        <span>{t("bonus.slotsLeft", { left, total: campaign.slots })}</span>
        {/* Explains a dead button rather than leaving the player guessing. */}
        {!soldOut && !data?.can_claim && data?.reason === "not_eligible" && (
          <span>{t("bonus.refused.not_eligible")}</span>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="mt-3 w-full rounded-2xl bg-grad-gold px-4 py-2.5 text-bg"
    >
      {children}
    </motion.div>
  );
}

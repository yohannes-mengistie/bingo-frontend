import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { money, shortDate } from "@/lib/format";
import { api, ApiError } from "@/lib/api";
import { PAYMENT_ACCOUNTS } from "@/lib/constants";
import { useWallet } from "@/store/walletStore";
import type { PaymentMethod, Transaction } from "@/types/api";

type Action = "deposit" | "withdraw" | "transfer" | null;

export function WalletScreen() {
  const { t } = useTranslation();
  const { wallet, refresh } = useWallet();
  const [action, setAction] = useState<Action>(null);
  const [tab, setTab] = useState<"deposits" | "withdrawals" | "transfers">("deposits");

  const history = useQuery({
    queryKey: ["wallet-history", tab],
    queryFn: async () => {
      if (tab === "deposits") return (await api.deposits()).transactions ?? [];
      if (tab === "withdrawals") return (await api.withdrawals()).transactions ?? [];
      const r = (await api.transfers()) as any;
      return (r.transfers ?? r.transactions ?? []) as Transaction[];
    },
  });

  return (
    <ScreenShell>
      <Header title={t("wallet.title")} />

      <div className="grid grid-cols-1 gap-3">
        <Card className="!p-3.5">
          <div className="text-xs text-ink-faint">{t("wallet.realBalance")}</div>
          <div className="font-display text-2xl font-extrabold text-neon-gold">
            {money(wallet?.balance)}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="gold" onClick={() => setAction("deposit")}>
          ⬇ {t("wallet.deposit")}
        </Button>
        <Button variant="ghost" onClick={() => setAction("withdraw")}>
          ⬆ {t("wallet.withdraw")}
        </Button>
        <Button variant="ghost" onClick={() => setAction("transfer")}>
          ↔ {t("wallet.transfer")}
        </Button>
      </div>

      <h2 className="mb-2 mt-5 font-display text-lg font-bold">{t("wallet.history")}</h2>
      <div className="mb-3 inline-flex rounded-full bg-white/5 p-1 text-xs font-bold">
        {(["deposits", "withdrawals", "transfers"] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-full px-3 py-1.5 ${
              tab === tb ? "bg-accent text-white" : "text-ink-muted"
            }`}
          >
            {t(`wallet.${tb}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {history.data?.length ? (
          history.data.map((tx: Transaction, idx: number) => (
            <Card key={tx.id ?? idx} className="flex items-center justify-between !py-3">
              <div>
                <div className="font-bold">{money(tx.amount)}</div>
                <div className="text-xs text-ink-faint">
                  {tx.created_at ? shortDate(tx.created_at) : ""}
                  {tx.transaction_type ? ` · ${tx.transaction_type}` : ""}
                </div>
              </div>
              <StatusBadge status={tx.status} />
            </Card>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-ink-faint">{t("wallet.empty")}</p>
        )}
      </div>

      <ActionSheet
        action={action}
        onClose={() => setAction(null)}
        onDone={async () => {
          setAction(null);
          await refresh();
          history.refetch();
        }}
      />
    </ScreenShell>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation();
  const s = (status ?? "").toLowerCase();
  const cls = s.includes("complet") || s.includes("approv")
    ? "bg-neon-green/20 text-neon-green"
    : s.includes("fail") || s.includes("reject")
      ? "bg-neon-red/20 text-neon-red"
      : "bg-neon-gold/20 text-neon-gold";
  const label = s.includes("complet") || s.includes("approv")
    ? t("wallet.completed")
    : s.includes("fail") || s.includes("reject")
      ? t("wallet.failed")
      : t("wallet.pending");
  return <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${cls}`}>{label}</span>;
}

function ActionSheet({
  action,
  onClose,
  onDone,
}: {
  action: Action;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const push = useToast((s) => s.push);
  const [amount, setAmount] = useState("");
  // Telebirr is the only supported payment method.
  const method: PaymentMethod = "Telebirr";
  const [txId, setTxId] = useState("");
  const [account, setAccount] = useState("");
  const [receiver, setReceiver] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setAmount("");
    setTxId("");
    setAccount("");
    setReceiver("");
  };

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      if (action === "deposit") {
        await api.deposit(amt, method, txId.trim());
        push(t("wallet.depositOk"), "success");
      } else if (action === "withdraw") {
        await api.withdraw(amt, account.trim(), method);
        push(t("wallet.withdrawOk"), "success");
      } else if (action === "transfer") {
        await api.transfer(receiver.trim(), amt);
        push(t("wallet.transferOk"), "success");
      }
      reset();
      onDone();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "error", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={action !== null}
      onClose={onClose}
      title={action ? t(`wallet.${action}`) : ""}
    >
      <div className="flex flex-col gap-3">
        <Field label={t("wallet.amount")}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={inputCls}
          />
        </Field>

        {action === "deposit" && (
          <DepositTarget
            method={method}
            onCopy={() => push(t("wallet.copied"), "success")}
          />
        )}

        {action === "deposit" && (
          <Field label={t("wallet.txId")} hint={t("wallet.txIdHint")}>
            <input value={txId} onChange={(e) => setTxId(e.target.value)} className={inputCls} />
          </Field>
        )}

        {action === "withdraw" && (
          <Field label={t("wallet.accountNumber")}>
            <input value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls} />
          </Field>
        )}

        {action === "transfer" && (
          <Field label={t("wallet.receiverId")}>
            <input value={receiver} onChange={(e) => setReceiver(e.target.value)} className={inputCls} />
          </Field>
        )}

        <Button variant="gold" fullWidth loading={busy} onClick={submit} className="mt-2">
          {busy ? t("wallet.submitting") : t("wallet.submit")}
        </Button>
      </div>
    </Sheet>
  );
}

// Shows the house Telebirr account the player must send their deposit to,
// with a copy button.
function DepositTarget({
  method,
  onCopy,
}: {
  method: PaymentMethod;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  const acct = PAYMENT_ACCOUNTS[method];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(acct.number);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
    onCopy();
  };

  return (
    <div className="rounded-xl border border-neon-gold/30 bg-neon-gold/10 p-3">
      <div className="text-xs text-ink-faint">{t("wallet.depositTo", { method })}</div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="break-all font-display text-lg font-bold text-neon-gold">
            {acct.number}
          </div>
          <div className="text-xs text-ink-muted">{acct.name}</div>
        </div>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-ink hover:bg-white/20"
        >
          {t("wallet.copy")}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-ink-faint">{t("wallet.depositHint")}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg bg-bg-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-white/10 focus:ring-accent";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

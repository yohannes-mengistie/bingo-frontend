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
import { PAYMENT_ACCOUNTS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
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
  const [method, setMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0] ?? "Telebirr");
  const [txId, setTxId] = useState("");
  const [receiver, setReceiver] = useState("");
  const [busy, setBusy] = useState(false);

  // Withdrawals default to the user's verified registration phone, but the
  // player may edit it if their mobile-money wallet is on a different number.
  // `account` is null until the player types, so the field shows the
  // registered phone. Same pattern for the payer phone an M-Pesa deposit
  // needs (the verifier looks M-Pesa receipts up by the payer's number).
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: action === "withdraw" || action === "deposit",
  });
  const [account, setAccount] = useState<string | null>(null);
  const withdrawTo = account ?? meQ.data?.phone_number ?? "";
  const [payerPhone, setPayerPhone] = useState<string | null>(null);
  const mpesaPhone = payerPhone ?? meQ.data?.phone_number ?? "";
  const needsPhone = action === "deposit" && method === "Mpesa";

  const reset = () => {
    setAmount("");
    setTxId("");
    setReceiver("");
    setAccount(null);
    setPayerPhone(null);
  };

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      if (action === "deposit") {
        await api.deposit(
          amt,
          method,
          txId.trim(),
          method === "Mpesa" ? mpesaPhone.trim() : undefined,
        );
        push(t("wallet.depositOk"), "success");
      } else if (action === "withdraw") {
        await api.withdraw(amt, withdrawTo.trim(), method);
        push(t("wallet.withdrawOk"), "success");
      } else if (action === "transfer") {
        await api.transfer(receiver.trim(), amt);
        push(t("wallet.transferOk"), "success");
      }
      reset();
      onDone();
    } catch (e) {
      const raw = e instanceof ApiError ? e.message : "error";
      push(localizeWalletError(raw, t), "error");
    } finally {
      setBusy(false);
    }
  };

  const acct = PAYMENT_ACCOUNTS[method];
  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(acct.number);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
    push(t("wallet.copied"), "success");
  };

  return (
    <Sheet
      open={action !== null}
      onClose={onClose}
      title={action ? t(`wallet.${action}`) : ""}
    >
      {action === "deposit" ? (
        <div className="flex flex-col gap-4">
          <MethodPicker method={method} onChange={setMethod} />

          {/* The house account to pay — big and copyable. */}
          <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 text-center">
            <div className="font-display text-lg font-extrabold tracking-wider text-neon-cyan">
              {PAYMENT_METHOD_LABELS[method].toUpperCase()}
            </div>
            <div className="mt-1 text-sm text-ink-muted">{acct.name}</div>
            <div className="mt-1 select-all font-display text-2xl font-extrabold tracking-wide text-ink">
              {acct.number}
            </div>
            <button
              onClick={copyNumber}
              className="mx-auto mt-3 flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2 text-sm font-bold text-ink active:scale-95"
            >
              📋 {t("wallet.copyNumber")}
            </button>
          </div>

          {/* Numbered steps. */}
          <div className="space-y-2 text-sm text-ink">
            <p className="flex gap-2">
              <span className="font-extrabold text-neon-cyan">1.</span>
              <span>{t("wallet.depositStep1")}</span>
            </p>
            <p className="flex gap-2">
              <span className="font-extrabold text-neon-cyan">2.</span>
              <span>{t("wallet.depositStep2")}</span>
            </p>
          </div>

          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("wallet.amountPlaceholder")}
            className={inputCls}
          />
          <input
            value={txId}
            onChange={(e) => setTxId(e.target.value)}
            placeholder={t("wallet.txnRefPlaceholder")}
            className={inputCls}
          />

          {/* M-Pesa receipts are verified by receipt number + the PAYER's
              phone, so the player must tell us which number they paid from
              (prefilled with their registered phone). */}
          {needsPhone && (
            <Field label={t("wallet.mpesaPhone")} hint={t("wallet.mpesaPhoneHint")}>
              <input
                inputMode="tel"
                value={mpesaPhone}
                onChange={(e) => setPayerPhone(e.target.value)}
                placeholder="07…"
                className={inputCls}
              />
            </Field>
          )}

          <Button
            variant="gold"
            fullWidth
            loading={busy}
            disabled={!amount.trim() || !txId.trim() || (needsPhone && !mpesaPhone.trim())}
            onClick={submit}
          >
            📥 {busy ? t("wallet.submitting") : t("wallet.submitDeposit")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label={t("wallet.amount")}>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
            />
          </Field>

          {action === "withdraw" && (
            <>
              <Field label={t("wallet.accountType")}>
                <MethodPicker method={method} onChange={setMethod} />
              </Field>
              <Field label={t("wallet.withdrawTo")} hint={t("wallet.withdrawToHint")}>
                <input
                  inputMode="tel"
                  value={withdrawTo}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="09…"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {action === "transfer" && (
            <Field label={t("wallet.receiverId")}>
              <input value={receiver} onChange={(e) => setReceiver(e.target.value)} className={inputCls} />
            </Field>
          )}

          <Button
            variant="gold"
            fullWidth
            loading={busy}
            disabled={action === "withdraw" && !withdrawTo.trim()}
            onClick={submit}
            className="mt-2"
          >
            {busy ? t("wallet.submitting") : t("wallet.submit")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

// Segmented picker for the payment method. Hidden entirely while only one
// method is configured — no point showing a single-choice control.
function MethodPicker({
  method,
  onChange,
}: {
  method: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}) {
  if (PAYMENT_METHODS.length <= 1) return null;
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-2">
      {PAYMENT_METHODS.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-xl px-2 py-2 text-sm font-bold ${
            method === m
              ? "bg-accent text-white"
              : "bg-white/5 text-ink-muted ring-1 ring-white/10"
          }`}
        >
          {PAYMENT_METHOD_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

// Map known backend deposit/withdrawal error messages to localized text. The
// limit values mirror the backend constants; unknown messages pass through.
function localizeWalletError(
  msg: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const m = msg.toLowerCase();
  if (m.includes("daily withdrawal limit")) return t("wallet.errDailyLimit", { max: 2000 });
  if (m.includes("remaining balance must be at least"))
    return t("wallet.errMinRemaining", { min: 50 });
  if (m.includes("insufficient balance")) return t("wallet.errInsufficient");
  if (m.includes("at least one completed deposit")) return t("wallet.errNeedDeposit");
  if (m.includes("minimum withdrawal")) return t("wallet.errMinWithdraw", { min: 10 });
  if (m.includes("phone is required for mpesa")) return t("wallet.errMpesaPhone");
  if (m.includes("telebirr number") || m.includes("valid ethiopian"))
    return t("wallet.errBadNumber");
  return msg;
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

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronRight,
  CreditCard,
  FlaskConical,
  Gift,
  QrCode,
  Send,
  Settings2,
  ShieldCheck,
  WifiOff,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUserTier } from "@/hooks/useUserTier";
import { usePaymentSecurity } from "@/hooks/usePaymentSecurity";
import { PaymentPinSetup } from "@/components/Payment/PaymentPinSetup";
import { PaymentSecurityPopover } from "@/components/Payment/PaymentSecurityPopover";
import TierBadge from "@/components/Tier/TierBadge";
import { useToast } from "@/hooks/use-toast";
import { useJVCoinWallet } from "@/hooks/useJVCoinWallet";
import { useCurrency } from "@/hooks/useCurrency";
import { DepositModal } from "@/components/Customer/DepositModal";
import TransactionHistory from "@/components/Wallet/TransactionHistory";
import { QRScannerModal } from "@/components/Customer/QRScannerModal";
import { SendMoneyModal } from "@/components/Customer/SendMoneyModal";
import Web3FeedHeader from "@/components/Customer/Feed/Web3FeedHeader";
import { useHideBodyScrollbar } from "@/hooks/useHideBodyScrollbar";
import { useIsMobile } from "@/hooks/use-mobile";
import useCustomerDashboardPresentation from "@/hooks/useCustomerDashboardPresentation";
import { BLEPayNearbyButton } from "@/components/Customer/BLEPayNearbyButton";
import ReferralCredits from "@/components/Wallet/ReferralCredits";
import TestWalletBalances from "@/components/Wallet/TestWalletBalances";
import UserWithdrawModal from "@/components/Customer/UserWithdrawModal";
import { useCryptoSandbox } from "@/hooks/useCryptoSandbox";
import { FoundersPassCard } from "@/components/FoundersPass/FoundersPassCard";
import { useFounderEntitlement } from "@/hooks/useFoundersPass";
import "./wallet.css";

export default function Wallet() {
  useHideBodyScrollbar(true);

  const { t } = useTranslation("wallet");
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingTransactions, setPendingTransactions] = useState<unknown[]>([]);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);

  const { balance, loading, fetchBalance, initializeWallet } = useJVCoinWallet();
  const { jvcToLocal, formatCurrency, getTransactionFeeLocal } = useCurrency();
  const { data: founderEntitlement, isLoading: founderLoading } = useFounderEntitlement("user");
  const { currentTier } = useUserTier();
  const { balance: sandboxBalance, eligible: sandboxEligible } = useCryptoSandbox();
  const { isPinSet, loading: securityLoading, status: securityStatus, checkPinStatus } = usePaymentSecurity();

  useEffect(() => {
    if (securityLoading || loading) return;
    setShowPinSetup(!isPinSet);
  }, [securityLoading, isPinSet, loading]);

  useEffect(() => {
    const queue = JSON.parse(localStorage.getItem("offline_transactions") || "[]");
    setPendingTransactions(queue);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void initializeWallet();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [initializeWallet]);

  const sandboxActive = Boolean(
    sandboxBalance && !sandboxBalance.is_locked && (sandboxEligible || sandboxBalance.total_granted_usd > 0),
  );
  const localBalance = sandboxActive ? jvcToLocal(sandboxBalance!.balance_usd) : jvcToLocal(balance.jvc);
  const localDeposited = sandboxActive ? jvcToLocal(sandboxBalance!.balance_usd) : jvcToLocal(balance.usd);
  const dailyLimit = Number(localStorage.getItem("jv_daily_limit") || "2000") || 2000;
  const scrollToHistory = () => {
    document.getElementById("wallet-transaction-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={`customer-wallet-page${isMobile ? " customer-wallet-page--mobile" : ""}${isDashboardPresentation ? " customer-wallet-page--dashboard-presentation" : ""}`}>
      {isMobile && !isDashboardPresentation && <Web3FeedHeader />}

      <main className="customer-wallet-page__main" aria-labelledby="wallet-title">
        <header className="customer-wallet-page__heading">
          <div>
            <h1 id="wallet-title">{t("title")}</h1>
            <p>Manage your JointVibe balance and payments.</p>
          </div>
        </header>

        <section className="customer-wallet-page__overview" aria-label="Wallet overview">
          <article className="customer-wallet-page__balance-card">
            <div className="customer-wallet-page__balance-topline">
              <span>{t("balance.available_balance")}</span>
              <div className="customer-wallet-page__balance-controls">
                <span className="customer-wallet-page__secure"><ShieldCheck aria-hidden="true" /> Secured</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="customer-wallet-page__settings-button"
                      type="button"
                      aria-label="Open payment security settings"
                      title="Payment security settings"
                    >
                      <Settings2 aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="customer-wallet-security-popover">
                    <PaymentSecurityPopover status={securityStatus} onRefresh={checkPinStatus} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <strong>{loading ? "..." : formatCurrency(localBalance)}</strong>

            {sandboxActive && (
              <p className="customer-wallet-page__sandbox-copy">
                <FlaskConical aria-hidden="true" />
                Sandbox test balance. Use it to explore payments at partner venues.
              </p>
            )}

            <div className="customer-wallet-page__balance-meta">
              <span>
                <small>{t("tier")}</small>
                <b><TierBadge tier={currentTier} size="sm" /></b>
              </span>
              <span>
                <small>{t("security.daily_limit")}</small>
                <b>{formatCurrency(jvcToLocal(dailyLimit))}</b>
              </span>
            </div>
          </article>

          <div className="customer-wallet-page__summary-stack">
            <button className="customer-wallet-page__summary" type="button" onClick={scrollToHistory}>
              <span className="customer-wallet-page__summary-icon"><CreditCard aria-hidden="true" /></span>
              <span>
                <small>{t("balance.total_deposited")}</small>
                <strong>{loading ? "..." : formatCurrency(localDeposited)}</strong>
                {sandboxActive && <em>Sandbox</em>}
              </span>
              <ChevronRight aria-hidden="true" />
            </button>

            <button
              className="customer-wallet-page__summary"
              type="button"
              onClick={() => navigate("/app/referrals")}
            >
              <span className="customer-wallet-page__summary-icon customer-wallet-page__summary-icon--reward"><Gift aria-hidden="true" /></span>
              <span>
                <small>{t("rewards.points")}</small>
                <strong>{loading ? "..." : `${balance.rewards} RP`}</strong>
                <em>{t("rewards.redeem_hint")}</em>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>

            <ReferralCredits />
          </div>
        </section>

        {!isDashboardPresentation && (
          <div className="customer-wallet-page__supplemental">
            <FoundersPassCard entitlement={founderEntitlement || null} passType="user" loading={founderLoading} />
            <TestWalletBalances />
          </div>
        )}

        <section className="customer-wallet-page__fee" aria-label="Platform transaction fee">
          <Zap aria-hidden="true" />
          <strong>{t("fees.platform_fee")}</strong>
          <span>{t("fees.dynamic_hint")}</span>
          <b>{formatCurrency(getTransactionFeeLocal())}</b>
        </section>

        {!isOnline && pendingTransactions.length > 0 && (
          <section className="customer-wallet-page__offline" role="status">
            <WifiOff aria-hidden="true" />
            <div>
              <strong>{t("offline.pending_transactions", { count: pendingTransactions.length })}</strong>
              <p>{t("offline.sync_message")}</p>
            </div>
          </section>
        )}

        <section className="customer-wallet-page__pay-card" aria-labelledby="in-person-title">
          <div className="customer-wallet-page__pay-icon"><QrCode aria-hidden="true" /></div>
          <div className="customer-wallet-page__pay-copy">
            <p className="customer-wallet-page__eyebrow">In-person payments</p>
            <h2 id="in-person-title">Pay at a venue</h2>
            <p>Check in at a partner venue, then tap to pay or scan their QR code.</p>
          </div>
          <div className="customer-wallet-page__pay-actions">
            <BLEPayNearbyButton
              onFallbackToQR={() => setShowQRScanner(true)}
              className="customer-wallet-page__button customer-wallet-page__button--primary"
            />
            <Button
              type="button"
              variant="outline"
              className="customer-wallet-page__button customer-wallet-page__button--secondary"
              onClick={() => setShowQRScanner(true)}
            >
              <QrCode aria-hidden="true" />
              {t("in_person.scan_qr")}
            </Button>
          </div>
        </section>

        <div className="customer-wallet-page__actions" aria-label="Wallet actions">
          <Button
            type="button"
            className="customer-wallet-page__button customer-wallet-page__button--primary"
            onClick={() => setShowDepositModal(true)}
          >
            <ArrowDownToLine aria-hidden="true" />
            {t("actions.add_funds")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="customer-wallet-page__button customer-wallet-page__button--secondary"
            onClick={() => {
              if (balance.jvc <= 0) {
                toast({
                  title: t("errors.no_balance"),
                  description: t("errors.add_funds_first"),
                  variant: "destructive",
                });
                return;
              }
              setShowTransferModal(true);
            }}
          >
            <Send aria-hidden="true" />
            {t("actions.send")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="customer-wallet-page__button customer-wallet-page__button--secondary"
            onClick={() => {
              if (balance.jvc < 10) {
                toast({
                  title: t("errors.insufficient_balance"),
                  description: t("errors.min_withdrawal"),
                  variant: "destructive",
                });
                return;
              }
              setShowWithdraw(true);
            }}
          >
            <ArrowUpRight aria-hidden="true" />
            {t("actions.withdraw")}
          </Button>
        </div>

        <section id="wallet-transaction-history" className="customer-wallet-page__history" aria-label={t("actions.history")}>
          <TransactionHistory />
        </section>
      </main>

      <DepositModal
        open={showDepositModal}
        onClose={() => {
          setShowDepositModal(false);
          void fetchBalance();
        }}
      />

      <SendMoneyModal
        open={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          void fetchBalance();
        }}
      />

      <UserWithdrawModal
        open={showWithdraw}
        onClose={() => {
          setShowWithdraw(false);
          void fetchBalance();
        }}
        balance={balance.jvc}
        pendingBalance={balance.pendingBalance}
        pendingUntil={balance.pendingUntil?.toISOString() ?? null}
        onSuccess={fetchBalance}
      />

      <QRScannerModal open={showQRScanner} onOpenChange={setShowQRScanner} />

      {showPinSetup && (
        <PaymentPinSetup open={showPinSetup} onComplete={() => setShowPinSetup(false)} />
      )}
    </div>
  );
}

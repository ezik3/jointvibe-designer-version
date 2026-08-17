import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Library,
  Loader2,
  Megaphone,
  Plus,
  Radio,
  Send,
  Zap,
} from "lucide-react";
import PushNotificationDealsModal from "@/components/Venue/PushNotificationDealsModal";
import DealCreatorModal, { DEAL_DRAFT_STORAGE_KEY } from "@/components/Venue/DealCreatorModal";
import UnifiedDealCreator from "@/components/Venue/UnifiedDealCreator";
import WithdrawModal from "@/components/Venue/WithdrawModal";
import DealsLibrary from "@/components/Venue/DealsLibrary";
import VenueWalletActivity from "@/components/Venue/VenueWalletActivity";
import BuyVibeCreditsModal from "@/components/Venue/BuyVibeCreditsModal";
import VenueAddFundsModal from "@/components/Venue/VenueAddFundsModal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVenueVibeCredits } from "@/hooks/useVenueVibeCredits";
import { useTestVenueCredits } from "@/hooks/useTestVenueCredits";
import { useVenueWallet } from "@/hooks/useVenueWallet";
import { useVenueDealsLibrary } from "@/hooks/useVenueDealsLibrary";
import { useCurrency } from "@/hooks/useCurrency";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  clearVenueCreditCheckoutState,
  getVenueCreditCheckoutState,
  PUSH_CREDITS_CHECKOUT_STORAGE_KEY,
  VIBE_CREDITS_CHECKOUT_STORAGE_KEY,
} from "@/lib/venueCreditCheckout";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import "./venue-credits.css";

export default function VenueCredits() {
  const [showDealsModal, setShowDealsModal] = useState(false);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [showDealCreator, setShowDealCreator] = useState(false);
  const [showUnifiedCreator, setShowUnifiedCreator] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showBuyVibesModal, setShowBuyVibesModal] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [isVenueVerified, setIsVenueVerified] = useState(false);
  const [isSyncingCredits, setIsSyncingCredits] = useState(false);
  const [isSyncingVibeCredits, setIsSyncingVibeCredits] = useState(false);
  const [creditsSynced, setCreditsSynced] = useState(false);
  const [creditsAdded, setCreditsAdded] = useState(0);
  const [purchasedTier, setPurchasedTier] = useState("local");
  const [fundingAmount, setFundingAmount] = useState<number | null>(null);
  const [showDealsLibrary, setShowDealsLibrary] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { balance, loading, fetchBalance } = useVenueWallet(venueId);
  const { credits, fetchCredits } = useVenueDealsLibrary(venueId);
  const { formatCurrency, getCurrencyInfo, jvcToLocal } = useCurrency();
  const {
    totalVibeCredits,
    freeLocalCredits,
    fetchCredits: fetchVibeCredits,
  } = useVenueVibeCredits(venueId);
  const { isTestingMode, loading: isLoadingTestCredits } = useTestVenueCredits(venueId);
  const pollStartedRef = useRef(false);
  const vibePollStartedRef = useRef(false);

  const totalCredits = Object.values(credits).reduce((sum, value) => sum + (value || 0), 0);

  const getSavedDraft = () => {
    try {
      const raw = sessionStorage.getItem(DEAL_DRAFT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let isCurrent = true;

    const resolveVenue = async () => {
      if (!user) {
        if (isCurrent) {
          setVenueId(null);
          setIsVenueVerified(false);
        }
        return;
      }

      const storedVenueId = localStorage.getItem("jv_current_venue_id");
      let venue: { id: string; verified_at: string | null } | null = null;

      if (storedVenueId) {
        const { data } = await supabase
          .from("venues")
          .select("id, verified_at")
          .eq("id", storedVenueId)
          .maybeSingle();
        venue = data;
      }

      if (!venue) {
        const { data } = await supabase
          .from("venues")
          .select("id, verified_at")
          .eq("owner_user_id", user.id)
          .maybeSingle();
        venue = data;
      }

      if (!venue) {
        const { data: link } = await supabase
          .from("employee_venue_links")
          .select("venue_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (link?.venue_id) {
          const { data } = await supabase
            .from("venues")
            .select("id, verified_at")
            .eq("id", link.venue_id)
            .maybeSingle();
          venue = data;
        }
      }

      if (!isCurrent) return;

      setVenueId(venue?.id ?? null);
      setIsVenueVerified(Boolean(venue?.verified_at));

      if (venue?.id) localStorage.setItem("jv_current_venue_id", venue.id);
    };

    void resolveVenue();
    return () => {
      isCurrent = false;
    };
  }, [user]);

  useEffect(() => {
    if (venueId) void fetchBalance();
  }, [fetchBalance, venueId]);

  useEffect(() => {
    if (venueId && !isLoadingTestCredits) void fetchCredits();
  }, [fetchCredits, isLoadingTestCredits, venueId]);

  useEffect(() => {
    if (searchParams.get("open_buy") !== "true" || !venueId) return;

    setFundingAmount(null);
    setShowDealsModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete("open_buy");
    setSearchParams(next, { replace: true });
  }, [venueId, searchParams, setSearchParams]);

  useEffect(() => {
    const creditsAddedParam = searchParams.get("credits_added") === "true";
    const creditsCancelled = searchParams.get("credits_cancelled") === "true";

    if (!creditsAddedParam && !creditsCancelled) return;

    if (creditsCancelled) {
      toast.info("Credits purchase cancelled.");
      clearVenueCreditCheckoutState(PUSH_CREDITS_CHECKOUT_STORAGE_KEY);
      setSearchParams({}, { replace: true });
      return;
    }

    if (!venueId || pollStartedRef.current) return;
    pollStartedRef.current = true;

    const parsedExpectedCredits = Number.parseInt(searchParams.get("credits_expected") || "0", 10);
    const expectedCredits = Number.isFinite(parsedExpectedCredits) ? Math.max(parsedExpectedCredits, 0) : 0;
    const reachTier = searchParams.get("reach_tier") || "local";
    const checkoutState = getVenueCreditCheckoutState(PUSH_CREDITS_CHECKOUT_STORAGE_KEY);
    const balanceBeforeCheckout = checkoutState?.venueId === venueId &&
      checkoutState.reachTier === reachTier &&
      checkoutState.expectedCredits === expectedCredits
      ? checkoutState.balanceBeforeCheckout
      : null;
    const expectedTotal = balanceBeforeCheckout === null
      ? Math.max(expectedCredits, 1)
      : balanceBeforeCheckout + expectedCredits;
    setPurchasedTier(reachTier);

    let cancelled = false;
    setIsSyncingCredits(true);
    toast.success("Payment confirmed - syncing your push credits.");

    const syncCredits = async () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) return;

        const { data } = await supabase
          .from("venue_push_credits")
          .select("credits_remaining")
          .eq("venue_id", venueId);
        const currentTotal = data?.reduce((sum, row) => sum + (row.credits_remaining || 0), 0) ?? 0;

        if (currentTotal >= expectedTotal) {
          if (!cancelled) {
            await fetchCredits();
            if (cancelled) return;
            setCreditsAdded(currentTotal);
            setIsSyncingCredits(false);
            setCreditsSynced(true);
            toast.success(`${expectedCredits || currentTotal} ${reachTier} push credit${expectedCredits !== 1 ? "s" : ""} are ready!`);
            clearVenueCreditCheckoutState(PUSH_CREDITS_CHECKOUT_STORAGE_KEY);
            setSearchParams({}, { replace: true });
            pollStartedRef.current = false;
          }
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!cancelled) {
        await fetchCredits();
        setIsSyncingCredits(false);
        pollStartedRef.current = false;

        const { data } = await supabase
          .from("venue_push_credits")
          .select("credits_remaining")
          .eq("venue_id", venueId);
        const finalTotal = data?.reduce((sum, row) => sum + (row.credits_remaining || 0), 0) ?? 0;

        if (finalTotal >= expectedTotal) {
          setCreditsAdded(finalTotal);
          setCreditsSynced(true);
          toast.success(`${expectedCredits || finalTotal} ${reachTier} push credit${expectedCredits !== 1 ? "s" : ""} are ready!`);
        } else {
          toast.info("Credits may take a moment to appear. Please refresh the page if they do not show up.");
        }
        clearVenueCreditCheckoutState(PUSH_CREDITS_CHECKOUT_STORAGE_KEY);
        setSearchParams({}, { replace: true });
      }
    };

    void syncCredits();
    return () => {
      cancelled = true;
    };
  }, [fetchCredits, searchParams, setSearchParams, venueId]);

  useEffect(() => {
    const vibeCreditsAdded = searchParams.get("vibe_credits_added") === "true";
    const vibeCreditsCancelled = searchParams.get("vibe_credits_cancelled") === "true";

    if (!vibeCreditsAdded && !vibeCreditsCancelled) return;

    if (vibeCreditsCancelled) {
      toast.info("Vibe credits purchase cancelled.");
      clearVenueCreditCheckoutState(VIBE_CREDITS_CHECKOUT_STORAGE_KEY);
      setSearchParams({}, { replace: true });
      return;
    }

    if (!venueId || vibePollStartedRef.current) return;
    vibePollStartedRef.current = true;

    const parsedExpectedCredits = Number.parseInt(searchParams.get("vibe_credits_expected") || "0", 10);
    const expectedCredits = Number.isFinite(parsedExpectedCredits) ? Math.max(parsedExpectedCredits, 0) : 0;
    const reachTier = searchParams.get("vibe_reach_tier") || "local";
    const checkoutState = getVenueCreditCheckoutState(VIBE_CREDITS_CHECKOUT_STORAGE_KEY);
    const balanceBeforeCheckout = checkoutState?.venueId === venueId &&
      checkoutState.reachTier === reachTier &&
      checkoutState.expectedCredits === expectedCredits
      ? checkoutState.balanceBeforeCheckout
      : null;
    const expectedTotal = balanceBeforeCheckout === null
      ? Math.max(expectedCredits, 1)
      : balanceBeforeCheckout + expectedCredits;

    let cancelled = false;
    setIsSyncingVibeCredits(true);
    toast.success("Payment confirmed - syncing your vibe credits.");

    const syncVibeCredits = async () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) return;

        const { data } = await supabase
          .from("venue_vibe_credits")
          .select("credits_remaining")
          .eq("venue_id", venueId);
        const currentTotal = data?.reduce((sum, row) => sum + (row.credits_remaining || 0), 0) ?? 0;

        if (currentTotal >= expectedTotal) {
          await fetchVibeCredits();
          if (cancelled) return;

          setIsSyncingVibeCredits(false);
          toast.success(`${expectedCredits || currentTotal} vibe credit${expectedCredits !== 1 ? "s" : ""} are ready!`);
          clearVenueCreditCheckoutState(VIBE_CREDITS_CHECKOUT_STORAGE_KEY);
          setSearchParams({}, { replace: true });
          vibePollStartedRef.current = false;
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!cancelled) {
        await fetchVibeCredits();
        if (cancelled) return;

        setIsSyncingVibeCredits(false);
        toast.info("Vibe credits may take a moment to appear. Please refresh the page if they do not show up.");
        clearVenueCreditCheckoutState(VIBE_CREDITS_CHECKOUT_STORAGE_KEY);
        setSearchParams({}, { replace: true });
        vibePollStartedRef.current = false;
      }
    };

    void syncVibeCredits();
    return () => {
      cancelled = true;
    };
  }, [fetchVibeCredits, searchParams, setSearchParams, venueId]);

  const handleBuyCreditsFromDealer = () => {
    setShowDealCreator(false);
    setFundingAmount(null);
    setShowDealsModal(true);
  };

  const handleConfirmFundingAmount = (amount: number) => {
    setFundingAmount(amount);
    setShowAddFundsModal(false);
    setShowDealsModal(true);
  };

  const handleCloseDealsModal = () => {
    setShowDealsModal(false);
    setFundingAmount(null);
  };

  const handleResumeDeal = () => {
    setCreditsSynced(false);
    setShowDealCreator(true);
  };

  const handleTransfer = () => {
    toast.info("Transfers are not available for venue wallets yet.");
  };

  const savedDraft = getSavedDraft();
  const canUsePromotionTools = isVenueVerified || isTestingMode;

  return (
    <>
      <PushNotificationDealsModal
        isOpen={showDealsModal}
        onClose={handleCloseDealsModal}
        venueId={venueId || undefined}
        currentCredits={totalCredits}
        resumeDeal
        initialBudget={fundingAmount}
      />
      <VenueAddFundsModal
        open={showAddFundsModal}
        onClose={() => setShowAddFundsModal(false)}
        onConfirm={handleConfirmFundingAmount}
        currencySymbol={getCurrencyInfo().symbol}
      />
      <DealCreatorModal
        isOpen={showDealCreator}
        onClose={() => setShowDealCreator(false)}
        availableCredits={totalCredits}
        venueId={venueId || undefined}
        prefillData={savedDraft}
        onBuyCredits={handleBuyCreditsFromDealer}
      />
      <UnifiedDealCreator
        isOpen={showUnifiedCreator}
        onClose={() => setShowUnifiedCreator(false)}
        venueId={venueId || undefined}
        onBuyCredits={handleBuyCreditsFromDealer}
      />
      <BuyVibeCreditsModal
        isOpen={showBuyVibesModal}
        onClose={() => setShowBuyVibesModal(false)}
        venueId={venueId || undefined}
        currentVibeCredits={totalVibeCredits}
      />
      <Dialog open={showDealsLibrary} onOpenChange={setShowDealsLibrary}>
        <DialogContent className="venue-dialog-surface venue-wallet-library-dialog">
          <DialogHeader>
            <DialogTitle>Deals library</DialogTitle>
            <DialogDescription>Reuse a saved promotion or review previous deal drafts.</DialogDescription>
          </DialogHeader>
          {venueId ? <DealsLibrary venueId={venueId} /> : <p className="venue-wallet-empty">Loading venue data...</p>}
        </DialogContent>
      </Dialog>
      {venueId && (
        <WithdrawModal
          open={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          balance={balance.jvc}
          venueId={venueId}
          onSuccess={fetchBalance}
        />
      )}

      <main className="venue-wallet-page" aria-labelledby="venue-wallet-title">
        <header className="venue-wallet-heading">
          <div>
            <h1 id="venue-wallet-title">Wallet</h1>
            <p>Track venue funds, payouts, and promotion credits.</p>
          </div>
          <button
            className="venue-wallet-button venue-wallet-button--primary"
            type="button"
            onClick={() => setShowAddFundsModal(true)}
            disabled={!canUsePromotionTools}
            title={!canUsePromotionTools ? "Complete venue verification first" : undefined}
          >
            <Plus aria-hidden="true" />
            <span>Add funds</span>
          </button>
        </header>

        <AnimatePresence>
          {creditsSynced && (
            <motion.section
              className="venue-wallet-sync-card"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <div>
                <span className="venue-wallet-sync-card__icon"><CheckCircle2 aria-hidden="true" /></span>
                <div>
                  <strong>{creditsAdded > 0 ? `${creditsAdded} ${purchasedTier} push credit${creditsAdded !== 1 ? "s" : ""} ready!` : "Push credits ready!"}</strong>
                  <p>Your promotion balance is ready to launch a deal to nearby customers.</p>
                </div>
              </div>
              <button className="venue-wallet-button venue-wallet-button--primary" type="button" onClick={handleResumeDeal}>
                <Zap aria-hidden="true" />
                <span>Launch deal</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </motion.section>
          )}
        </AnimatePresence>

        <section className="venue-wallet-layout" aria-label="Wallet management">
          <article className="venue-wallet-panel venue-wallet-balance-panel">
            <header className="venue-wallet-panel__heading">
              <div>
                <p className="venue-wallet-eyebrow">BALANCE</p>
                <h2>Funds ready to use</h2>
              </div>
              <Coins aria-hidden="true" />
            </header>
            <p className="venue-wallet-balance-panel__amount">
              {loading ? <Loader2 className="venue-wallet-spin" aria-label="Loading balance" /> : formatCurrency(jvcToLocal(balance.jvc))}
            </p>
            <p className="venue-wallet-balance-panel__copy">Your cleared balance can be paid out to the connected account or used to fund venue promotions.</p>
            <div className="venue-wallet-balance-panel__actions">
              <button
                className="venue-wallet-button venue-wallet-button--primary"
                type="button"
                onClick={() => setShowWithdrawModal(true)}
                disabled={balance.jvc < 50}
              >
                <ArrowUpRight aria-hidden="true" />
                <span>Withdraw</span>
              </button>
              <button className="venue-wallet-button venue-wallet-button--secondary" type="button" onClick={handleTransfer}>
                <ArrowRightLeft aria-hidden="true" />
                <span>Transfer</span>
              </button>
            </div>
            <small>Minimum withdrawal: {formatCurrency(jvcToLocal(50))}</small>
          </article>

          <article className="venue-wallet-panel venue-wallet-credits-panel">
            <header className="venue-wallet-panel__heading">
              <div>
                <p className="venue-wallet-eyebrow">PROMOTION</p>
                <h2>Push deal credits</h2>
              </div>
              <div className="venue-wallet-panel__heading-actions">
                <button
                  className="venue-wallet-panel__library-button"
                  type="button"
                  onClick={() => setShowDealsLibrary(true)}
                  aria-label="Open deals library"
                  title="Open deals library"
                >
                  <Library aria-hidden="true" />
                </button>
                <Send aria-hidden="true" />
              </div>
            </header>
            <div className="venue-wallet-credit-count">
              <strong>{isSyncingCredits ? <Loader2 className="venue-wallet-spin" aria-label="Syncing credits" /> : totalCredits}</strong>
              <span>{isSyncingCredits ? "syncing credits" : `credit${totalCredits !== 1 ? "s" : ""} available`}</span>
            </div>
            <p>Use a credit to promote a timely deal to nearby customers. Credits never expire while your venue remains active.</p>
            <div className="venue-wallet-credit-actions">
              <button
                className="venue-wallet-button venue-wallet-button--secondary venue-wallet-panel__action"
                type="button"
                onClick={() => setShowUnifiedCreator(true)}
              >
                <Plus aria-hidden="true" />
                <span>Create push deal</span>
              </button>
              <button
                className="venue-wallet-button venue-wallet-button--secondary venue-wallet-panel__action"
                type="button"
                onClick={() => setShowDealsModal(true)}
                disabled={!canUsePromotionTools}
                title={!canUsePromotionTools ? "Complete venue verification first" : undefined}
              >
                <Megaphone aria-hidden="true" />
                <span>Buy credits</span>
              </button>
            </div>
          </article>

          <article className="venue-wallet-panel venue-wallet-vibes-panel">
            <header className="venue-wallet-panel__heading">
              <div>
                <p className="venue-wallet-eyebrow">DEMAND TESTING</p>
                <h2>Vibe pushes</h2>
              </div>
              <span className="venue-wallet-vibes-count">
                {isSyncingVibeCredits ? <Loader2 className="venue-wallet-spin" aria-label="Syncing vibe credits" /> : `${totalVibeCredits} vibe${totalVibeCredits !== 1 ? "s" : ""}`}
              </span>
            </header>
            <p>Test nearby customer interest before committing a promotion credit to a full push deal.</p>
            {freeLocalCredits > 0 && (
              <small><Radio aria-hidden="true" />{freeLocalCredits} local vibe{freeLocalCredits !== 1 ? "s" : ""} available this week</small>
            )}
            <button
              className="venue-wallet-button venue-wallet-button--secondary venue-wallet-panel__action"
              type="button"
              onClick={() => setShowBuyVibesModal(true)}
              disabled={!canUsePromotionTools}
              title={!canUsePromotionTools ? "Complete venue verification first" : undefined}
            >
              <Radio aria-hidden="true" />
              <span>Create vibe push</span>
            </button>
          </article>
        </section>

        {venueId ? (
          <VenueWalletActivity venueId={venueId} />
        ) : (
          <section className="venue-wallet-activity venue-wallet-activity--transactions" aria-labelledby="venue-wallet-activity-title">
            <header className="venue-wallet-activity__heading">
              <div>
                <p className="venue-wallet-eyebrow">ACTIVITY</p>
                <h2 id="venue-wallet-activity-title">Transaction history</h2>
              </div>
            </header>
            <p className="venue-wallet-empty">Loading venue data...</p>
          </section>
        )}
      </main>
    </>
  );
}

import { useEffect, useState, type ElementType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Flag, Globe, Loader2, Map, MapPin, Megaphone, ShieldCheck, ShoppingCart, Sparkles, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  PUSH_CREDITS_CHECKOUT_STORAGE_KEY,
  saveVenueCreditCheckoutState,
} from "@/lib/venueCreditCheckout";
import "./push-notification-deals-modal.css";

interface PushNotificationDealsModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId?: string;
  /** Current push credit balance to display */
  currentCredits?: number;
  /** When true the purchase flow will append resume_deal=true to the success URL */
  resumeDeal?: boolean;
  /** Promotion budget entered before selecting credits. */
  initialBudget?: number | null;
}

type ReachType = "local" | "regional" | "state" | "national" | "international";
type PeriodType = "month" | "6months" | "12months";

interface Package {
  notifications: number;
  prices: Record<ReachType, number>;
}

const monthlyPackages: Package[] = [
  { notifications: 5, prices: { local: 17, regional: 21.25, state: 25.5, national: 34, international: 51 } },
  { notifications: 10, prices: { local: 32, regional: 40, state: 48, national: 64, international: 96 } },
  { notifications: 25, prices: { local: 70, regional: 87.5, state: 105, national: 140, international: 210 } },
  { notifications: 50, prices: { local: 120, regional: 150, state: 180, national: 240, international: 360 } },
];

const sixMonthPackages: Package[] = [
  { notifications: 60, prices: { local: 144, regional: 180, state: 216, national: 288, international: 432 } },
  { notifications: 120, prices: { local: 264, regional: 330, state: 396, national: 528, international: 792 } },
  { notifications: 180, prices: { local: 360, regional: 450, state: 540, national: 720, international: 1080 } },
  { notifications: 240, prices: { local: 432, regional: 540, state: 648, national: 864, international: 1296 } },
];

const yearlyPackages: Package[] = [
  { notifications: 200, prices: { local: 432, regional: 540, state: 648, national: 864, international: 1296 } },
  { notifications: 360, prices: { local: 612, regional: 765, state: 918, national: 1224, international: 1836 } },
  { notifications: 480, prices: { local: 768, regional: 960, state: 1152, national: 1536, international: 2304 } },
  { notifications: 600, prices: { local: 900, regional: 1125, state: 1350, national: 1800, international: 2700 } },
];

const reachInfo: Record<ReachType, { label: string; icon: ElementType; radius: string }> = {
  local: { label: "Local", icon: MapPin, radius: "Up to 25 km" },
  regional: { label: "Regional", icon: Map, radius: "Up to 100 km" },
  state: { label: "State", icon: Flag, radius: "State-wide" },
  national: { label: "National", icon: Globe, radius: "Country-wide" },
  international: { label: "International", icon: Sparkles, radius: "Worldwide" },
};

const periodInfo: Record<PeriodType, { label: string; tabLabel: string; badge?: string }> = {
  month: { label: "Per month", tabLabel: "Per month" },
  "6months": { label: "Per 6 months", tabLabel: "Per 6 months", badge: "Save 10%" },
  "12months": { label: "Per year", tabLabel: "Per year", badge: "Best value" },
};

export default function PushNotificationDealsModal({
  isOpen,
  onClose,
  venueId,
  currentCredits,
  resumeDeal = false,
  initialBudget = null,
}: PushNotificationDealsModalProps) {
  const [period, setPeriod] = useState<PeriodType>("month");
  const [reach, setReach] = useState<ReachType>("local");
  const [selectedPackage, setSelectedPackage] = useState<{ notifications: number; reach: ReachType; price: number } | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (!isOpen || !initialBudget) return;
    setSelectedPackage(null);
  }, [initialBudget, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !purchasing) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, purchasing]);

  const getPackages = () => {
    switch (period) {
      case "month":
        return monthlyPackages;
      case "6months":
        return sixMonthPackages;
      case "12months":
        return yearlyPackages;
    }
  };

  const handleSelectPackage = (notifications: number, packageReach: ReachType, price: number) => {
    setSelectedPackage({ notifications, reach: packageReach, price });
    window.setTimeout(() => {
      document.getElementById("push-credits-confirm")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  const changeReach = (nextReach: ReachType) => {
    if (nextReach === reach) return;
    setReach(nextReach);
    setSelectedPackage(null);
  };

  const changePeriod = (nextPeriod: PeriodType) => {
    if (nextPeriod === period) return;
    setPeriod(nextPeriod);
    setSelectedPackage(null);
  };

  const confirmPurchase = async () => {
    if (!selectedPackage || !venueId) return;
    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-push-credits-checkout", {
        body: {
          venueId,
          credits: selectedPackage.notifications,
          reachTier: selectedPackage.reach,
          price: selectedPackage.price,
          origin: window.location.origin,
          resumeDeal,
        },
      });
      if (error || !data?.url) throw new Error(error?.message || "Failed to create checkout session");
      saveVenueCreditCheckoutState(PUSH_CREDITS_CHECKOUT_STORAGE_KEY, {
        venueId,
        reachTier: selectedPackage.reach,
        expectedCredits: selectedPackage.notifications,
        balanceBeforeCheckout: currentCredits ?? null,
      });
      window.location.href = data.url;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Payment setup failed. Please try again.");
      setPurchasing(false);
    }
  };

  const packages = getPackages();
  const perCreditPrice = selectedPackage ? (selectedPackage.price / selectedPackage.notifications).toFixed(2) : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="venue-push-deals-modal__backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !purchasing) onClose();
          }}
        >
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.16 }}
            className="venue-push-deals-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="push-credits-title"
          >
            <header className="venue-push-deals-modal__header">
              <div>
                <h2 id="push-credits-title"><Megaphone aria-hidden="true" /> Buy push credits</h2>
                <p>Choose a reach, billing term, and credit bundle for your next promotion.</p>
              </div>
              <button
                type="button"
                className="venue-push-deals-modal__icon-button"
                onClick={onClose}
                disabled={purchasing}
                aria-label="Close buy credits dialog"
                title="Close"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="venue-push-deals-modal__body">
              {currentCredits !== undefined && (
                <p className="venue-push-deals-modal__balance">
                  <Zap aria-hidden="true" />
                  Current balance: <strong>{currentCredits} credit{currentCredits !== 1 ? "s" : ""}</strong>
                </p>
              )}

              {initialBudget !== null && initialBudget > 0 && (
                <p className="venue-push-deals-modal__funding-note">
                  <Zap aria-hidden="true" />
                  <span><strong>${initialBudget.toFixed(2)} promotion budget set.</strong> Choose the push-credit bundle to purchase with this budget.</span>
                </p>
              )}

              <section className="venue-push-deals-modal__intro" aria-labelledby="push-reach-heading">
                <h3 id="push-reach-heading">Promotion reach</h3>
                <p>Each credit launches one push deal. Wider reach changes the package price.</p>
              </section>

              <div className="venue-push-deals-modal__tabs" role="tablist" aria-label="Promotion reach">
                {(Object.keys(reachInfo) as ReachType[]).map((option) => {
                  const Icon = reachInfo[option].icon;
                  const active = option === reach;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={active ? "is-active" : undefined}
                      onClick={() => changeReach(option)}
                    >
                      <Icon aria-hidden="true" />
                      {reachInfo[option].label}
                    </button>
                  );
                })}
              </div>

              <div className="venue-push-deals-modal__tabs venue-push-deals-modal__tabs--terms" role="tablist" aria-label="Billing term">
                {(Object.keys(periodInfo) as PeriodType[]).map((option) => {
                  const active = option === period;
                  const info = periodInfo[option];
                  return (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={active ? "is-active" : undefined}
                      onClick={() => changePeriod(option)}
                    >
                      <span>{info.tabLabel}</span>
                      {info.badge && <em>{info.badge}</em>}
                    </button>
                  );
                })}
              </div>

              <section className="venue-push-deals-modal__package-list" aria-label={`${reachInfo[reach].label} reach credit bundles`}>
                <div className="venue-push-deals-modal__package-heading" aria-hidden="true">
                  <span>Credits</span>
                  <span>Package price</span>
                  <span>Action</span>
                </div>
                {packages.map((pkg) => {
                  const price = pkg.prices[reach];
                  const isSelected = selectedPackage?.notifications === pkg.notifications
                    && selectedPackage.reach === reach
                    && selectedPackage.price === price;
                  return (
                    <div key={pkg.notifications} className={`venue-push-deals-modal__package-row${isSelected ? " is-selected" : ""}`}>
                      <div className="venue-push-deals-modal__package-amount">
                        <strong>{pkg.notifications}</strong>
                        <span>credits</span>
                      </div>
                      <div className="venue-push-deals-modal__package-price">
                        <strong>${price.toFixed(2)}</strong>
                        <small>${(price / pkg.notifications).toFixed(2)} per credit</small>
                      </div>
                      <button
                        type="button"
                        className="venue-push-deals-modal__select-button"
                        onClick={() => handleSelectPackage(pkg.notifications, reach, price)}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? <><Check aria-hidden="true" /> Selected</> : "Select"}
                      </button>
                    </div>
                  );
                })}
              </section>

              <AnimatePresence initial={false}>
                {selectedPackage && (
                  <motion.section
                    id="push-credits-confirm"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16 }}
                    className="venue-push-deals-modal__selection"
                    aria-live="polite"
                  >
                    <div className="venue-push-deals-modal__selection-heading">
                      <div>
                        <p>Your selection</p>
                        <h3>{selectedPackage.notifications} push credits</h3>
                        <span>{reachInfo[selectedPackage.reach].label} reach, {periodInfo[period].label}</span>
                      </div>
                      <div>
                        <strong>${selectedPackage.price.toFixed(2)}</strong>
                        <small>${perCreditPrice} per credit</small>
                      </div>
                    </div>
                    <p className="venue-push-deals-modal__checkout-note">
                      <ShieldCheck aria-hidden="true" /> Secure checkout via Stripe. Credits are added immediately after payment.
                    </p>
                    <div className="venue-push-deals-modal__actions">
                      <button
                        type="button"
                        className="venue-push-deals-modal__secondary-button"
                        onClick={() => setSelectedPackage(null)}
                        disabled={purchasing}
                      >
                        Change selection
                      </button>
                      <button
                        type="button"
                        className="venue-push-deals-modal__primary-button"
                        onClick={confirmPurchase}
                        disabled={purchasing}
                      >
                        {purchasing ? <><Loader2 className="is-spinning" aria-hidden="true" /> Redirecting to Stripe...</> : <><ShoppingCart aria-hidden="true" /> Pay ${selectedPackage.price.toFixed(2)}</>}
                      </button>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

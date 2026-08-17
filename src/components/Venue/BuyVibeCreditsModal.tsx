import { useEffect, useState, type ElementType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Flag, Globe, Loader2, Map, MapPin, Radio, ShoppingCart, Sparkles, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  saveVenueCreditCheckoutState,
  VIBE_CREDITS_CHECKOUT_STORAGE_KEY,
} from "@/lib/venueCreditCheckout";
import "./buy-vibe-credits-modal.css";

interface BuyVibeCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId?: string;
  currentVibeCredits?: number;
}

type ReachType = "local" | "regional" | "state" | "national" | "international";

interface VibePackage {
  count: number;
  prices: Record<ReachType, number>;
}

const vibePackages: VibePackage[] = [
  { count: 5, prices: { local: 5, regional: 6, state: 7, national: 10, international: 14 } },
  { count: 15, prices: { local: 13, regional: 16, state: 19, national: 27, international: 39 } },
  { count: 40, prices: { local: 32, regional: 39, state: 47, national: 67, international: 108 } },
];

const reachInfo: Record<ReachType, { icon: ElementType; radius: string }> = {
  local: { icon: MapPin, radius: "Up to 25 km" },
  regional: { icon: Map, radius: "Up to 100 km" },
  state: { icon: Flag, radius: "State-wide" },
  national: { icon: Globe, radius: "Country-wide" },
  international: { icon: Sparkles, radius: "Worldwide" },
};

const reachTypes: ReachType[] = ["local", "regional", "state", "national", "international"];

export default function BuyVibeCreditsModal({
  isOpen,
  onClose,
  venueId,
  currentVibeCredits,
}: BuyVibeCreditsModalProps) {
  const { t } = useTranslation("venue");
  const [selectedReach, setSelectedReach] = useState<ReachType>("local");
  const [selectedPackage, setSelectedPackage] = useState<{ count: number; price: number } | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !purchasing) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, purchasing]);

  const handleSelect = (count: number, price: number) => {
    setSelectedPackage({ count, price });
  };

  const handleReachChange = (reach: ReachType) => {
    setSelectedReach(reach);
    setSelectedPackage(null);
  };

  const confirmPurchase = async () => {
    if (!selectedPackage || !venueId) return;

    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-vibe-credits-checkout", {
        body: {
          venueId,
          credits: selectedPackage.count,
          reachTier: selectedReach,
          price: selectedPackage.price,
          origin: window.location.origin,
        },
      });
      if (error || !data?.url) {
        throw new Error(error?.message || t("vibe_credits_modal.errors.checkout_failed"));
      }
      saveVenueCreditCheckoutState(VIBE_CREDITS_CHECKOUT_STORAGE_KEY, {
        venueId,
        reachTier: selectedReach,
        expectedCredits: selectedPackage.count,
        balanceBeforeCheckout: currentVibeCredits ?? null,
      });
      window.location.href = data.url;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("vibe_credits_modal.errors.payment_failed"));
      setPurchasing(false);
    }
  };

  const perCreditPrice = selectedPackage
    ? (selectedPackage.price / selectedPackage.count).toFixed(2)
    : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="venue-vibe-credits-modal__backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !purchasing) onClose();
          }}
        >
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.16 }}
            className="venue-vibe-credits-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vibe-credits-title"
          >
            <header className="venue-vibe-credits-modal__header">
              <div>
                <h2 id="vibe-credits-title"><Radio aria-hidden="true" /> {t("vibe_credits_modal.title")}</h2>
                <p>{t("vibe_credits_modal.subtitle")}</p>
              </div>
              <button
                type="button"
                className="venue-vibe-credits-modal__icon-button"
                onClick={onClose}
                disabled={purchasing}
                aria-label="Close buy vibe credits dialog"
                title="Close"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="venue-vibe-credits-modal__body">
              {currentVibeCredits !== undefined && (
                <p className="venue-vibe-credits-modal__balance">
                  <Zap aria-hidden="true" />
                  {t("vibe_credits_modal.current_balance")}
                  <strong>{t("vibe_credits_modal.credit", { count: currentVibeCredits, defaultValue: `${currentVibeCredits} vibe credits` })}</strong>
                </p>
              )}

              <section className="venue-vibe-credits-modal__intro" aria-labelledby="vibe-reach-heading">
                <h3 id="vibe-reach-heading">{t("vibe_credits_modal.select_reach")}</h3>
                <p>{t("vibe_credits_modal.free_weekly")}</p>
              </section>

              <div className="venue-vibe-credits-modal__tabs" role="tablist" aria-label="Vibe push reach">
                {reachTypes.map((reach) => {
                  const Icon = reachInfo[reach].icon;
                  const active = selectedReach === reach;
                  return (
                    <button
                      key={reach}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={active ? "is-active" : undefined}
                      onClick={() => handleReachChange(reach)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{t(`vibe_credits_modal.reach.${reach}_label`)}</span>
                    </button>
                  );
                })}
              </div>

              <section className="venue-vibe-credits-modal__packages" aria-label="Vibe credit bundles">
                {vibePackages.map((pkg) => {
                  const price = pkg.prices[selectedReach];
                  const selected = selectedPackage?.count === pkg.count && selectedPackage.price === price;
                  return (
                    <button
                      key={pkg.count}
                      type="button"
                      onClick={() => handleSelect(pkg.count, price)}
                      className={selected ? "is-selected" : undefined}
                      aria-pressed={selected}
                    >
                      <span>
                        <strong>{pkg.count}</strong>
                        <small>{t("vibe_credits_modal.credits_unit")}</small>
                      </span>
                      <b>${price.toFixed(2)}</b>
                      <em>{t("vibe_credits_modal.per_each", { price: (price / pkg.count).toFixed(2) })}</em>
                      {selected && <Check aria-hidden="true" />}
                    </button>
                  );
                })}
              </section>

              <AnimatePresence initial={false}>
                {selectedPackage && (
                  <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16 }}
                    className="venue-vibe-credits-modal__selection"
                    aria-live="polite"
                  >
                    <div>
                      <p>{t("vibe_credits_modal.selected_label", {
                        count: selectedPackage.count,
                        reach: t(`vibe_credits_modal.reach.${selectedReach}_label`),
                      })}</p>
                      <small>{t("vibe_credits_modal.per_push", { price: perCreditPrice })}</small>
                    </div>
                    <div className="venue-vibe-credits-modal__actions">
                      <button
                        type="button"
                        className="venue-vibe-credits-modal__secondary-button"
                        onClick={() => setSelectedPackage(null)}
                        disabled={purchasing}
                      >
                        Change selection
                      </button>
                      <button
                        type="button"
                        className="venue-vibe-credits-modal__primary-button"
                        onClick={confirmPurchase}
                        disabled={purchasing}
                      >
                        {purchasing ? <><Loader2 className="is-spinning" aria-hidden="true" /> {t("vibe_credits_modal.processing")}</> : <><ShoppingCart aria-hidden="true" /> {t("vibe_credits_modal.pay_amount", { amount: selectedPackage.price })}</>}
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

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Rocket, Check } from "lucide-react";
import { getVenuePrice } from "@/config/venuePricing";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface SubscriptionCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  venueId: string;
  venueCountryCode: string;
}

const features = [
  "Unlimited orders & payments",
  "Visible to all customers",
  "Push notifications & deals",
  "Full analytics dashboard",
  "Staff management",
  "Cancel anytime",
];

export default function SubscriptionCheckoutModal({
  open,
  onClose,
  venueId,
  venueCountryCode,
}: SubscriptionCheckoutModalProps) {
  const { t } = useTranslation('venue');
  const [loading, setLoading] = useState(false);
  const price = getVenuePrice(venueCountryCode);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-venue-subscription", {
        body: { venue_id: venueId, origin: window.location.origin },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      console.error("Subscription error:", err);
      // FunctionsHttpError wraps the real message in err.context – try to extract it
      let message = err?.message || "Failed to start checkout";
      try {
        const body = await err?.context?.json?.();
        if (body?.error) message = body.error;
      } catch { /* use fallback message */ }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="venue-dialog-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Subscribe & Go Live</DialogTitle>
          <DialogDescription>
            Get full access to all JointVibe venue features.
          </DialogDescription>
        </DialogHeader>

        <div className="text-center py-4">
          <div className="text-4xl font-bold text-foreground">{price.display}</div>
          <p className="text-muted-foreground text-sm mt-1">Monthly subscription</p>
        </div>

        <div className="space-y-2 pb-2">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>{t("common:app.cancel")}</Button>
          <Button
            onClick={handleSubscribe}
            disabled={loading}
            className="venue-dialog-primary-action gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Subscribe — {price.display}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

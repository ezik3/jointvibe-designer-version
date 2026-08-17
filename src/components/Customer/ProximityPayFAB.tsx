import { useAuth } from "@/contexts/AuthContext";
import { useProximityPayment } from "@/hooks/useProximityPayment";
import { useUserCheckIn } from "@/hooks/useUserCheckIn";
import { BLEPayNearbyButton } from "@/components/Customer/BLEPayNearbyButton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

/**
 * Floating entry point for customer BLE "Tap to Pay".
 * Only shows when the user is checked-in AND the runtime supports BLE payments.
 */
export default function ProximityPayFAB() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { currentCheckIn } = useUserCheckIn();
  const proximity = useProximityPayment();

  const isIOSBrowser =
    typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (!user || !currentCheckIn) return null;

  // Full BLE flow (native iOS/Android, and Web Bluetooth capable browsers)
  if (proximity.ble.isBLESupported && proximity.ble.isBLEEnabled) {
    return (
      <div className="fixed bottom-6 right-6 z-[90]">
        <BLEPayNearbyButton className="rounded-full shadow-lg px-5 h-12" />
      </div>
    );
  }

  // iPhone browser: show an entry point so users don’t think it’s “missing”
  if (isIOSBrowser) {
    return (
      <div className="fixed bottom-6 right-6 z-[90]">
        <Button
          variant="outline"
          className="rounded-full shadow-lg px-5 h-12"
          onClick={() => {
            toast.message("Tap to Pay needs the installed app on iPhone", {
              description:
                "iPhone browsers don’t support Bluetooth payments. Use QR for now, or run the native build to test Tap to Pay.",
            });
          }}
        >
          Tap to Pay
        </Button>
      </div>
    );
  }

  return null;
}

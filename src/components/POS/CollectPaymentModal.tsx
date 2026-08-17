import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Capacitor } from "@capacitor/core";
import { 
  QrCode, 
  Smartphone, 
  Banknote, 
  CheckCircle2, 
  Loader2,
  AlertCircle,
  Calculator,
  Bluetooth,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { PaymentQRModal } from "@/components/Payment/PaymentQRModal";
import { TapToReceiveModal } from "@/components/POS/TapToReceiveModal";
import { BLEAcceptPaymentModal } from "@/components/POS/BLEAcceptPaymentModal";
import { GuestPayModal } from "@/components/POS/GuestPayModal";
import { useNFCPayment } from "@/hooks/useNFCPayment";
import { useProximityPayment } from "@/hooks/useProximityPayment";
import { useTranslation } from 'react-i18next';
import "./collect-payment-modal.css";

interface CollectPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId?: string;
  venueName?: string;
  orderId?: string;
  orderTotal: number;
  orderNumber: number;
  onPaymentComplete: (method: "qr_scan" | "nfc_tap" | "ble_tap" | "cash" | "guest_pay") => void;
  orderItems?: Array<{ name: string; price: number; quantity: number }>;
}

export function CollectPaymentModal({
  open,
  onOpenChange,
  venueId,
  venueName,
  orderId,
  orderTotal,
  orderNumber,
  onPaymentComplete,
  orderItems,
}: CollectPaymentModalProps) {
  const { t } = useTranslation('pos');
  const [selectedMethod, setSelectedMethod] = useState<"qr_scan" | "nfc_tap" | "ble_tap" | "cash" | "guest_pay" | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showNFCModal, setShowNFCModal] = useState(false);
  const [showBLEModal, setShowBLEModal] = useState(false);
  const [showGuestPayModal, setShowGuestPayModal] = useState(false);
  const [showCashCalculator, setShowCashCalculator] = useState(false);
  const [amountReceived, setAmountReceived] = useState("");
  const { isNFCSupported } = useNFCPayment();
  const proximity = useProximityPayment();
  const { paymentState: proximityState } = proximity;

  // For digital payments (QR/NFC/BLE), include platform fee. For cash, NO fee.
  const platformFee = 0.10;
  const totalWithFee = orderTotal + platformFee;
  const cashTotal = orderTotal; // No fee for cash

  // Calculate change for cash
  const receivedAmount = parseFloat(amountReceived) || 0;
  const changeAmount = receivedAmount - cashTotal;

  const isIOSBrowser =
    typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isNative = Capacitor.isNativePlatform();

  // BLE availability check (true only when the runtime can actually do BLE)
  const bleAvailable = !!venueId && proximity.ble.isBLESupported && proximity.ble.isBLEEnabled;

  const bleInfoMessage = !bleAvailable
    ? isIOSBrowser && !isNative
      ? "Tap to Pay (Bluetooth) requires the installed app on iPhone; mobile browsers don’t support Bluetooth payments. Use QR for now, or run the native build to test BLE."
      : "Tap to Pay (Bluetooth) isn’t available on this device/browser right now. Use QR for now."
    : null;

  const handlePaymentMethod = async (method: "qr_scan" | "nfc_tap" | "ble_tap" | "cash" | "guest_pay") => {
    setSelectedMethod(method);

    if (method === "cash") {
      // Show cash calculator
      setShowCashCalculator(true);
    } else if (method === "qr_scan") {
      // Show QR modal
      if (!venueId) {
        toast.error("Venue not configured for QR payments");
        return;
      }
      setShowQRModal(true);
    } else if (method === "nfc_tap") {
      // Open NFC receive modal
      if (!venueId) {
        toast.error("Venue not configured for NFC payments");
        return;
      }
      setShowNFCModal(true);
    } else if (method === "ble_tap") {
      // Open BLE accept payment modal
      if (!venueId) {
        toast.error("Venue not configured for proximity payments");
        return;
      }
      setShowBLEModal(true);
    } else if (method === "guest_pay") {
      // Open Guest Pay modal for non-app customers
      if (!venueId) {
        toast.error("Venue not configured for guest payments");
        return;
      }
      setShowGuestPayModal(true);
    }
  };

  const handleCashPaymentConfirm = () => {
    if (receivedAmount < cashTotal) {
      toast.error("Amount received is less than the total");
      return;
    }
    
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      toast.success(`Cash payment received for Order #${orderNumber}`, {
        description: changeAmount > 0 ? `Change: $${changeAmount.toFixed(2)}` : undefined,
      });
      onPaymentComplete("cash");
      onOpenChange(false);
      setSelectedMethod(null);
      setShowCashCalculator(false);
      setAmountReceived("");
    }, 500);
  };

  const handleNFCPaymentComplete = (transactionId: string) => {
    setShowNFCModal(false);
    toast.success(`NFC payment received for Order #${orderNumber}`);
    onPaymentComplete("nfc_tap");
    onOpenChange(false);
    setSelectedMethod(null);
  };

  const handleBLEPaymentComplete = (transactionId: string) => {
    setShowBLEModal(false);
    toast.success(`Proximity payment received for Order #${orderNumber}`);
    onPaymentComplete("ble_tap");
    onOpenChange(false);
    setSelectedMethod(null);
  };

  const handleQRPaymentComplete = () => {
    setShowQRModal(false);
    toast.success(`Payment received for Order #${orderNumber}`);
    onPaymentComplete("qr_scan");
    onOpenChange(false);
    setSelectedMethod(null);
  };

  const handleGuestPayComplete = () => {
    setShowGuestPayModal(false);
    toast.success(`Guest payment received for Order #${orderNumber}`);
    onPaymentComplete("guest_pay");
    onOpenChange(false);
    setSelectedMethod(null);
  };

  // Determine primary payment method based on device support
  // BLE is preferred (works on native iOS/Android), then NFC (Android web/native), then QR as fallback
  const nfcAvailable = isNFCSupported && !!venueId;
  const qrAvailable = !!venueId;

  // Build payment methods list - only show available options
  // Order: BLE first (preferred for iOS), then QR, Guest Pay, then Cash
  const paymentMethods: Array<{
    id: "qr_scan" | "nfc_tap" | "ble_tap" | "cash" | "guest_pay";
    name: string;
    description: string;
    icon: typeof QrCode;
    available: boolean;
    badge: string | null;
    isPrimary: boolean;
  }> = [];

  // Add BLE "Tap to Pay" entry (always shown when venue is configured)
  // - If BLE runtime is available: recommended
  // - If not: still opens the staff accept modal (which will show QR fallback)
  if (venueId) {
    paymentMethods.push({
      id: "ble_tap",
      name: "Tap to Pay",
      description: bleAvailable ? "Customer taps phone nearby to pay" : "Bluetooth not available here — QR fallback in next screen",
      icon: Bluetooth,
      available: true,
      badge: !bleAvailable && isIOSBrowser && !isNative ? "iPhone" : null,
      isPrimary: bleAvailable,
    });
  }

  // Add NFC if supported (mostly Android)
  if (nfcAvailable && !bleAvailable) {
    paymentMethods.push({
      id: "nfc_tap",
      name: "NFC Tap",
      description: "Customer taps phone to pay (Android)",
      icon: Smartphone,
      available: true,
      badge: "Android",
      isPrimary: false,
    });
  }

  // Add QR Code (always available as fallback)
  if (qrAvailable) {
    paymentMethods.push({
      id: "qr_scan",
      name: "QR Code",
      description: "Customer scans QR to pay",
      icon: QrCode,
      available: true,
      badge: null,
      isPrimary: !bleAvailable && !nfcAvailable, // Primary only when no proximity options
    });
  }

  // Guest Pay - for customers without the app
  if (venueId) {
    paymentMethods.push({
      id: "guest_pay",
      name: "Guest Pay",
      description: "Customer pays through a secure link",
      icon: ExternalLink,
      available: true,
      badge: "NO APP",
      isPrimary: false,
    });
  }

  // Cash is always available, always at the bottom
  paymentMethods.push({
    id: "cash",
    name: "Cash",
    description: "Accept cash payment (no fee)",
    icon: Banknote,
    available: true,
    badge: null,
    isPrimary: !qrAvailable && !nfcAvailable && !bleAvailable,
  });

  return (
    <>
      <Dialog open={open && !showQRModal && !showCashCalculator && !showBLEModal && !showGuestPayModal} onOpenChange={onOpenChange}>
        <DialogContent className="pos-collect-payment-dialog !gap-0 !p-0">
          <DialogHeader className="pos-collect-payment-dialog__heading !space-y-0">
            <DialogTitle>
              Collect Payment
              <span>Order #{orderNumber}</span>
            </DialogTitle>
            <DialogDescription>Select a payment method to collect this order.</DialogDescription>
          </DialogHeader>

          <div className="pos-collect-payment-dialog__body">
            <section className="pos-collect-payment-summary" aria-label="Payment totals">
              <div>
                <span>Order total</span>
                <strong>${orderTotal.toFixed(2)}</strong>
              </div>
              <div>
                <span>Platform fee <small>Digital payments only</small></span>
                <strong>${platformFee.toFixed(2)}</strong>
              </div>
              <div className="pos-collect-payment-summary__total">
                <span>Digital payment total</span>
                <strong>${totalWithFee.toFixed(2)}</strong>
              </div>
              <div>
                <span>Cash total <small>No fee</small></span>
                <strong>${cashTotal.toFixed(2)}</strong>
              </div>
            </section>

            <section className="pos-collect-payment-methods" aria-label="Payment methods">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  className={`pos-collect-payment-method${method.isPrimary ? " is-primary" : ""}`}
                  type="button"
                  onClick={() => handlePaymentMethod(method.id)}
                  disabled={processing || !method.available}
                  aria-haspopup="dialog"
                >
                  <span className="pos-collect-payment-method__icon">
                      {processing && selectedMethod === method.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <method.icon />
                      )}
                  </span>
                  <span className="pos-collect-payment-method__copy">
                    <strong>
                      {method.name}
                        {method.badge && (
                          <em>{method.badge}</em>
                        )}
                    </strong>
                    <small>{method.description}</small>
                  </span>
                  {selectedMethod === method.id && processing && <CheckCircle2 className="pos-collect-payment-method__status" />}
                </button>
              ))}
            </section>

            {bleInfoMessage && venueId && (
              <p className="pos-collect-payment-dialog__notice">
                {bleInfoMessage}
              </p>
            )}

            {!venueId && (
              <p className="pos-collect-payment-dialog__notice">
                <AlertCircle aria-hidden="true" />
                <span>Digital payments require venue configuration. Use Cash for now.</span>
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCashCalculator} onOpenChange={(open) => {
        if (!open) {
          setShowCashCalculator(false);
          setSelectedMethod(null);
          setAmountReceived("");
        }
      }}>
        <DialogContent className="pos-collect-cash-dialog !gap-0 !p-0">
          <DialogHeader className="pos-collect-cash-dialog__heading !space-y-0">
            <DialogTitle>
              <Calculator />
              Cash Payment
            </DialogTitle>
            <DialogDescription>Order #{orderNumber} - Enter amount received</DialogDescription>
          </DialogHeader>

          <div className="pos-collect-cash-dialog__body">
            <section className="pos-collect-cash-dialog__amount-card">
              <span>Total to collect</span>
              <strong>${cashTotal.toFixed(2)}</strong>
              <small>No platform fee on cash</small>
            </section>

            <label className="pos-collect-cash-dialog__field" htmlFor="cash-amount-received">
              <span>Amount received</span>
              <span className="pos-collect-cash-dialog__input">
                <b aria-hidden="true">$</b>
                <Input
                  id="cash-amount-received"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  className="pos-collect-cash-dialog__input-field"
                  autoFocus
                />
              </span>
            </label>

            <div className="pos-collect-cash-dialog__quick-amounts" aria-label="Quick cash amounts">
              {[5, 10, 20, 50, 100, Math.ceil(cashTotal)].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setAmountReceived(amount.toString())}
                  className="pos-collect-cash-dialog__quick-amount"
                >
                  ${amount}
                </button>
              ))}
            </div>

            {receivedAmount > 0 && (
              <section className={`pos-collect-cash-dialog__change${changeAmount < 0 ? " is-short" : ""}`} aria-live="polite">
                <span>{changeAmount >= 0 ? "Change to give" : "Amount short"}</span>
                <strong>${Math.abs(changeAmount).toFixed(2)}</strong>
              </section>
            )}

            <button
              className="pos-collect-cash-dialog__button pos-collect-cash-dialog__button--primary"
              type="button"
              onClick={handleCashPaymentConfirm}
              disabled={processing || receivedAmount < cashTotal}
            >
              {processing ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Confirm Payment
            </button>

            <button
              className="pos-collect-cash-dialog__button pos-collect-cash-dialog__button--secondary"
              type="button"
              onClick={() => {
                setShowCashCalculator(false);
                setSelectedMethod(null);
                setAmountReceived("");
              }}
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      {venueId && (
        <PaymentQRModal
          open={showQRModal}
          onOpenChange={setShowQRModal}
          venueId={venueId}
          orderId={orderId}
          amount={orderTotal}
          onPaymentComplete={handleQRPaymentComplete}
        />
      )}

      {/* NFC Tap to Receive Modal */}
      {venueId && (
        <TapToReceiveModal
          isOpen={showNFCModal}
          onClose={() => setShowNFCModal(false)}
          orderId={orderId}
          amount={orderTotal}
          venueId={venueId}
          onPaymentComplete={handleNFCPaymentComplete}
          onFallbackToQR={() => {
            setShowNFCModal(false);
            setShowQRModal(true);
          }}
        />
      )}

      {/* BLE Proximity Payment Modal */}
      {venueId && (
        <BLEAcceptPaymentModal
          isOpen={showBLEModal}
          onClose={() => {
            setShowBLEModal(false);
            setSelectedMethod(null);
          }}
          orderId={orderId}
          amount={orderTotal}
          venueId={venueId}
          venueName={venueName || "Venue"}
          onPaymentComplete={handleBLEPaymentComplete}
        />
      )}

      {/* Guest Pay Modal - for customers without the app */}
      {venueId && (
        <GuestPayModal
          open={showGuestPayModal}
          onOpenChange={(open) => {
            setShowGuestPayModal(open);
            if (!open) setSelectedMethod(null);
          }}
          venueId={venueId}
          venueName={venueName || "Venue"}
          orderId={orderId}
          orderNumber={orderNumber}
          amount={orderTotal}
          orderItems={orderItems}
          onPaymentComplete={handleGuestPayComplete}
        />
      )}
    </>
  );
}

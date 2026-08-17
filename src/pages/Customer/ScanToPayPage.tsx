import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  Store,
  Clock,
  Wallet,
  ArrowLeft,
  Plus,
  Minus,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TRANSACTION_FEE_USD, useJVCoinWallet } from "@/hooks/useJVCoinWallet";
import { useAuth } from "@/contexts/AuthContext";
import { SIMULATION_MODE } from "@/config/paymentConfig";
import { useCurrency } from "@/hooks/useCurrency";
import ETATimeSelector from "@/components/Customer/ETATimeSelector";
import { useTranslation } from 'react-i18next';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

interface PaymentRequestDetails {
  id: string;
  venue_id: string;
  venue_name: string;
  venue_address?: string;
  order_id?: string;
  amount: number;
  fee: number;
  total: number;
  status: string;
  expires_at: string;
  is_expired: boolean;
  order_subtotal?: number;
  order_total?: number;
  order_notes?: string;
}

export default function ScanToPayPage() {
  const { t } = useTranslation('common');
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { balance, fetchBalance, payVenue } = useJVCoinWallet();
  const { formatCurrency, jvcToLocal, userCurrency } = useCurrency();
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentRequestDetails | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [testWalletBalance, setTestWalletBalance] = useState<number | null>(null);
  const [isTestVenue, setIsTestVenue] = useState(false);

  // Debug: Log simulation mode on mount
  console.log('[ScanToPayPage] MOUNTED - SIMULATION_MODE:', SIMULATION_MODE, 'token:', token);

  const fetchBalanceRef = useRef(fetchBalance);

  // Keep latest function without re-triggering payment detail fetches
  useEffect(() => {
    fetchBalanceRef.current = fetchBalance;
  }, [fetchBalance]);

  // Fetch wallet balance once on mount
  useEffect(() => {
    void fetchBalanceRef.current();
  }, []);

  // Fetch payment request details (only when token changes)
  useEffect(() => {
    let cancelled = false;

    const fetchPaymentDetails = async () => {
      if (!token) {
        if (!cancelled) {
          setError("Invalid payment link");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await supabase.functions.invoke('get-payment-request', {
          body: { qr_token: token },
        });

        if (cancelled) return;

        if (response.error) {
          setError("Payment request not found, expired, or temporarily unavailable.");
          return;
        }

        if ((response.data as any)?.error) {
          setError((response.data as any).error);
          return;
        }

        const data = response.data as PaymentRequestDetails;
        setPaymentDetails(data);

        // Check if venue is in testing mode and fetch test wallet balance
        if (user && data.venue_id) {
          const { data: venueData } = await supabase
            .from('venues')
            .select('venue_status')
            .eq('id', data.venue_id)
            .single();
          
          if (venueData?.venue_status === 'testing') {
            setIsTestVenue(true);
            const { data: testBalance } = await (supabase as any)
              .from('test_wallet_balances')
              .select('balance_cents')
              .eq('user_id', user.id)
              .eq('venue_id', data.venue_id)
              .eq('is_active', true)
              .single();
            
            if (testBalance) {
              setTestWalletBalance(testBalance.balance_cents / 100);
            }
          }
        }

        // Fetch order items using backend function (avoids RLS issues)
        if (data.order_id) {
          try {
            const itemsResponse = await supabase.functions.invoke('get-order-items', {
              body: { order_id: data.order_id },
            });
            
            if (itemsResponse.data?.success && itemsResponse.data?.items) {
              setOrderItems(itemsResponse.data.items);
            } else {
              console.warn('[ScanToPayPage] Could not fetch order items:', itemsResponse.data?.error);
            }
          } catch (itemsError) {
            console.error('[ScanToPayPage] Error fetching order items:', itemsError);
          }
        }
      } catch {
        if (!cancelled) setError("Failed to load payment details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPaymentDetails();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Track whether items have been modified by the customer
  const [itemsModified, setItemsModified] = useState(false);

  // Calculate current total based on order items
  // Use payment request amount (includes tax) as authoritative.
  // Only recalculate when customer edits items, applying the original tax ratio.
  const calculateTotal = useCallback(() => {
    if (!paymentDetails) return 0;
    
    // If no items or items haven't been modified, use the authoritative payment request amount
    if (orderItems.length === 0 || !itemsModified) {
      return paymentDetails.amount;
    }
    
    // Items were edited: recalculate from item prices and apply original tax ratio
    const newSubtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Compute tax ratio from the original order (total / subtotal)
    const origSubtotal = paymentDetails.order_subtotal;
    const origTotal = paymentDetails.order_total;
    const taxMultiplier = (origSubtotal && origSubtotal > 0 && origTotal) 
      ? origTotal / origSubtotal 
      : 1;
    
    return newSubtotal * taxMultiplier;
  }, [orderItems, paymentDetails, itemsModified]);

  const currentAmount = calculateTotal();
  const platformFee = TRANSACTION_FEE_USD;
  const currentTotal = currentAmount + platformFee;

  // Handle quantity change
  const handleQuantityChange = (itemId: string, delta: number) => {
    setItemsModified(true);
    setOrderItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQuantity = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0)); // Remove items with 0 quantity
  };

  // Handle item deletion
  const handleDeleteItem = (itemId: string) => {
    setItemsModified(true);
    setOrderItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handlePayment = async () => {
    if (!paymentDetails) return;

    // Must be signed in to actually pay
    if (!user) {
      toast.error("Please sign in to pay");
      navigate(`/auth?redirect=${encodeURIComponent(`/app/pay/${token ?? ""}`)}`);
      return;
    }

    // Check if there are no items left
    if (orderItems.length > 0 && orderItems.every(item => item.quantity === 0)) {
      toast.error("Please add at least one item to pay");
      return;
    }

    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to pay");
        navigate(`/auth?redirect=${encodeURIComponent(`/app/pay/${token ?? ""}`)}`);
        return;
      }

      // Use simulated payment when in simulation mode
      if (SIMULATION_MODE) {
        console.log('[ScanToPayPage] SIMULATION_MODE: calling payVenue', {
          venue_id: paymentDetails.venue_id,
          amount: currentAmount,
          order_id: paymentDetails.order_id,
        });
        
        const result = await payVenue(
          paymentDetails.venue_id,
          currentAmount,
          paymentDetails.order_id,
          paymentDetails.venue_name
        );

        console.log('[ScanToPayPage] payVenue result:', result);

        if (!result.success) {
          toast.error(result.error || "Payment failed");
          return;
        }

        // Use finalize-payment backend function to handle all DB updates atomically
        console.log('[ScanToPayPage] Calling finalize-payment...');
        const finalizeResponse = await supabase.functions.invoke('finalize-payment', {
          body: {
            payment_request_id: paymentDetails.id,
            updated_items: orderItems,
            simulation_mode: true,
            scheduled_for: scheduledFor,
          },
        });

        console.log('[ScanToPayPage] finalize-payment response:', finalizeResponse);

        if (finalizeResponse.error || !finalizeResponse.data?.success) {
          const errorDetail = finalizeResponse.data?.detail || finalizeResponse.error?.message || 'Unknown error';
          console.error('[ScanToPayPage] finalize-payment failed:', errorDetail);
          toast.error(`Wallet paid, but finalize failed: ${errorDetail}`);
          // Still mark success since wallet was charged
          setSuccess(true);
          return;
        }

        setSuccess(true);
        toast.success("Payment successful!");
        fetchBalance();
        return;
      }

      // Live mode - use edge function
      const response = await supabase.functions.invoke('process-qr-payment', {
        body: {
          qr_token: token,
          verification_token: 'pin_verified',
        },
      });

      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Payment failed");
        return;
      }

      setSuccess(true);
      toast.success("Payment successful!");
      fetchBalance();
    } catch (err) {
      console.error('Payment error:', err);
      toast.error("Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">{t("wallet:actions.loading_payment")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center">
            <AlertCircle className="h-16 w-16 text-destructive" />
            <h2 className="mt-4 text-xl font-bold">{t("wallet:errors.payment_error")}</h2>
            <p className="text-muted-foreground text-center mt-2">{error}</p>
            <Button className="mt-6" onClick={() => navigate('/app/wallet')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("wallet:actions.back_to_wallet")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center">
            <div className="rounded-full bg-green-500/20 p-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-green-500">{t("wallet:success.payment_complete")}</h2>
            <p className="text-muted-foreground text-center mt-2">
              You paid {formatCurrency(jvcToLocal(currentTotal))} to {paymentDetails?.venue_name}
            </p>
            <Button className="mt-6" onClick={() => navigate('/app/venues')}>
              {t("wallet:actions.back_to_venues")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!paymentDetails) return null;

  const isSignedOut = !user;
  const displayBalance = isTestVenue && testWalletBalance !== null ? testWalletBalance : balance.jvc;
  const insufficientBalance = displayBalance < currentTotal;
  const isExpired = paymentDetails.is_expired || paymentDetails.status !== 'pending';

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t("wallet:actions.confirm_payment")}</span>
            {isExpired ? (
              <Badge variant="destructive">Expired</Badge>
            ) : (
              <Badge variant="outline" className="text-green-500 border-green-500">
                {t("common:status.active")}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Venue Info */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
            <div className="rounded-full bg-primary/20 p-3">
              <Store className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{paymentDetails.venue_name}</h3>
              {paymentDetails.venue_address && (
                <p className="text-sm text-muted-foreground">{paymentDetails.venue_address}</p>
              )}
            </div>
          </div>

          {/* Order Items with Edit Controls */}
          {orderItems.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground">{t("wallet:transactions.order_items")}</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {orderItems.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(jvcToLocal(item.price))} each
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleQuantityChange(item.id, -1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      
                      <span className="w-8 text-center font-medium">
                        {item.quantity}
                      </span>
                      
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleQuantityChange(item.id, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ETA Time Selector — only for pickup/delivery orders */}
          {(() => {
            const notes = paymentDetails.order_notes || "";
            const isPickupOrDelivery = notes.includes("PICKUP ORDER");
            if (!isPickupOrDelivery) return null;
            return (
              <ETATimeSelector
                selectedTime={scheduledFor}
                onTimeSelected={setScheduledFor}
              />
            );
          })()}
          {/* Payment Breakdown */}
          <div className="space-y-3">
            {(() => {
              const subtotal = paymentDetails.order_subtotal ?? currentAmount;
              const taxAmount = (paymentDetails.order_total && paymentDetails.order_subtotal)
                ? (itemsModified 
                    ? currentAmount - orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
                    : paymentDetails.order_total - paymentDetails.order_subtotal)
                : 0;
              const itemsSubtotal = currentAmount - taxAmount;

              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("wallet:transactions.subtotal")}</span>
                    <span>{formatCurrency(jvcToLocal(itemsSubtotal))}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("wallet:transactions.tax")}</span>
                      <span>{formatCurrency(jvcToLocal(taxAmount))}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("wallet:transactions.platform_fee")}</span>
                    <span>{formatCurrency(jvcToLocal(platformFee))}</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between text-lg font-bold">
                    <span>{t("wallet:transactions.total")}</span>
                    <span className="text-primary">{formatCurrency(jvcToLocal(currentTotal))}</span>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Balance Info */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {isTestVenue ? t("wallet:balance.test_balance") : t("wallet:balance.your_balance")}
              </span>
            </div>
            <span className={`font-bold ${insufficientBalance ? 'text-destructive' : 'text-green-500'}`}>
              {formatCurrency(jvcToLocal(displayBalance))}
            </span>
          </div>

          {insufficientBalance && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{t("wallet:errors.insufficient_balance")}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            {isSignedOut ? (
              <Button
                className="w-full"
                size="lg"
                onClick={() => navigate(`/auth?redirect=${encodeURIComponent(`/app/pay/${token ?? ""}`)}`)}
              >
                {t("auth:login.sign_in_to_pay")}
              </Button>
            ) : (
              <Button 
                className="w-full" 
                size="lg"
                onClick={handlePayment}
                disabled={processing || insufficientBalance || isExpired || (orderItems.length > 0 && currentAmount === 0)}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : isExpired ? (
                  t("wallet:errors.payment_expired")
                ) : (
                  `Pay ${formatCurrency(jvcToLocal(currentTotal))}`
                )}
              </Button>
            )}
            <Button 
              variant="outline" 
              className="w-full"
              onClick={async () => {
                // Cancel the order if it exists (set to cancelled so venue never sees it)
                if (paymentDetails?.order_id) {
                  await supabase
                    .from('orders')
                    .update({ status: 'cancelled' })
                    .eq('id', paymentDetails.order_id);
                }
                navigate('/app/venues');
              }}
            >
              {t("common:actions.cancel")}
            </Button>
          </div>

          {/* Expiry Notice */}
          {!isExpired && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expires at {new Date(paymentDetails.expires_at).toLocaleTimeString()}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

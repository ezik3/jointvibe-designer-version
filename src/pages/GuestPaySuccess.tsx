import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from 'react-i18next';

export default function GuestPaySuccess() {
  const { t } = useTranslation('common');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [venueName, setVenueName] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);

  useEffect(() => {
    if (token) {
      fetchPaymentDetails();
    }
  }, [token]);

  const fetchPaymentDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('guest_payments')
        .select(`
          amount,
          venues (name)
        `)
        .eq('claim_token', token)
        .single();

      if (data && !error) {
        setAmount(data.amount || 0);
        setVenueName((data.venues as any)?.name || 'the venue');
      }
    } catch (e) {
      console.error('Error fetching payment details:', e);
    }
  };

  // App store links - replace with actual links when available
  const appStoreUrl = 'https://apps.apple.com/app/joint-vibe';
  const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.jointvibe';

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-500/10 to-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-8 pb-6 space-y-6">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
          </div>

          {/* Thank You Message */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Payment Successful!</h1>
            <p className="text-muted-foreground">
              {amount > 0 
                ? `Your payment of $${amount.toFixed(2)} to ${venueName} has been received.`
                : `Your payment to ${venueName} has been received.`
              }
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border my-4" />

          {/* Download App CTA */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Smartphone className="h-5 w-5" />
              <span className="font-medium">Pay faster next time!</span>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Download the Joint Vibe app for instant payments, exclusive deals, 
              and rewards at your favorite venues.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                className="h-auto py-3"
                onClick={() => window.open(appStoreUrl, '_blank')}
              >
                <div className="flex flex-col items-center gap-1">
                  <Download className="h-5 w-5" />
                  <span className="text-xs">App Store</span>
                </div>
              </Button>
              <Button 
                variant="outline"
                className="h-auto py-3"
                onClick={() => window.open(playStoreUrl, '_blank')}
              >
                <div className="flex flex-col items-center gap-1">
                  <Download className="h-5 w-5" />
                  <span className="text-xs">Google Play</span>
                </div>
              </Button>
            </div>

            {token && (
              <p className="text-xs text-muted-foreground mt-2">
                Sign up with this device within 30 days to link your payment history!
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
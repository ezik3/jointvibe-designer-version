import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCityProduct, getRemainingCount, formatFoundersPrice } from '@/hooks/useFoundersPass';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Crown, Clock, Building2, Gift, Star, Shield, ArrowLeft, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { PassType } from '@/types/foundersPass';
import { useTranslation } from 'react-i18next';

const benefits = [
  { icon: Crown, label: 'Platinum City Access' },
  { icon: Clock, label: '7+ Days Pre-Launch' },
  { icon: Building2, label: 'Venue Pre-Registration' },
  { icon: Gift, label: 'Activation Rewards' },
  { icon: Star, label: 'Founder Badge' },
  { icon: Shield, label: 'Priority Support' },
];

interface FoundersCheckoutInnerProps {
  passType: PassType;
}

export function FoundersCheckoutInner({ passType }: FoundersCheckoutInnerProps) {
  const { citySlug } = useParams<{ citySlug: string }>();
  const { data: city, isLoading } = useCityProduct(citySlug || '', passType);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [showRedirectModal, setShowRedirectModal] = useState(false);

  const remaining = city ? getRemainingCount(city) : 0;
  const isSoldOut = remaining === 0;
  const routePrefix = passType === 'venue' ? '/venue/founders' : '/app/founders';
  const licenseLabel = passType === 'venue' ? 'Venue Founders License' : 'City Founders License';

  const handleCheckout = async () => {
    if (!city) return;
    setIsCreatingCheckout(true);
    setShowRedirectModal(true);

    try {
      const { data, error } = await supabase.functions.invoke('founders-create-checkout', {
        body: { citySlug: city.slug, passType },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
        setTimeout(() => {
          setShowRedirectModal(false);
          setIsCreatingCheckout(false);
          toast.success('Stripe checkout opened in a new tab');
        }, 1500);
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      setShowRedirectModal(false);
      toast.error('Failed to start checkout. Please try again.');
      setIsCreatingCheckout(false);
    }
  };

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!city) {
    return (
      <div className="py-24 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="mb-4 text-2xl font-bold text-foreground">City Not Found</h1>
        <Link to={`${routePrefix}/cities`}><Button>Browse Cities</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12">
      <Dialog open={showRedirectModal} onOpenChange={setShowRedirectModal}>
        <DialogContent className="customer-dialog-surface sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />Redirecting to Checkout
            </DialogTitle>
            <DialogDescription>Opening secure Stripe checkout in a new tab...</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <ExternalLink className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">If a new tab doesn't open, check your popup blocker.</p>
          </div>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto px-4 max-w-4xl">
        <Link to={`${routePrefix}/cities`} className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />Back to cities
        </Link>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-6">
            <div>
              <Badge variant="outline" className="mb-4">Tier {city.tier}</Badge>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                  <MapPin className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-foreground">{city.city}</h1>
                  <p className="text-muted-foreground">{city.country}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">What's Included:</h3>
              <div className="grid grid-cols-2 gap-3">
                {benefits.map(b => (
                  <div key={b.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <b.icon className="h-4 w-4 text-primary" /><span>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Availability</span>
                <span className={`font-semibold ${isSoldOut ? 'text-destructive' : remaining <= 50 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                  {isSoldOut ? 'Sold Out' : `${remaining} of ${city.total_supply} left`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className={`h-full rounded-full ${isSoldOut ? 'bg-destructive' : 'bg-emerald-500'}`} style={{ width: `${(remaining / city.total_supply) * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div>
              <h2 className="mb-2 text-xl font-semibold text-foreground">{licenseLabel}</h2>
              <p className="text-sm text-muted-foreground">{city.city}, {city.country}</p>
            </div>
            <div className="space-y-3 border-t border-b border-border py-4">
              <div className="flex items-center justify-between text-foreground"><span className="text-muted-foreground">License type</span><span>Lifetime access</span></div>
              <div className="flex items-center justify-between text-foreground"><span className="text-muted-foreground">Activation rewards</span><span>12 months per venue</span></div>
              <div className="flex items-center justify-between font-semibold text-foreground"><span>One-time price</span><span className="text-2xl text-primary">{formatFoundersPrice(city.price_cents)}</span></div>
            </div>
            <Button className="w-full" size="lg" disabled={isSoldOut || isCreatingCheckout} onClick={handleCheckout}>
              {isCreatingCheckout ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : isSoldOut ? 'Sold Out' : <><Crown className="mr-2 h-4 w-4" />Purchase License</>}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You'll receive a claim code after payment. KYC verification required.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FoundersCheckout() {
  const { t } = useTranslation('common');
  return <FoundersCheckoutInner passType="user" />;
}

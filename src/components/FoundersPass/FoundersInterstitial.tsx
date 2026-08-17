import { Crown, ArrowRight, X, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useCityProduct, getRemainingCount, formatFoundersPrice } from '@/hooks/useFoundersPass';
import type { PassType } from '@/types/foundersPass';
import { useTranslation } from 'react-i18next';

interface FoundersInterstitialProps {
  passType: PassType;
  citySlug: string;
  distanceTier?: 'metro' | 'near' | 'far';
  nearestCity?: string;
  onSkip: () => void;
  onDismiss?: () => void;
  onViewPass: (slug: string) => void;
}

export function FoundersInterstitial({
  passType,
  citySlug,
  distanceTier = 'metro',
  nearestCity = '',
  onSkip,
  onDismiss,
  onViewPass,
}: FoundersInterstitialProps) {
  const { t } = useTranslation('common');
  const { data: product, isLoading } = useCityProduct(citySlug, passType);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    onSkip();
    return null;
  }

  const remaining = getRemainingCount(product);
  if (remaining <= 0) {
    onSkip();
    return null;
  }

  const soldPct = Math.round((product.sold_count / product.total_supply) * 100);
  const label = passType === 'venue' ? 'Venue' : 'City';

  // Distance-aware subtitle
  let proximityMessage: string | null = null;
  if (distanceTier === 'near') {
    proximityMessage = `You're just outside ${nearestCity || product.city} — this pass covers your area`;
  } else if (distanceTier === 'far') {
    proximityMessage = `Your nearest city with a Founders License is ${nearestCity || product.city}`;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/15 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent/15 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Skip button (temporary — returns next login) */}
      <button
        onClick={onSkip}
        className="absolute top-6 right-6 z-20 p-2 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Skip"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Crown icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30">
              <Crown className="w-10 h-10 text-primary-foreground" />
            </div>
            <div className="absolute -inset-1 bg-gradient-to-br from-primary to-accent rounded-2xl blur opacity-40 animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {label} Founders License
          </h1>
          <p className="text-lg text-primary font-semibold">{product.city}, {product.country}</p>
          {proximityMessage && (
            <p className="text-sm text-muted-foreground mt-2">{proximityMessage}</p>
          )}
        </div>

        {/* Scarcity card */}
        <div className="rounded-2xl border border-primary/30 bg-card p-6 space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-muted-foreground">Remaining</span>
            <span className="text-2xl font-bold text-foreground">
              {remaining.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">/ {product.total_supply.toLocaleString()}</span>
            </span>
          </div>

          <Progress value={soldPct} className="h-3" />

          <p className="text-xs text-muted-foreground text-center">
            {soldPct}% claimed — limited to {product.total_supply.toLocaleString()} per city
          </p>

          <div className="text-center pt-2 border-t border-border/50">
            <span className="text-sm text-muted-foreground">One-time price</span>
            <p className="text-3xl font-bold text-foreground mt-1">
              {formatFoundersPrice(product.price_cents)}
            </p>
          </div>
        </div>

        {/* Highlights */}
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Crown className="w-4 h-4 text-primary" /> Lifetime Platinum status</li>
          <li className="flex items-center gap-2"><Crown className="w-4 h-4 text-primary" /> Activation rewards for 12 months</li>
          <li className="flex items-center gap-2"><Crown className="w-4 h-4 text-primary" /> Exclusive Founder badge</li>
        </ul>

        {/* CTA */}
        <Button
          onClick={() => onViewPass(citySlug)}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground font-semibold group"
        >
          Learn More
          <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>

        <button
          onClick={onSkip}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          Skip for now →
        </button>

        {/* Don't show again — permanent dismissal */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
          >
            <EyeOff className="w-3.5 h-3.5" />
            Don't show this again
          </button>
        )}
      </div>
    </div>
  );
}

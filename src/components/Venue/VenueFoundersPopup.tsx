import { useNavigate } from 'react-router-dom';
import { Crown, Flame, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useCityProduct, getRemainingCount, getScarcityLevel, formatFoundersPrice } from '@/hooks/useFoundersPass';
import { useTranslation } from 'react-i18next';

interface VenueFoundersPopupProps {
  open: boolean;
  onClose: () => void;
  onDismiss: () => void;
  citySlug: string;
}

export default function VenueFoundersPopup({ open, onClose, onDismiss, citySlug }: VenueFoundersPopupProps) {
  const { t } = useTranslation('venue');
  const navigate = useNavigate();
  const { data: product, isLoading } = useCityProduct(citySlug, 'venue');

  if (!product || isLoading) return null;

  const remaining = getRemainingCount(product);
  const scarcity = getScarcityLevel(remaining, product.total_supply);
  const soldPct = ((product.sold_count / product.total_supply) * 100);

  const scarcityColor = scarcity === 'low'
    ? 'text-red-400'
    : scarcity === 'medium'
      ? 'text-amber-400'
      : 'text-emerald-400';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="venue-dialog-surface sm:max-w-md">
        <DialogHeader className="text-center space-y-3">
          <div className="venue-dialog-icon--gold mx-auto w-14 h-14 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Crown className="w-7 h-7 text-white" />
          </div>
          <DialogTitle className="text-xl font-bold text-white">
            Become a City Founder
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Secure lifetime Platinum status for your venue in{' '}
            <span className="text-amber-400 font-semibold">{product.city}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Benefits */}
          <div className="space-y-2.5">
            {[
              { icon: Shield, text: 'Permanent Platinum tier — no score needed' },
              { icon: Flame, text: '60% activation rewards for 12 months' },
              { icon: Crown, text: 'Founder badge on your venue profile' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-zinc-300">
                <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Scarcity */}
          <div className="space-y-2 bg-[#171d23] rounded-lg p-4 border border-[#2a323a]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Remaining</span>
              <span className={`font-bold ${scarcityColor}`}>
                {remaining} of {product.total_supply}
              </span>
            </div>
            <Progress value={soldPct} className="h-2 bg-zinc-700" />
            <p className="text-xs text-zinc-500 text-center">
              {scarcity === 'low' ? 'Almost sold out!' : scarcity === 'medium' ? 'Selling fast' : 'Available now'}
            </p>
          </div>

          {/* Price */}
          <div className="text-center">
            <span className="text-3xl font-bold text-white">{formatFoundersPrice(product.price_cents)}</span>
            <span className="text-sm text-zinc-400 ml-2">one-time</span>
          </div>

          {/* CTAs */}
          <div className="space-y-3">
            <Button
              className="venue-dialog-primary-action w-full h-12 text-base font-semibold"
              onClick={() => {
                onClose();
                navigate(`/venue/founders/checkout/${citySlug}`);
              }}
            >
              Learn More
            </Button>
            <Button
              variant="ghost"
              className="w-full text-zinc-400 hover:text-zinc-300"
              onClick={onClose}
            >
              Not Now
            </Button>
          </div>

          {/* Dismiss forever */}
          <button
            className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            onClick={onDismiss}
          >
            Don't show this again
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

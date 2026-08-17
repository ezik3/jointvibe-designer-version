import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tag, Gift, MoreHorizontal, Clock, Flag } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type ActiveDeal } from '@/hooks/useActiveDeals';
import DealRedemptionModal from './DealRedemptionModal';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface DealCardProps {
  deal: ActiveDeal;
  variant?: 'full' | 'compact';
  onRedeem: (() => Promise<string>) | ((dealId: string, venueId: string) => Promise<string>);
  onImpression?: (() => void) | ((dealId: string, venueId: string) => void);
  onSnooze?: ((dealId: string, venueId: string) => void);
}

const DealCard = ({ deal, variant = 'full', onRedeem, onImpression, onSnooze }: DealCardProps) => {
  const { t } = useTranslation('common');
  const [redemptionCode, setRedemptionCode] = useState<string | null>(null);
  const [showRedemption, setShowRedemption] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const handleRedeem = async () => {
    setRedeeming(true);
    try {
      const code = await onRedeem(deal.id, deal.venue_id);
      setRedemptionCode(code);
      setShowRedemption(true);
    } catch (err) {
      console.error('Redemption failed:', err);
    } finally {
      setRedeeming(false);
    }
  };

  const handleSnooze = () => {
    onSnooze?.(deal.id, deal.venue_id);
    toast.success("Deal hidden for 24 hours", { icon: "🕐" });
  };

  const handleReport = () => {
    toast.info("Thanks for reporting. We'll review this deal.", { icon: "🚩" });
  };

  const menuButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-1 rounded-md hover:bg-white/10 transition-colors">
          <MoreHorizontal className="w-4 h-4 text-white/50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10">
        <DropdownMenuItem onClick={handleSnooze} className="text-zinc-300 hover:text-white cursor-pointer">
          <Clock className="w-4 h-4 mr-2" /> Not interested right now
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleReport} className="text-zinc-300 hover:text-white cursor-pointer">
          <Flag className="w-4 h-4 mr-2" /> Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (variant === 'compact') {
    return (
      <>
        <div className="p-3 bg-white/5 rounded-xl border border-white/10 hover:border-cyan-500/30 transition-colors">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Tag className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{deal.venue_name}</p>
              <p className="text-cyan-400 text-xs font-medium">{deal.discount_text}</p>
              <p className="text-white/50 text-[10px] truncate">{deal.headline}</p>
            </div>
            {menuButton}
          </div>
          <Button size="sm" className="w-full mt-2 h-7 text-xs bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30" onClick={handleRedeem} disabled={redeeming}>
            <Gift className="w-3 h-3 mr-1" /> Redeem
          </Button>
        </div>
        <DealRedemptionModal open={showRedemption} onClose={() => setShowRedemption(false)} code={redemptionCode || ''} venueName={deal.venue_name} dealHeadline={deal.headline} />
      </>
    );
  }

  return (
    <>
      <div className="relative bg-white/5 rounded-2xl overflow-hidden border border-white/10 hover:border-cyan-500/30 transition-colors">
        {/* Deal Badge + Menu */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
          <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0 text-xs">
            <Tag className="w-3 h-3 mr-1" /> Deal
          </Badge>
          {menuButton}
        </div>

        {/* Media */}
        {deal.media_url && (
          <img src={deal.media_url} alt={deal.headline} className="w-full h-40 object-cover" />
        )}

        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            {deal.venue_image && (
              <img src={deal.venue_image} alt="" className="w-8 h-8 rounded-full object-cover" />
            )}
            <span className="text-white/70 text-sm font-medium">{deal.venue_name}</span>
          </div>
          <h4 className="text-white font-semibold">{deal.headline}</h4>
          <p className="text-cyan-400 font-bold text-lg mt-1">{deal.discount_text}</p>
          {deal.description && <p className="text-white/50 text-sm mt-1">{deal.description}</p>}
          
          <Button className="w-full mt-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white" onClick={handleRedeem} disabled={redeeming}>
            <Gift className="w-4 h-4 mr-2" /> {redeeming ? 'Redeeming...' : 'Redeem Deal'}
          </Button>
        </div>
      </div>
      <DealRedemptionModal open={showRedemption} onClose={() => setShowRedemption(false)} code={redemptionCode || ''} venueName={deal.venue_name} dealHeadline={deal.headline} />
    </>
  );
};

export default DealCard;

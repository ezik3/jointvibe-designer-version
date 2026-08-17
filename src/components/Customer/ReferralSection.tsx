import { Gift, ChevronRight } from 'lucide-react';
import { useUserReferrals } from '@/hooks/useUserReferrals';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const ReferralSection = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { stats, loading } = useUserReferrals();

  const totalEarned = (stats.totalEarnedCents / 100).toFixed(2);

  if (loading) {
    return (
      <div className="h-10 bg-white/5 rounded-full animate-pulse" />
    );
  }

  return (
    <button
      onClick={() => navigate('/app/referrals')}
      className="flex items-center justify-between w-full px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:from-amber-500/15 hover:to-orange-500/15 transition-all group"
    >
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-amber-400" />
        <span className="text-sm text-white/70">
          <span className="text-emerald-400 font-semibold">${totalEarned}</span> earned
        </span>
      </div>
      <div className="flex items-center gap-1 text-xs text-amber-400 group-hover:text-amber-300 transition-colors">
        View Referral Dashboard
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
};

export default ReferralSection;

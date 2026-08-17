import { Gift, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUserReferrals } from '@/hooks/useUserReferrals';
import { useCurrency } from '@/hooks/useCurrency';
import { useTranslation } from 'react-i18next';

export const ReferralCredits = () => {
  const { t } = useTranslation('wallet');
  const navigate = useNavigate();
  const { stats, loading } = useUserReferrals();
  const { formatCurrency, jvcToLocal } = useCurrency();

  if (loading) {
    return (
      <button className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 animate-pulse">
        <div className="h-16 bg-white/5 rounded" />
      </button>
    );
  }

  const totalEarned = (stats.totalEarnedCents / 100).toFixed(2);
  const pendingAmount = (stats.pendingCents / 100).toFixed(2);

  return (
    <button
      onClick={() => navigate('/app/referrals')}
      className="w-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 hover:from-amber-500/15 hover:to-orange-500/15 border border-amber-500/20 rounded-xl p-4 flex items-center gap-4 transition-colors text-left group"
    >
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
        <Gift className="w-6 h-6 text-amber-400" />
      </div>
      <div className="flex-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">Referral Credits</span>
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-bold text-white">{formatCurrency(jvcToLocal(stats.totalEarnedCents / 100))}</p>
          <span className="text-sm font-normal text-zinc-500">earned</span>
        </div>
        {stats.pendingCents > 0 && (
          <span className="text-xs text-amber-400">{formatCurrency(jvcToLocal(stats.pendingCents / 100))} pending</span>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-amber-400 transition-colors" />
    </button>
  );
};

export default ReferralCredits;

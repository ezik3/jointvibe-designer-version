import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Gift, Copy, Check, ArrowLeft, Users, Clock, 
  CheckCircle, XCircle, DollarSign, TrendingUp,
  Share2, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useReferralCode } from '@/hooks/useReferralCode';
import { useUserReferrals } from '@/hooks/useUserReferrals';
import { toast } from 'sonner';
import Web3FeedHeader from '@/components/Customer/Feed/Web3FeedHeader';
import { useHideBodyScrollbar } from '@/hooks/useHideBodyScrollbar';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useMobileNavVisibility } from '@/contexts/MobileNavVisibilityContext';
import './referral-dashboard.css';

export default function ReferralDashboard() {
  const { t } = useTranslation('common');
  const { setMobileNavsVisible } = useMobileNavVisibility();
  useHideBodyScrollbar(true);
  
  const navigate = useNavigate();
  const { referralCode, copyReferralLink, getReferralLink, loading: codeLoading } = useReferralCode();
  const { referrals, rewards, stats, loading: statsLoading } = useUserReferrals();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMobileNavsVisible(false);
    return () => setMobileNavsVisible(true);
  }, [setMobileNavsVisible]);

  const handleCopy = async () => {
    const success = await copyReferralLink();
    if (success) {
      setCopied(true);
      toast.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    const link = getReferralLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Joint Vibe',
          text: 'Check out Joint Vibe - the best platform for venues and nightlife!',
          url: link,
        });
      } catch (error) {
        // User cancelled or error
      }
    } else {
      handleCopy();
    }
  };

  const totalEarned = (stats.totalEarnedCents / 100).toFixed(2);
  const pendingAmount = (stats.pendingCents / 100).toFixed(2);

  const loading = codeLoading || statsLoading;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'qualified':
        return <CheckCircle className="w-4 h-4 text-cyan-400" />;
      case 'rewarded':
        return <DollarSign className="w-4 h-4 text-emerald-400" />;
      case 'expired':
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'qualified':
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      case 'rewarded':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'expired':
      case 'rejected':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
    }
  };

  return (
    <div className="customer-referral-page">
      <Web3FeedHeader />
      
      <div className="customer-referral-page__content">
        {/* Back button */}
        <button 
          onClick={() => navigate(-1)}
          className="customer-referral-page__back"
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </button>

        {/* Header */}
        <div className="customer-referral-page__header">
            <div className="customer-referral-page__header-icon">
              <Gift aria-hidden="true" />
            </div>
            <div>
              <h1>Referral rewards</h1>
              <p>Invite venue owners and earn JointVibe credits.</p>
            </div>
        </div>

        {loading ? (
          <div className="customer-referral-page__loading">
            {[1, 2, 3].map(i => (
              <Card key={i} className="customer-referral-page__card customer-referral-page__metric-card animate-pulse">
                <div className="h-20 bg-white/5 rounded" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="customer-referral-page__stack">
            {/* Stats Grid */}
            <div className="customer-referral-page__stats">
              <Card className="customer-referral-page__card customer-referral-page__metric-card">
                <div className="customer-referral-page__metric-label">
                  <DollarSign aria-hidden="true" />
                  <span>Total earned</span>
                </div>
                <p className="customer-referral-page__metric-value">${totalEarned}</p>
                {stats.residualPayments > 0 && (
                  <p className="customer-referral-page__metric-note">
                    incl. ${(stats.totalResidualCents / 100).toFixed(2)} residuals
                  </p>
                )}
              </Card>
              
              <Card className="customer-referral-page__card customer-referral-page__metric-card">
                <div className="customer-referral-page__metric-label">
                  <TrendingUp aria-hidden="true" />
                  <span>Pending</span>
                </div>
                <p className="customer-referral-page__metric-value customer-referral-page__metric-value--pending">${pendingAmount}</p>
              </Card>
            </div>

            {/* Monthly Residuals Card */}
            {stats.residualPayments > 0 && (
              <Card className="customer-referral-page__card customer-referral-page__metric-card">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="customer-referral-page__metric-label">
                      <TrendingUp aria-hidden="true" />
                      <span>Monthly residuals</span>
                    </div>
                    <p className="customer-referral-page__metric-value">
                      ${(stats.totalResidualCents / 100).toFixed(2)}
                    </p>
                    <p className="customer-referral-page__metric-note">
                      {stats.residualPayments} payment{stats.residualPayments !== 1 ? 's' : ''} • $2/month per active venue
                    </p>
                  </div>
                  <div className="text-right customer-referral-page__metric-note">
                    <p>Max 12 months</p>
                    <p>or $50 per venue</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Status Breakdown */}
            <Card className="customer-referral-page__card customer-referral-page__status-card">
              <h3 className="customer-referral-page__section-title">Referral status</h3>
              <div className="customer-referral-page__status-grid">
                {[
                  { label: 'Pending', count: stats.pending, className: '' },
                  { label: 'Qualified', count: stats.qualified, className: '' },
                  { label: 'Rewarded', count: stats.rewarded, className: ' customer-referral-page__status-item--rewarded' },
                  { label: 'Expired', count: stats.expired, className: ' customer-referral-page__status-item--expired' },
                ].map((item, index) => (
                  <div key={index} className={`customer-referral-page__status-item${item.className}`}>
                    <strong>{item.count}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Referral Link */}
            {referralCode && (
              <Card className="customer-referral-page__card customer-referral-page__link-card">
                <h3 className="customer-referral-page__section-title">Your referral link</h3>
                <div className="customer-referral-page__link-row">
                  <div className="customer-referral-page__link-value">
                    {getReferralLink()}
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                    className="customer-referral-page__icon-button"
                  >
                    {copied ? <Check className="text-cyan-400" /> : <Copy />}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleShare}
                    className="customer-referral-page__icon-button"
                  >
                    <Share2 />
                  </Button>
                </div>
                <p className="customer-referral-page__code">
                  Your code: <strong>{referralCode.code}</strong>
                </p>
              </Card>
            )}

            {/* Referral History */}
            <section>
              <h3 className="customer-referral-page__section-title">
                <Users aria-hidden="true" />
                Referral history
              </h3>
              
              {referrals.length === 0 ? (
                <Card className="customer-referral-page__card customer-referral-page__empty">
                  <span><Users aria-hidden="true" /></span>
                  <p>No referrals yet</p>
                  <small>Share your link to start earning.</small>
                </Card>
              ) : (
                <div className="customer-referral-page__stack">
                  {referrals.map((referral) => (
                    <motion.div
                      key={referral.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="customer-referral-page__card customer-referral-page__history-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(referral.status)}
                            <div>
                              <p className="text-sm text-white">
                                Venue referral
                              </p>
                              <p className="text-xs text-zinc-500">
                                {format(new Date(referral.created_at), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(referral.status)}`}>
                            {referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
                          </span>
                        </div>
                        
                        {referral.status === 'pending' && (
                          <p className="text-xs text-zinc-500 mt-2">
                            Expires: {format(new Date(referral.expires_at), 'MMM d, yyyy')}
                          </p>
                        )}
                        
                        {referral.status === 'rewarded' && referral.rewarded_at && (
                          <p className="text-xs text-emerald-400 mt-2">
                            Rewarded: {format(new Date(referral.rewarded_at), 'MMM d, yyyy')} • +$25.00
                          </p>
                        )}
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            {/* How it works */}
            <Card className="customer-referral-page__card customer-referral-page__how-card">
              <h3 className="customer-referral-page__section-title">How it works</h3>
              <div className="customer-referral-page__steps">
                {[
                  { step: 1, title: 'Share Your Link', desc: 'Send your referral link to venue owners' },
                  { step: 2, title: 'They Sign Up', desc: 'Venue registers and gets approved' },
                  { step: 3, title: 'Activity Threshold', desc: 'Venue processes 10+ transactions or $200' },
                  { step: 4, title: 'Get $25!', desc: 'Receive $25 in JV Credits automatically' },
                  { step: 5, title: '+$2/Month', desc: 'Earn $2 each month the venue stays active (max 12 months)' },
                ].map((item) => (
                  <div key={item.step} className="customer-referral-page__step">
                    <div className="customer-referral-page__step-number">
                      {item.step}
                    </div>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

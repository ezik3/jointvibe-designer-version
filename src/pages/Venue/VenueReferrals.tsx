import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Gift, Copy, Check, Users, Clock, 
  CheckCircle, DollarSign, TrendingUp,
  Share2, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface VenueReferralCode {
  id: string;
  code: string;
  is_active: boolean;
}

interface Referral {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  rewarded_at: string | null;
}

interface Stats {
  pending: number;
  qualified: number;
  rewarded: number;
  totalEarnedCents: number;
}

export default function VenueReferrals() {
  const { t } = useTranslation('venue');
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<VenueReferralCode | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    qualified: 0,
    rewarded: 0,
    totalEarnedCents: 0
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);

  const generateReferralCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'JV-';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const fetchVenueData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Get venue for this user
      const { data: venue, error: venueError } = await supabase
        .from('venues')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (venueError || !venue) {
        console.error('Error fetching venue:', venueError);
        setLoading(false);
        return;
      }

      setVenueId(venue.id);

      // Get venue's referral code
      const { data: codeData, error: codeError } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('owner_type', 'venue')
        .eq('owner_id', venue.id)
        .maybeSingle();

      if (!codeError && codeData) {
        setReferralCode(codeData as VenueReferralCode);
      } else if (!codeData) {
        // Auto-create referral code for venues that don't have one
        const newCode = generateReferralCode();
        const { data: newCodeData, error: createError } = await supabase
          .from('referral_codes')
          .insert({
            code: newCode,
            owner_type: 'venue',
            owner_id: venue.id,
            is_active: true
          })
          .select()
          .single();

        if (!createError && newCodeData) {
          setReferralCode(newCodeData as VenueReferralCode);
        }
      }

      // Get referrals made by this venue
      const { data: referralsData, error: referralsError } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_type', 'venue')
        .eq('referrer_id', venue.id)
        .order('created_at', { ascending: false });

      if (!referralsError) {
        setReferrals((referralsData || []) as Referral[]);

        // Calculate stats
        const refs = (referralsData || []) as Referral[];
        setStats({
          pending: refs.filter(r => r.status === 'pending').length,
          qualified: refs.filter(r => r.status === 'qualified').length,
          rewarded: refs.filter(r => r.status === 'rewarded').length,
          totalEarnedCents: refs.filter(r => r.status === 'rewarded').length * 3000 // $30 per venue-to-venue
        });
      }

    } catch (error) {
      console.error('Error fetching venue data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchVenueData();
  }, [fetchVenueData]);

  const getReferralLink = () => {
    if (!referralCode) return '';
    return `https://www.jointvibe.app/?ref=${referralCode.code}`;
  };

  const handleCopy = async () => {
    const link = getReferralLink();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    const link = getReferralLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Joint Vibe',
          text: 'Join me on Joint Vibe - the best platform for venues!',
          url: link,
        });
      } catch (error) {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  };

  const totalEarned = (stats.totalEarnedCents / 100).toFixed(2);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <Gift className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Venue Referrals</h1>
            <p className="text-muted-foreground text-sm">Earn $30 for every venue you refer!</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={fetchVenueData}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-20 bg-muted rounded" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20 p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Total Earned</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">${totalEarned}</p>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
              <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-muted-foreground">Qualified</span>
              </div>
              <p className="text-2xl font-bold text-cyan-400">{stats.qualified}</p>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Rewarded</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{stats.rewarded}</p>
            </Card>
          </div>

          {/* Referral Link */}
          {referralCode && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Your Venue Referral Link</h3>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground truncate font-mono">
                  {getReferralLink()}
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleShare}
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Your code: <span className="text-amber-400 font-mono font-medium">{referralCode.code}</span>
              </p>
            </Card>
          )}

          {/* Referral History */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              Referral History
            </h3>
            
            {referrals.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No referrals yet</p>
                <p className="text-sm text-muted-foreground mt-1">Share your link to start earning!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {referrals.map((referral) => (
                  <motion.div
                    key={referral.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {referral.status === 'pending' && <Clock className="w-4 h-4 text-amber-400" />}
                      {referral.status === 'qualified' && <CheckCircle className="w-4 h-4 text-cyan-400" />}
                      {referral.status === 'rewarded' && <DollarSign className="w-4 h-4 text-emerald-400" />}
                      <div>
                        <p className="text-sm text-foreground">Venue Referral</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(referral.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        referral.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                        referral.status === 'qualified' ? 'bg-cyan-500/10 text-cyan-400' :
                        referral.status === 'rewarded' ? 'bg-emerald-500/10 text-emerald-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
                      </span>
                      {referral.status === 'rewarded' && (
                        <p className="text-xs text-emerald-400 mt-1">+$30.00</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

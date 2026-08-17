import { useState, useEffect, useCallback } from 'react';
import "./admin-dialogs.css";
import { motion } from 'framer-motion';
import { 
  Gift, Search, Filter, CheckCircle, XCircle, Clock, 
  DollarSign, Users, RefreshCw, ChevronDown, Play, Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { recordTierEvent } from '@/hooks/useUserTier';
import { useTranslation } from 'react-i18next';

interface Referral {
  id: string;
  referrer_type: string;
  referrer_id: string;
  referred_venue_id: string | null;
  status: string;
  qualified_at: string | null;
  rewarded_at: string | null;
  expires_at: string;
  created_at: string;
  referral_code?: {
    code: string;
  };
  venue?: {
    name: string;
    approval_status: string;
  };
}

interface Stats {
  total: number;
  pending: number;
  qualified: number;
  rewarded: number;
  expired: number;
  totalRewardsCents: number;
  totalResidualsCents: number;
  residualPayments: number;
}

export default function AdminReferrals() {
  const { t } = useTranslation('admin');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    qualified: 0,
    rewarded: 0,
    expired: 0,
    totalRewardsCents: 0,
    totalResidualsCents: 0,
    residualPayments: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('referrals')
        .select(`
          *,
          referral_code:referral_codes(code)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch venue names for referred venues
      const venueIds = (data || [])
        .filter(r => r.referred_venue_id)
        .map(r => r.referred_venue_id);
      
      let venueMap: Record<string, { name: string; approval_status: string }> = {};
      if (venueIds.length > 0) {
        const { data: venues } = await supabase
          .from('venues')
          .select('id, name, approval_status')
          .in('id', venueIds);
        
        venueMap = (venues || []).reduce((acc, v) => {
          acc[v.id] = { name: v.name, approval_status: v.approval_status };
          return acc;
        }, {} as Record<string, { name: string; approval_status: string }>);
      }

      const enrichedData = (data || []).map(r => ({
        ...r,
        venue: r.referred_venue_id ? venueMap[r.referred_venue_id] : undefined
      }));

      setReferrals(enrichedData);

      // Fetch all rewards for stats
      const { data: allRewards } = await supabase
        .from('referral_rewards')
        .select('amount_cents, reward_type, status');
      
      const issuedRewards = (allRewards || []).filter(r => r.status === 'issued');
      const oneTimeRewards = issuedRewards.filter(r => r.reward_type === 'one_time_credit');
      const residualRewards = issuedRewards.filter(r => r.reward_type === 'monthly_residual');

      // Calculate stats
      const allRefs = enrichedData;
      setStats({
        total: allRefs.length,
        pending: allRefs.filter(r => r.status === 'pending').length,
        qualified: allRefs.filter(r => r.status === 'qualified').length,
        rewarded: allRefs.filter(r => r.status === 'rewarded').length,
        expired: allRefs.filter(r => r.status === 'expired').length,
        totalRewardsCents: oneTimeRewards.reduce((sum, r) => sum + r.amount_cents, 0),
        totalResidualsCents: residualRewards.reduce((sum, r) => sum + r.amount_cents, 0),
        residualPayments: residualRewards.length
      });

    } catch (error) {
      console.error('Error fetching referrals:', error);
      toast.error('Failed to load referrals');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  const handleForceQualify = async (referralId: string) => {
    setProcessing(referralId);
    try {
      // Update referral status
      const { error } = await supabase
        .from('referrals')
        .update({ 
          status: 'qualified',
          qualified_at: new Date().toISOString()
        })
        .eq('id', referralId);

      if (error) throw error;

      toast.success('Referral marked as qualified');
      fetchReferrals();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to update referral');
    } finally {
      setProcessing(null);
    }
  };

  const handleIssueReward = async (referral: Referral) => {
    setProcessing(referral.id);
    try {
      // Create reward record
      const { error: rewardError } = await supabase
        .from('referral_rewards')
        .insert({
          referral_id: referral.id,
          reward_type: 'one_time_credit',
          amount_cents: 2500, // $25
          status: 'issued',
          issued_to_type: referral.referrer_type,
          issued_to_id: referral.referrer_id,
          issued_at: new Date().toISOString()
        });

      if (rewardError) throw rewardError;

      // Update referral status
      const { error: updateError } = await supabase
        .from('referrals')
        .update({ 
          status: 'rewarded',
          rewarded_at: new Date().toISOString()
        })
        .eq('id', referral.id);

      if (updateError) throw updateError;

      // Credit the wallet - fetch current balance first, then update
      if (referral.referrer_type === 'user') {
        const { data: wallet } = await supabase
          .from('user_wallets')
          .select('balance_jv_token')
          .eq('user_id', referral.referrer_id)
          .maybeSingle();
        
        if (wallet) {
          await supabase
            .from('user_wallets')
            .update({ 
              balance_jv_token: (wallet.balance_jv_token || 0) + 25
            })
            .eq('user_id', referral.referrer_id);
        }
      }

      // Tier event for referral reward
      if (referral.referrer_type === 'user') {
        const actionType = referral.referred_venue_id ? "refer_venue" : "refer_user";
        recordTierEvent(referral.referrer_id, actionType, { referral_id: referral.id });
      }

      toast.success('Reward issued successfully!');
      fetchReferrals();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to issue reward');
    } finally {
      setProcessing(null);
    }
  };

  const handleVoidReferral = async (referralId: string) => {
    setProcessing(referralId);
    try {
      const { error } = await supabase
        .from('referrals')
        .update({ status: 'rejected' })
        .eq('id', referralId);

      if (error) throw error;

      toast.success('Referral voided');
      fetchReferrals();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to void referral');
    } finally {
      setProcessing(null);
    }
  };

  const handleRunMonthlyResiduals = async () => {
    toast.info('Monthly residual processing coming soon!');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'qualified':
        return <CheckCircle className="w-4 h-4 text-cyan-400" />;
      case 'rewarded':
        return <DollarSign className="w-4 h-4 text-emerald-400" />;
      default:
        return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  const filteredReferrals = referrals.filter(r => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      r.referral_code?.code?.toLowerCase().includes(query) ||
      r.venue?.name?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <Gift className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Referral Management</h1>
            <p className="text-muted-foreground text-sm">Manage referrals and issue rewards</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchReferrals}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={handleRunMonthlyResiduals}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90"
          >
            <Play className="w-4 h-4 mr-2" />
            Run Residuals
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
          { label: 'Qualified', value: stats.qualified, color: 'text-cyan-400' },
          { label: 'Rewarded', value: stats.rewarded, color: 'text-emerald-400' },
          { label: 'One-Time Paid', value: `$${(stats.totalRewardsCents / 100).toFixed(2)}`, color: 'text-emerald-400' },
          { label: 'Residuals Paid', value: `$${(stats.totalResidualsCents / 100).toFixed(2)}`, color: 'text-purple-400' },
        ].map((stat, i) => (
          <Card key={i} className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by code or venue name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              {statusFilter === 'all' ? 'All Status' : statusFilter}
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="admin-menu-popover">
            <DropdownMenuItem onClick={() => setStatusFilter('all')}>All Status</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('pending')}>Pending</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('qualified')}>Qualified</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('rewarded')}>Rewarded</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('expired')}>Expired</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('rejected')}>Rejected</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Referrals Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Referrer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Venue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Expires</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : filteredReferrals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No referrals found
                  </td>
                </tr>
              ) : (
                filteredReferrals.map((referral) => (
                  <motion.tr
                    key={referral.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-amber-400">
                        {referral.referral_code?.code || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground capitalize">
                        {referral.referrer_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">
                        {referral.venue?.name || 'Not yet created'}
                      </span>
                      {referral.venue && (
                        <span className={`ml-2 text-xs ${
                          referral.venue.approval_status === 'approved' 
                            ? 'text-emerald-400' 
                            : 'text-amber-400'
                        }`}>
                          ({referral.venue.approval_status})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(referral.status)}
                        <span className="text-sm capitalize">{referral.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {format(new Date(referral.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {format(new Date(referral.expires_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {referral.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleForceQualify(referral.id)}
                              disabled={processing === referral.id}
                            >
                              Force Qualify
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => handleVoidReferral(referral.id)}
                              disabled={processing === referral.id}
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {referral.status === 'qualified' && (
                          <Button
                            size="sm"
                            className="bg-emerald-500 hover:bg-emerald-600"
                            onClick={() => handleIssueReward(referral)}
                            disabled={processing === referral.id}
                          >
                            <DollarSign className="w-4 h-4 mr-1" />
                            Issue $25
                          </Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

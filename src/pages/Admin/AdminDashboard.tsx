import { useEffect, useState } from "react";
import { Users, Store, Coins, TrendingUp, Gift, Flag, RefreshCw } from "lucide-react";
import { StatCard } from "@/components/Admin/dashboard/StatCard";
import { RecentActivity } from "@/components/Admin/dashboard/RecentActivity";
import { RecentRegistrations } from "@/components/Admin/dashboard/RecentRegistrations";
import { TreasuryOverview } from "@/components/Admin/dashboard/TreasuryOverview";
import TierDistributionCard from "@/components/Admin/dashboard/TierDistributionCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useTranslation } from 'react-i18next';

interface Stats {
  totalUsers: number;
  totalVenues: number;
  activeVenues: number;
  pendingVenues: number;
  totalJVCSupply: number;
  totalUSDBackling: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  todayTransactions: number;
  frozenWallets: number;
  collectedFees: number;
}

export default function AdminDashboard() {
  const { t } = useTranslation('admin');
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalVenues: 0,
    activeVenues: 0,
    pendingVenues: 0,
    totalJVCSupply: 0,
    totalUSDBackling: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    todayTransactions: 0,
    frozenWallets: 0,
    collectedFees: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetchDashboardData();

    const venuesChannel = supabase
      .channel(createRealtimeChannelTopic("admin-dashboard-venues"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "venues" },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    const auditChannel = supabase
      .channel(createRealtimeChannelTopic("admin-dashboard-audit"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_audit_log" },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(venuesChannel);
      supabase.removeChannel(auditChannel);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch treasury data
      const { data: treasury } = await supabase
        .from("platform_treasury")
        .select("*")
        .limit(1)
        .maybeSingle();

      // Fetch user count from customer_profiles (actual registered users)
      const { count: customerProfileCount } = await supabase
        .from("customer_profiles")
        .select("*", { count: "exact", head: true });

      // Also count user_wallets as backup
      const { count: userWalletCount } = await supabase
        .from("user_wallets")
        .select("*", { count: "exact", head: true });

      // Use the higher count (some users may have profiles but not wallets yet)
      const userCount = Math.max(customerProfileCount || 0, userWalletCount || 0);

      // Fetch total venues
      const { count: totalVenueCount } = await supabase
        .from("venues")
        .select("*", { count: "exact", head: true });

      // Fetch active (approved) venues
      const { count: activeVenueCount } = await supabase
        .from("venues")
        .select("*", { count: "exact", head: true })
        .eq("approval_status", "approved");

      // Fetch pending venues
      const { count: pendingVenueCount } = await supabase
        .from("venues")
        .select("*", { count: "exact", head: true })
        .eq("approval_status", "pending");

      // Fetch pending deposits
      const { count: pendingDepositCount } = await supabase
        .from("deposit_records")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      // Fetch pending withdrawals
      const { count: pendingWithdrawalCount } = await supabase
        .from("withdrawal_records")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      // Fetch frozen wallets
      const { count: frozenCount } = await supabase
        .from("wallet_freezes")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Fetch today's transactions
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todayTxCount } = await supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      setStats({
        totalUsers: userCount,
        totalVenues: totalVenueCount || 0,
        activeVenues: activeVenueCount || 0,
        pendingVenues: pendingVenueCount || 0,
        totalJVCSupply: treasury?.total_jvc_supply || 0,
        totalUSDBackling: treasury?.total_usd_backing || 0,
        pendingDeposits: pendingDepositCount || 0,
        pendingWithdrawals: pendingWithdrawalCount || 0,
        todayTransactions: todayTxCount || 0,
        frozenWallets: frozenCount || 0,
        collectedFees: treasury?.collected_fees || 0
      });
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  const statCards = [
    {
      title: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      change: "Registered users with wallets",
      changeType: "neutral" as const,
      icon: Users,
    },
    {
      title: "Active Venues",
      value: stats.activeVenues.toLocaleString(),
      change: `${stats.totalVenues} total registered`,
      changeType: "neutral" as const,
      icon: Store,
    },
    {
      title: "JVC in Circulation",
      value: stats.totalJVCSupply > 1000000 
        ? `$${(stats.totalJVCSupply / 1000000).toFixed(2)}M` 
        : `$${stats.totalJVCSupply.toLocaleString()}`,
      change: `+${stats.todayTransactions} transactions today`,
      changeType: "positive" as const,
      icon: Coins,
    },
    {
      title: "Platform Revenue",
      value: `$${stats.collectedFees.toLocaleString()}`,
      change: "Collected platform fees",
      changeType: "positive" as const,
      icon: TrendingUp,
    },
    {
      title: "Pending Operations",
      value: (stats.pendingDeposits + stats.pendingWithdrawals).toString(),
      change: `${stats.pendingDeposits} deposits, ${stats.pendingWithdrawals} withdrawals`,
      changeType: (stats.pendingDeposits + stats.pendingWithdrawals) > 0 ? "negative" as const : "neutral" as const,
      icon: Gift,
    },
    {
      title: "Frozen Wallets",
      value: stats.frozenWallets.toString(),
      change: stats.frozenWallets > 0 ? "Requires attention" : "All clear",
      changeType: stats.frozenWallets > 0 ? "negative" as const : "positive" as const,
      icon: Flag,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back. Here's what's happening with Joint Vibe today.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Recent Registrations & Activity */}
        <div className="lg:col-span-2 space-y-6">
          <RecentRegistrations />
          <RecentActivity />
        </div>

        {/* Right Column - Treasury & Tiers */}
        <div className="lg:col-span-1 space-y-6">
          <TreasuryOverview />
          <TierDistributionCard />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import {
  Plus, 
  Eye, 
  MousePointer, 
  DollarSign, 
  Megaphone,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle
} from "lucide-react";

interface DashboardStats {
  totalCampaigns: number;
  liveCampaigns: number;
  totalImpressions: number;
  totalClicks: number;
  totalSpend: number;
}

export default function AdvertiserDashboard() {
  const { t } = useTranslation('common');
  const { advertiser } = useOutletContext<{ advertiser: any }>();
  const [stats, setStats] = useState<DashboardStats>({
    totalCampaigns: 0,
    liveCampaigns: 0,
    totalImpressions: 0,
    totalClicks: 0,
    totalSpend: 0,
  });
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!advertiser) return;

    const fetchDashboardData = async () => {
      try {
        // Fetch campaigns with bookings
        const { data: campaigns } = await supabase
          .from("ad_campaigns")
          .select(`
            *,
            ad_bookings (id, payment_status, start_date, end_date)
          `)
          .eq("advertiser_id", advertiser.id)
          .order("created_at", { ascending: false });

        if (campaigns) {
          const today = new Date().toISOString().split('T')[0];
          
          // Process campaigns to determine actual live status
          const processedCampaigns = campaigns.map((campaign: any) => {
            const hasActivePaidBooking = campaign.ad_bookings?.some((booking: any) => 
              booking.payment_status === 'paid' && 
              booking.start_date <= today && 
              booking.end_date >= today
            );
            
            let displayStatus = campaign.status;
            if (campaign.status === 'live' && !hasActivePaidBooking) {
              displayStatus = 'approved';
            } else if (campaign.status === 'approved' && hasActivePaidBooking) {
              displayStatus = 'live';
            }
            
            return { ...campaign, displayStatus, hasActivePaidBooking };
          });

          setRecentCampaigns(processedCampaigns.slice(0, 5));
          
          const liveCampaigns = processedCampaigns.filter((c: any) => c.displayStatus === "live").length;
          
          // Fetch bookings for spend calculation
          const campaignIds = campaigns.map((c: any) => c.id);
          let totalSpend = 0;
          
          if (campaignIds.length > 0) {
            const { data: bookings } = await supabase
              .from("ad_bookings")
              .select("final_price")
              .in("campaign_id", campaignIds)
              .eq("payment_status", "paid");
            
            if (bookings) {
              totalSpend = bookings.reduce((sum: number, b: any) => sum + (b.final_price || 0), 0);
            }

            // Fetch analytics
            const { data: analytics } = await supabase
              .from("ad_analytics")
              .select("impressions, clicks")
              .in("campaign_id", campaignIds);

            if (analytics) {
              const totalImpressions = analytics.reduce((sum: number, a: any) => sum + (a.impressions || 0), 0);
              const totalClicks = analytics.reduce((sum: number, a: any) => sum + (a.clicks || 0), 0);
              
              setStats({
                totalCampaigns: campaigns.length,
                liveCampaigns,
                totalImpressions,
                totalClicks,
                totalSpend,
              });
            } else {
              setStats({
                totalCampaigns: campaigns.length,
                liveCampaigns,
                totalImpressions: 0,
                totalClicks: 0,
                totalSpend,
              });
            }
          } else {
            setStats({
              totalCampaigns: 0,
              liveCampaigns: 0,
              totalImpressions: 0,
              totalClicks: 0,
              totalSpend: 0,
            });
          }
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [advertiser]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any; className?: string; label?: string }> = {
      draft: { variant: "secondary", icon: Clock },
      pending: { variant: "outline", icon: Clock },
      approved: { variant: "default", icon: CheckCircle, className: "bg-amber-500 hover:bg-amber-500/80", label: "Ready to Book" },
      live: { variant: "default", icon: TrendingUp, className: "bg-green-500 hover:bg-green-500/80" },
      rejected: { variant: "destructive", icon: AlertCircle },
      paused: { variant: "secondary", icon: Clock },
      completed: { variant: "outline", icon: CheckCircle },
    };
    
    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;
    const label = config.label || status.charAt(0).toUpperCase() + status.slice(1);
    
    return (
      <Badge variant={config.variant} className={`gap-1 ${config.className || ""}`}>
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {advertiser?.company_name || "Advertiser"}
          </p>
        </div>
        <Button asChild>
          <Link to="/advertiser/campaigns/new">
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Campaigns
            </CardTitle>
            <Megaphone className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCampaigns}</div>
            <p className="text-xs text-muted-foreground">
              {stats.liveCampaigns} currently live
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Impressions
            </CardTitle>
            <Eye className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalImpressions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across all campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Clicks
            </CardTitle>
            <MousePointer className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClicks.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalImpressions > 0 
                ? `${((stats.totalClicks / stats.totalImpressions) * 100).toFixed(2)}% CTR`
                : "No data yet"
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Spend
            </CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalSpend.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Lifetime ad spend
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Campaigns</CardTitle>
              <CardDescription>Your latest property advertisements</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/advertiser/campaigns">{t("common:app.view_all")}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentCampaigns.length === 0 ? (
            <div className="text-center py-12">
              <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No campaigns yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first property advertisement to get started
              </p>
              <Button asChild>
                <Link to="/advertiser/campaigns/new">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Campaign
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentCampaigns.map((campaign) => (
                <div 
                  key={campaign.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">{campaign.headline}</h4>
                    <p className="text-sm text-muted-foreground truncate">
                      {campaign.property_address} • {campaign.city}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {campaign.property_price && (
                      <span className="text-sm font-medium text-foreground">
                        ${campaign.property_price.toLocaleString()}
                      </span>
                    )}
                    {getStatusBadge(campaign.displayStatus || campaign.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      {!advertiser?.is_verified && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between py-6">
            <div>
              <h3 className="font-medium text-foreground">Get Verified</h3>
              <p className="text-sm text-muted-foreground">
                Verified advertisers get faster approvals and premium placement options
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/advertiser/settings">Verify Now</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

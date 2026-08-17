import { useEffect, useState } from "react";
import "./advertiser-popups.css";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, MousePointer, TrendingUp, BarChart3, MapPin, Layout } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { useTranslation } from 'react-i18next';

const chartConfig = {
  impressions: {
    label: "Impressions",
    color: "hsl(var(--chart-1))",
  },
  clicks: {
    label: "Clicks",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function AdvertiserAnalytics() {
  const { t } = useTranslation('common');
  const { advertiser } = useOutletContext<{ advertiser: any }>();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!advertiser) return;

    const fetchCampaigns = async () => {
      const { data } = await supabase
        .from("ad_campaigns")
        .select("id, headline")
        .eq("advertiser_id", advertiser.id);
      
      setCampaigns(data || []);
    };

    fetchCampaigns();
  }, [advertiser]);

  useEffect(() => {
    if (!advertiser) return;

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const days = parseInt(dateRange);
        const startDate = format(startOfDay(subDays(new Date(), days)), "yyyy-MM-dd");
        const endDate = format(endOfDay(new Date()), "yyyy-MM-dd");

        let query = supabase
          .from("ad_analytics")
          .select(`
            *,
            ad_campaigns!inner (
              id,
              headline,
              advertiser_id
            )
          `)
          .eq("ad_campaigns.advertiser_id", advertiser.id)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: true });

        if (selectedCampaign !== "all") {
          query = query.eq("campaign_id", selectedCampaign);
        }

        const { data, error } = await query;

        if (error) throw error;
        setAnalytics(data || []);
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [advertiser, selectedCampaign, dateRange]);

  // Calculate totals
  const totals = analytics.reduce(
    (acc, item) => ({
      impressions: acc.impressions + (item.impressions || 0),
      clicks: acc.clicks + (item.clicks || 0),
    }),
    { impressions: 0, clicks: 0 }
  );

  const ctr = totals.impressions > 0 
    ? ((totals.clicks / totals.impressions) * 100).toFixed(2)
    : "0.00";

  // Group by date for chart
  const dailyData = analytics.reduce((acc: any, item) => {
    const date = item.date;
    if (!acc[date]) {
      acc[date] = { date, impressions: 0, clicks: 0 };
    }
    acc[date].impressions += item.impressions || 0;
    acc[date].clicks += item.clicks || 0;
    return acc;
  }, {});

  const dailyDataArray = Object.values(dailyData).map((day: any) => ({
    ...day,
    dateLabel: format(new Date(day.date), "MMM d"),
  }));

  // Group by placement type
  const placementData = analytics.reduce((acc: any, item) => {
    const type = item.placement_type || "unknown";
    if (!acc[type]) {
      acc[type] = { name: type === "city_view" ? "City View" : "Public Post", impressions: 0, clicks: 0 };
    }
    acc[type].impressions += item.impressions || 0;
    acc[type].clicks += item.clicks || 0;
    return acc;
  }, {});

  const placementDataArray = Object.values(placementData);

  // Group by city
  const cityData = analytics.reduce((acc: any, item) => {
    const city = item.city || "Unknown";
    if (!acc[city]) {
      acc[city] = { name: city, impressions: 0, clicks: 0 };
    }
    acc[city].impressions += item.impressions || 0;
    acc[city].clicks += item.clicks || 0;
    return acc;
  }, {});

  const cityDataArray = Object.values(cityData)
    .sort((a: any, b: any) => b.impressions - a.impressions)
    .slice(0, 5);

  if (loading && campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Track your campaign performance
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
              <SelectTrigger className="w-full sm:w-[250px]">
                <SelectValue placeholder="Select campaign" />
              </SelectTrigger>
              <SelectContent className="advertiser-select-popover">
                <SelectItem value="all">All Campaigns</SelectItem>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.headline}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent className="advertiser-select-popover">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Impressions
            </CardTitle>
            <Eye className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.impressions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Total views in selected period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clicks
            </CardTitle>
            <MousePointer className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.clicks.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Total CTA clicks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Click-Through Rate
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ctr}%</div>
            <p className="text-xs text-muted-foreground">
              Clicks / Impressions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Over Time</CardTitle>
          <CardDescription>Daily impressions and clicks</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyDataArray.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No data yet</h3>
              <p className="text-muted-foreground">
                Analytics will appear here once your campaigns start receiving impressions
              </p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={dailyDataArray} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="dateLabel" className="text-xs" />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="impressions"
                  stroke="hsl(var(--chart-1))"
                  fillOpacity={1}
                  fill="url(#colorImpressions)"
                />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  stroke="hsl(var(--chart-2))"
                  fillOpacity={1}
                  fill="url(#colorClicks)"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Placement */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layout className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">By Placement Type</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {placementDataArray.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">{t("common:status.empty")}</p>
            ) : (
              <div className="space-y-4">
                {placementDataArray.map((item: any, index) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{item.impressions.toLocaleString()} impressions</p>
                      <p className="text-xs text-muted-foreground">{item.clicks} clicks</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By City */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Top Cities</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {cityDataArray.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">{t("common:status.empty")}</p>
            ) : (
              <div className="space-y-3">
                {cityDataArray.map((item: any, index) => {
                  const maxImpressions = Math.max(...cityDataArray.map((c: any) => c.impressions));
                  const percentage = maxImpressions > 0 ? (item.impressions / maxImpressions) * 100 : 0;
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">{item.impressions.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: COLORS[index % COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

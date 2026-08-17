import { useEffect, useState } from "react";
import { Wallet, DollarSign, Coins, TrendingUp, TrendingDown, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface TreasuryData {
  id: string;
  total_jvc_supply: number;
  total_usd_backing: number;
  stripe_balance: number;
  pending_deposits: number;
  pending_withdrawals: number;
  collected_fees: number;
  reconciliation_status: string;
  last_reconciled_at: string | null;
  updated_at: string;
}

export default function AdminTreasury() {
  const { t } = useTranslation('admin');
  const [treasury, setTreasury] = useState<TreasuryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTreasury();
  }, []);

  const fetchTreasury = async () => {
    try {
      const { data, error } = await supabase
        .from("platform_treasury")
        .select("*")
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      setTreasury(data);
    } catch (error) {
      console.error("Error fetching treasury:", error);
      toast.error("Failed to fetch treasury data");
    } finally {
      setIsLoading(false);
    }
  };

  const backingRatio = treasury 
    ? treasury.total_jvc_supply > 0 
      ? (treasury.total_usd_backing / treasury.total_jvc_supply) * 100 
      : 100
    : 100;

  const isHealthy = backingRatio >= 100;

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="h-12 w-12 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Treasury</h1>
          <p className="text-slate-400 mt-1">Platform financial health and reserves</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchTreasury}
            className="border-slate-700 text-slate-300"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {treasury?.reconciliation_status === "healthy" ? (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Healthy
            </Badge>
          ) : (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Needs Review
            </Badge>
          )}
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-cyan-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total JVC Supply</p>
                <p className="text-2xl font-bold text-cyan-400 mt-1">
                  {(treasury?.total_jvc_supply || 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1">JV Coins in circulation</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <Coins className="h-6 w-6 text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-green-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">USD Backing</p>
                <p className="text-2xl font-bold text-green-400 mt-1">
                  ${(treasury?.total_usd_backing || 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1">Total USD reserves</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-purple-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Stripe Balance</p>
                <p className="text-2xl font-bold text-purple-400 mt-1">
                  ${(treasury?.stripe_balance || 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1">Available in Stripe</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-yellow-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Collected Fees</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">
                  ${(treasury?.collected_fees || 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1">Platform revenue</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backing Ratio */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Backing Ratio</CardTitle>
          <CardDescription>USD backing relative to JVC supply</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Current Ratio</span>
            <span className={`text-2xl font-bold ${isHealthy ? "text-green-400" : "text-red-400"}`}>
              {backingRatio.toFixed(2)}%
            </span>
          </div>
          <Progress 
            value={Math.min(backingRatio, 100)} 
            className="h-4 bg-slate-800"
          />
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Target: 100%</span>
            {isHealthy ? (
              <span className="text-green-400 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Fully backed
              </span>
            ) : (
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Underbacked by {(100 - backingRatio).toFixed(2)}%
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pending Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-green-400" />
              Pending Deposits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-4xl font-bold text-green-400">
                ${(treasury?.pending_deposits || 0).toLocaleString()}
              </p>
              <p className="text-slate-400 mt-2">Awaiting processing</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-400" />
              Pending Withdrawals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-4xl font-bold text-orange-400">
                ${(treasury?.pending_withdrawals || 0).toLocaleString()}
              </p>
              <p className="text-slate-400 mt-2">Awaiting approval</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Reconciled */}
      {treasury?.last_reconciled_at && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Last Reconciled</span>
              <span className="text-slate-300">
                {new Date(treasury.last_reconciled_at).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { ArrowUpRight, ArrowDownRight, Coins } from "lucide-react";
import { useTranslation } from 'react-i18next';

const treasuryData = {
  totalJVC: "2,847,392",
  totalUSD: "$2,847,392.00",
  stripeBalance: "$2,891,245.00",
  platformFees: "$14,283.50",
  todayMinted: "45,230",
  todayBurned: "12,840",
  netChange: "+32,390",
};

export function TreasuryOverview() {
  const { t } = useTranslation('admin');
  return (
    <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-foreground">Treasury Overview</h3>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
          <span className="w-1.5 h-1.5 bg-success rounded-full mr-1.5" />
          Balanced
        </span>
      </div>

      {/* Main Balance */}
      <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Coins className="w-4 h-4" />
          Total JVC in Circulation
        </div>
        <p className="text-3xl font-bold text-foreground">{treasuryData.totalJVC}</p>
        <p className="text-sm text-muted-foreground">{treasuryData.totalUSD}</p>
      </div>

      {/* Stripe & Fees */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Stripe Balance</p>
          <p className="text-lg font-semibold text-foreground">{treasuryData.stripeBalance}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Platform Fees (MTD)</p>
          <p className="text-lg font-semibold text-success">{treasuryData.platformFees}</p>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Today's Activity</p>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-success" />
            <span className="text-sm text-foreground">Minted</span>
          </div>
          <span className="text-sm font-medium text-success">+{treasuryData.todayMinted} JVC</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="w-4 h-4 text-destructive" />
            <span className="text-sm text-foreground">Burned</span>
          </div>
          <span className="text-sm font-medium text-destructive">-{treasuryData.todayBurned} JVC</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-sm font-medium text-foreground">Net Change</span>
          <span className="text-sm font-bold text-primary">{treasuryData.netChange} JVC</span>
        </div>
      </div>
    </div>
  );
}

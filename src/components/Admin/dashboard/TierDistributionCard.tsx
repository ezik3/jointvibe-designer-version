import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import TierBadge from "@/components/Tier/TierBadge";
import type { TierName } from "@/hooks/useUserTier";
import { useTranslation } from 'react-i18next';

const TIER_ORDER: TierName[] = ["member", "bronze", "silver", "gold", "diamond", "platinum"];

export default function TierDistributionCard() {
  const { t } = useTranslation('admin');
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("user_tiers")
        .select("current_tier");

      if (data) {
        const counts: Record<string, number> = {};
        for (const row of data) {
          const tier = (row as any).current_tier || "member";
          counts[tier] = (counts[tier] || 0) + 1;
        }
        setDistribution(counts);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const total = Object.values(distribution).reduce((s, v) => s + v, 0);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Tier Distribution</CardTitle></CardHeader>
        <CardContent><div className="h-20 animate-pulse bg-muted rounded" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Tier Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {TIER_ORDER.map((tier) => {
          const count = distribution[tier] || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
          return (
            <div key={tier} className="flex items-center justify-between gap-3">
              <TierBadge tier={tier} size="sm" />
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-14 text-right">
                {count} ({pct}%)
              </span>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground text-center pt-2">
          {total} total users
        </p>
      </CardContent>
    </Card>
  );
}

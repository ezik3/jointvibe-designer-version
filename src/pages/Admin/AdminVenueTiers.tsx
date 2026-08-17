import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Shield, AlertTriangle, Snowflake, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import VenueTierBadge from "@/components/Venue/VenueTierBadge";
import type { VenueTierName } from "@/hooks/useVenueTier";
import { useTranslation } from 'react-i18next';

const TIER_ORDER: VenueTierName[] = ["bronze", "silver", "gold", "diamond", "platinum"];

export default function AdminVenueTiers() {
  const { t } = useTranslation('admin');
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [platinumVenues, setPlatinumVenues] = useState<any[]>([]);
  const [graceVenues, setGraceVenues] = useState<any[]>([]);
  const [frozenVenues, setFrozenVenues] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    // Distribution
    const { data: scores } = await supabase.from("venue_tier_scores").select("current_tier");
    if (scores) {
      const counts: Record<string, number> = {};
      for (const row of scores) {
        const t = (row as any).current_tier || "bronze";
        counts[t] = (counts[t] || 0) + 1;
      }
      setDistribution(counts);
    }

    // Platinum venues
    const { data: plat } = await supabase
      .from("venue_tier_scores")
      .select("venue_id, composite_score, tier_updated_at")
      .eq("current_tier", "platinum");
    if (plat?.length) {
      const venueIds = plat.map((p: any) => p.venue_id);
      const { data: venues } = await supabase.from("venues").select("id, name, city, country").in("id", venueIds);
      const venueMap = new Map(venues?.map((v: any) => [v.id, v]) || []);
      setPlatinumVenues(plat.map((p: any) => ({ ...p, venue: venueMap.get(p.venue_id) })));
    }

    // Grace period venues
    const { data: grace } = await supabase
      .from("venue_tier_scores")
      .select("venue_id, current_tier, composite_score, grace_period_ends_at")
      .eq("is_tier_at_risk", true);
    if (grace?.length) {
      const venueIds = grace.map((g: any) => g.venue_id);
      const { data: venues } = await supabase.from("venues").select("id, name").in("id", venueIds);
      const venueMap = new Map(venues?.map((v: any) => [v.id, v]) || []);
      setGraceVenues(grace.map((g: any) => ({ ...g, venue: venueMap.get(g.venue_id) })));
    }

    // Frozen
    const { data: frozen } = await supabase
      .from("venue_tier_scores")
      .select("venue_id, current_tier, composite_score")
      .eq("score_frozen", true);
    if (frozen?.length) {
      const venueIds = frozen.map((f: any) => f.venue_id);
      const { data: venues } = await supabase.from("venues").select("id, name").in("id", venueIds);
      const venueMap = new Map(venues?.map((v: any) => [v.id, v]) || []);
      setFrozenVenues(frozen.map((f: any) => ({ ...f, venue: venueMap.get(f.venue_id) })));
    }

    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const { data } = await supabase
      .from("venues")
      .select("id, name, city, country")
      .ilike("name", `%${searchQuery}%`)
      .limit(10);

    if (data?.length) {
      const ids = data.map((v: any) => v.id);
      const { data: scores } = await supabase
        .from("venue_tier_scores")
        .select("*")
        .in("venue_id", ids);
      const { data: classes } = await supabase
        .from("venue_classifications")
        .select("*")
        .in("venue_id", ids);

      const scoreMap = new Map(scores?.map((s: any) => [s.venue_id, s]) || []);
      const classMap = new Map(classes?.map((c: any) => [c.venue_id, c]) || []);

      setSearchResults(data.map((v: any) => ({
        ...v,
        scores: scoreMap.get(v.id),
        classification: classMap.get(v.id),
      })));
    } else {
      setSearchResults([]);
    }
  };

  const toggleFreeze = async (venueId: string, currentlyFrozen: boolean) => {
    await supabase.from("venue_tier_scores").update({ score_frozen: !currentlyFrozen }).eq("venue_id", venueId);
    fetchData();
  };

  const total = Object.values(distribution).reduce((s, v) => s + v, 0);

  if (loading) {
    return <div className="p-8"><div className="h-40 animate-pulse bg-muted rounded-lg" /></div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Venue Tiers</h1>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="platinum">Platinum</TabsTrigger>
          <TabsTrigger value="grace">Grace Period</TabsTrigger>
          <TabsTrigger value="lookup">Lookup</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Distribution */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Tier Distribution ({total} venues)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {TIER_ORDER.map((tier) => {
                const count = distribution[tier] || 0;
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
                return (
                  <div key={tier} className="flex items-center justify-between gap-3">
                    <VenueTierBadge tier={tier} size="sm" />
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">{count} ({pct}%)</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Frozen */}
          {frozenVenues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Snowflake className="w-4 h-4" /> Frozen Venues ({frozenVenues.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {frozenVenues.map((v: any) => (
                  <div key={v.venue_id} className="flex items-center justify-between py-2">
                    <span className="text-sm">{v.venue?.name || v.venue_id}</span>
                    <Button size="sm" variant="outline" onClick={() => toggleFreeze(v.venue_id, true)}>Unfreeze</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="platinum" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Crown className="w-4 h-4 text-violet-400" /> Platinum Venues</CardTitle></CardHeader>
            <CardContent>
              {platinumVenues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Platinum venues yet</p>
              ) : (
                platinumVenues.map((v: any) => (
                  <div key={v.venue_id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{v.venue?.name || v.venue_id}</p>
                      <p className="text-xs text-muted-foreground">{v.venue?.city}, {v.venue?.country}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{v.composite_score}/1000</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grace" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> At Risk ({graceVenues.length})</CardTitle></CardHeader>
            <CardContent>
              {graceVenues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No venues at risk</p>
              ) : (
                graceVenues.map((v: any) => {
                  const daysLeft = v.grace_period_ends_at
                    ? Math.max(0, Math.ceil((new Date(v.grace_period_ends_at).getTime() - Date.now()) / 86400000))
                    : 0;
                  return (
                    <div key={v.venue_id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{v.venue?.name || v.venue_id}</p>
                        <VenueTierBadge tier={(v as any).current_tier} size="sm" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm">{v.composite_score}/1000</p>
                        <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-xs">{daysLeft}d left</Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lookup" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search venue name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch}><Search className="w-4 h-4" /></Button>
          </div>

          {searchResults.map((v: any) => (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.city}, {v.country}</p>
                  </div>
                  {v.scores && <VenueTierBadge tier={(v.scores as any).current_tier} size="md" />}
                </div>
                {v.scores ? (
                  <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                    <div>Score: <b>{(v.scores as any).composite_score}</b>/1000</div>
                    <div>Return: <b>{(v.scores as any).return_rate_score}</b></div>
                    <div>Util: <b>{(v.scores as any).utilization_score}</b></div>
                    <div>Engage: <b>{(v.scores as any).engagement_score}</b></div>
                    <div>Velocity: <b>{(v.scores as any).velocity_score}</b></div>
                    <div>Fulfill: <b>{(v.scores as any).fulfillment_score}</b></div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not classified yet</p>
                )}
                {v.scores && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant={(v.scores as any).score_frozen ? "default" : "outline"}
                      onClick={() => toggleFreeze(v.id, (v.scores as any).score_frozen)}
                    >
                      {(v.scores as any).score_frozen ? "Unfreeze" : "Freeze Score"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

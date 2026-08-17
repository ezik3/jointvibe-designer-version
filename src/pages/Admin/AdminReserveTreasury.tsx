import { useTreasury } from "@/hooks/useTreasury";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, AlertOctagon, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

/**
 * Phase 5: Reserve Treasury & Reconciliation Dashboard
 * Admin-only. Proves the system is fully solvent (RLUSD reserves >= JVC outstanding).
 */
export default function AdminReserveTreasury() {
  const { health, flows, runs, alerts, loading, runReconciliation, acknowledgeAlert, refresh } = useTreasury();

  const ratio = health && health.total_jvc_outstanding > 0
    ? health.total_rlusd_reserves / health.total_jvc_outstanding
    : null;
  const surplus = health ? health.total_rlusd_reserves - health.total_jvc_outstanding : 0;
  const ratioColor =
    ratio === null ? "text-muted-foreground"
    : ratio < 1 ? "text-destructive"
    : ratio < 1.05 ? "text-yellow-500"
    : "text-emerald-500";

  const handleRecon = async () => {
    try { await runReconciliation(); toast.success("Reconciliation complete"); }
    catch (e: any) { toast.error(e.message || "Failed (admin only)"); }
  };

  const totals = flows.reduce((acc, f) => ({
    deposits: acc.deposits + Number(f.deposits_usd),
    withdrawals: acc.withdrawals + Number(f.withdrawals_usd),
    swaps: acc.swaps + Number(f.swaps_usd),
    offramps: acc.offramps + Number(f.offramps_usd),
  }), { deposits: 0, withdrawals: 0, swaps: 0, offramps: 0 });

  // Simple sparkline scaling
  const maxFlow = Math.max(1, ...flows.map(f => Math.max(
    Number(f.deposits_usd), Number(f.withdrawals_usd), Number(f.offramps_usd)
  )));

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reserve Treasury</h1>
          <p className="text-sm text-muted-foreground">Live solvency of the RLUSD ↔ JVC reserve.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={handleRecon} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
            Run Reconciliation
          </Button>
        </div>
      </header>

      {/* Health KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">RLUSD Reserves</div>
          <div className="text-2xl font-bold text-foreground mt-1">
            ${Number(health?.total_rlusd_reserves ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">JVC Outstanding</div>
          <div className="text-2xl font-bold text-foreground mt-1">
            ${Number(health?.total_jvc_outstanding ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Health Ratio</div>
          <div className={`text-2xl font-bold mt-1 ${ratioColor}`}>
            {ratio === null ? "—" : `${(ratio * 100).toFixed(2)}%`}
          </div>
          <div className="text-xs text-muted-foreground mt-1">target ≥ 105%</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Surplus</div>
          <div className={`text-2xl font-bold mt-1 ${surplus < 0 ? "text-destructive" : "text-emerald-500"}`}>
            {surplus < 0 ? "−" : ""}${Math.abs(surplus).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </Card>
      </div>

      {/* Pending flows */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Pending Deposits
          </div>
          <div className="text-xl font-semibold mt-1">${Number(health?.pending_deposits_usd ?? 0).toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Pending Withdrawals
          </div>
          <div className="text-xl font-semibold mt-1">${Number(health?.pending_withdrawals_usd ?? 0).toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Pending Off-ramps
          </div>
          <div className="text-xl font-semibold mt-1">${Number(health?.pending_offramps_usd ?? 0).toFixed(2)}</div>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="p-4 border-destructive/40">
          <div className="flex items-center gap-2 mb-3">
            <AlertOctagon className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold text-foreground">Open Alerts ({alerts.length})</h2>
          </div>
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-2 rounded-md border border-border/40">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={a.severity === "critical" ? "destructive" : a.severity === "warning" ? "secondary" : "outline"} className="text-[10px]">
                    {a.severity}
                  </Badge>
                  <span className="text-sm truncate">{a.message}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => acknowledgeAlert(a.id)}>Ack</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 30-day flows */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">30-Day Flows</h2>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>Deposits ${totals.deposits.toFixed(0)}</span>
            <span>Withdrawals ${totals.withdrawals.toFixed(0)}</span>
            <span>Off-ramps ${totals.offramps.toFixed(0)}</span>
            <span>Swaps ${totals.swaps.toFixed(0)}</span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-32">
          {flows.map(f => {
            const dep = (Number(f.deposits_usd) / maxFlow) * 100;
            const wd = (Number(f.withdrawals_usd) / maxFlow) * 100;
            return (
              <div key={f.day} className="flex-1 flex flex-col gap-0.5 justify-end" title={`${f.day}\nIn: $${f.deposits_usd}\nOut: $${f.withdrawals_usd}`}>
                <div className="w-full bg-emerald-500/70 rounded-sm" style={{ height: `${dep}%`, minHeight: dep > 0 ? "2px" : 0 }} />
                <div className="w-full bg-destructive/70 rounded-sm" style={{ height: `${wd}%`, minHeight: wd > 0 ? "2px" : 0 }} />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recent recon runs */}
      <Card className="p-4">
        <h2 className="font-semibold text-foreground mb-3">Recent Reconciliation Runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border/40">
              <tr>
                <th className="text-left py-2">When</th>
                <th className="text-right">Reserves</th>
                <th className="text-right">Outstanding</th>
                <th className="text-right">Ratio</th>
                <th className="text-right">Surplus</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-4">No runs yet — click "Run Reconciliation".</td></tr>
              )}
              {runs.map(r => (
                <tr key={r.id} className="border-b border-border/20">
                  <td className="py-2 text-xs">{new Date(r.run_at).toLocaleString()}</td>
                  <td className="text-right">${Number(r.total_rlusd_reserves).toFixed(2)}</td>
                  <td className="text-right">${Number(r.total_jvc_outstanding).toFixed(2)}</td>
                  <td className="text-right">{(Number(r.health_ratio) * 100).toFixed(2)}%</td>
                  <td className={`text-right ${Number(r.surplus_usd) < 0 ? "text-destructive" : ""}`}>${Number(r.surplus_usd).toFixed(2)}</td>
                  <td className="text-right">
                    <Badge variant={r.status === "critical" ? "destructive" : r.status === "warning" ? "secondary" : "default"} className="text-[10px]">
                      {r.status === "critical" && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

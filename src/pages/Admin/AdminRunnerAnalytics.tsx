import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Row {
  id: string;
  status: string;
  est_item_cost_usd: number | null;
  final_item_cost_usd: number | null;
  runner_fee_usd: number | null;
  tip_usd: number | null;
  approval_requested_at: string | null;
  approved_at: string | null;
  created_at: string;
}

const RANGE_DAYS = 30;

const AdminRunnerAnalytics = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = new Date(Date.now() - RANGE_DAYS * 86400_000).toISOString();
    (async () => {
      const { data } = await supabase
        .from('runner_jobs' as any)
        .select(
          'id,status,est_item_cost_usd,final_item_cost_usd,runner_fee_usd,tip_usd,approval_requested_at,approved_at,created_at',
        )
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);
      setRows(((data as unknown as Row[]) ?? []));
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const accepted = rows.filter((r) =>
      ['accepted', 'at_store', 'awaiting_approval', 'approved', 'purchased', 'delivered', 'completed'].includes(r.status),
    ).length;
    const cancelled = rows.filter((r) => r.status === 'cancelled' || r.status === 'rejected').length;
    const completed = rows.filter((r) => r.status === 'completed').length;

    const approvalDelays = rows
      .filter((r) => r.approval_requested_at && r.approved_at)
      .map(
        (r) =>
          (new Date(r.approved_at!).getTime() - new Date(r.approval_requested_at!).getTime()) /
          1000,
      );
    const avgApprovalSec = approvalDelays.length
      ? approvalDelays.reduce((s, n) => s + n, 0) / approvalDelays.length
      : 0;

    const valueRows = rows.filter((r) => r.final_item_cost_usd ?? r.est_item_cost_usd);
    const avgJobValue = valueRows.length
      ? valueRows.reduce(
          (s, r) =>
            s +
            Number(r.final_item_cost_usd ?? r.est_item_cost_usd ?? 0) +
            Number(r.runner_fee_usd ?? 0) +
            Number(r.tip_usd ?? 0),
          0,
        ) / valueRows.length
      : 0;

    return {
      total,
      acceptanceRate: total ? (accepted / total) * 100 : 0,
      cancelRate: total ? (cancelled / total) * 100 : 0,
      completionRate: total ? (completed / total) * 100 : 0,
      avgApprovalSec,
      avgJobValue,
    };
  }, [rows]);

  if (loading) return <div className="p-6 text-foreground">Loading runner analytics…</div>;

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Runner Analytics</h1>
          <p className="text-sm text-muted-foreground">Last {RANGE_DAYS} days · {stats.total} jobs</p>
        </div>
        <Badge variant="secondary">JV Runner</Badge>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Acceptance rate" value={`${stats.acceptanceRate.toFixed(1)}%`} />
        <Stat label="Cancel rate" value={`${stats.cancelRate.toFixed(1)}%`} />
        <Stat label="Completion rate" value={`${stats.completionRate.toFixed(1)}%`} />
        <Stat
          label="Avg approval delay"
          value={`${stats.avgApprovalSec < 60 ? stats.avgApprovalSec.toFixed(0) + 's' : (stats.avgApprovalSec / 60).toFixed(1) + 'm'}`}
        />
        <Stat label="Avg job value" value={`$${stats.avgJobValue.toFixed(2)}`} />
        <Stat label="Total jobs" value={String(stats.total)} />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Status breakdown</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(
            rows.reduce<Record<string, number>>((acc, r) => {
              acc[r.status] = (acc[r.status] || 0) + 1;
              return acc;
            }, {}),
          )
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <Badge key={status} variant="outline">
                {status}: {count}
              </Badge>
            ))}
        </div>
      </Card>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <Card className="p-4">
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
  </Card>
);

export default AdminRunnerAnalytics;

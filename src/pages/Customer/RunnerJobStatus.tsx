import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, CheckCircle2, CircleDollarSign, ClipboardList, Clock, MapPin, ShoppingBag, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useRunnerJobs, type RunnerJob, RUNNER_TOLERANCE, RUNNER_BUFFER_PCT, RUNNER_PLATFORM_FEE_USD } from '@/hooks/useRunnerJobs';
import './runner.css';

const statusLabel: Record<string, string> = {
  pending: 'Looking for a runner',
  accepted: 'Runner on the way to store',
  at_store: 'Runner is at the store',
  awaiting_approval: 'Approval needed',
  approved: 'Approved — purchasing',
  purchased: 'Purchased — out for delivery',
  delivered: 'Delivered — confirm receipt',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  disputed: 'Disputed',
};

const getStatusTone = (status: string) => {
  if (status === 'completed') return 'runner-status-badge--complete';
  if (['cancelled', 'rejected', 'disputed'].includes(status)) return 'runner-status-badge--danger';
  return 'runner-status-badge--active';
};

const RunnerJobStatus = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { approveCart, cancelJob, confirmDelivery } = useRunnerJobs();
  const [job, setJob] = useState<RunnerJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    const load = async () => {
      const { data } = await supabase
        .from('runner_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();
      setJob((data as unknown as RunnerJob) ?? null);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel(createRealtimeChannelTopic(`runner_job_${jobId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'runner_jobs', filter: `id=eq.${jobId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [jobId]);

  if (loading) return <div className="p-6 text-foreground">Loading…</div>;
  if (!job) {
    return (
      <main className="runner-page runner-status-page">
        <div className="runner-status-state">
          <ClipboardList aria-hidden="true" />
          <h1>Job not found</h1>
          <p>This runner request is unavailable or has been removed.</p>
        </div>
      </main>
    );
  }

  const cartTotal = (job.cart_preview_json ?? []).reduce((s, i) => s + (i.est_price || 0), 0);

  const handleApprove = async () => {
    try {
      await approveCart(job.id, Math.round(cartTotal * 100) / 100);
      toast.success('Approved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve');
    }
  };

  const handleReject = async () => {
    try {
      await cancelJob(job.id, 'customer_rejected_cart');
      toast.success('Cancelled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel');
    }
  };

  const handleConfirm = async () => {
    try {
      await confirmDelivery(job.id);
      toast.success('Delivery confirmed');
      navigate('/app/feed/immersive');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm');
    }
  };

  return (
    <main className="runner-page runner-status-page">
      <header className="runner-page__heading">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="runner-page__back"
          onClick={() => navigate('/app/feed/immersive')}
          aria-label="Return to home"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div>
          <p>Runner request</p>
          <h1>Runner job</h1>
        </div>
        <div className="runner-status-heading">
          <span className={`runner-status-badge ${getStatusTone(job.status)}`}>
            {statusLabel[job.status] ?? job.status}
          </span>
        </div>
      </header>

      <div className="runner-status-layout">
        <Card className="runner-panel">
          <div className="runner-panel__heading">
            <span className="runner-panel__icon"><ShoppingBag aria-hidden="true" /></span>
            <div>
              <h2>Request details</h2>
              <p>Your runner is working from these instructions.</p>
            </div>
          </div>
          <div className="runner-job-facts">
            <div className="runner-job-fact">
              <span>Task</span>
              <span>{job.task_description}</span>
            </div>
            <div className="runner-job-fact">
              <span><MapPin aria-hidden="true" />Drop-off</span>
              <span>{job.dropoff_address}</span>
            </div>
          </div>
        </Card>

        <Card className="runner-panel">
          <div className="runner-panel__heading">
            <span className="runner-panel__icon"><CircleDollarSign aria-hidden="true" /></span>
            <div>
              <h2>Receipt</h2>
              <p>Held, approved, and final amounts for this request.</p>
            </div>
          </div>
          {(() => {
            const itemEst = Number(job.est_item_cost_usd ?? 0);
            const runnerFee = Number(job.runner_fee_usd ?? 0);
            const surcharge = Number(job.distance_surcharge_usd ?? 0);
            const tip = Number(job.tip_usd ?? 0);
            const platformFee = Number(job.platform_fee_usd ?? RUNNER_PLATFORM_FEE_USD);
            const buffer = Math.round(itemEst * (RUNNER_BUFFER_PCT / 100) * 100) / 100;
            const held = Number(job.held_amount_usd ?? 0);
            const finalCost = job.final_item_cost_usd != null ? Number(job.final_item_cost_usd) : null;
            const approvedTotal = job.approved_total_usd != null ? Number(job.approved_total_usd) : null;
            const refund =
              finalCost != null
                ? Math.max(0, Math.round((held - (finalCost + runnerFee + surcharge + tip + platformFee)) * 100) / 100)
                : null;
            return (
              <div className="runner-receipt">
                <Row label="Items (estimated)" value={`$${itemEst.toFixed(2)}`} />
                <Row label="Runner fee" value={`$${runnerFee.toFixed(2)}`} />
                {surcharge > 0 && (
                  <Row label="Distance surcharge" value={`$${surcharge.toFixed(2)}`} />
                )}
                <Row label="Tip" value={`$${tip.toFixed(2)}`} />
                <Row label={`Buffer (${RUNNER_BUFFER_PCT}%)`} value={`$${buffer.toFixed(2)}`} />
                <Row label="Joint Vibe fee" value={`$${platformFee.toFixed(2)}`} />
                <div className="runner-receipt__total">
                  <span>Total held</span>
                  <span>${held.toFixed(2)}</span>
                </div>
                {approvedTotal != null && (
                  <Row label="Approved cart" value={`$${approvedTotal.toFixed(2)}`} />
                )}
                {finalCost != null && (
                  <Row label="Final item cost" value={`$${finalCost.toFixed(2)}`} />
                )}
                {refund != null && refund > 0 && (
                  <div className="runner-receipt__refund">
                    <span>Refunded to wallet</span>
                    <span className="font-semibold">${refund.toFixed(2)}</span>
                  </div>
                )}
                <p className="runner-status-copy">
                  We hold the estimated items + a {RUNNER_BUFFER_PCT}% buffer in case prices differ.
                  After the runner buys the items, only the actual amount is charged.{' '}
                  <strong>Any unused buffer is automatically refunded back to your wallet.</strong>
                </p>
              </div>
            );
          })()}
        </Card>

        {job.status === 'awaiting_approval' && job.cart_preview_json && (
          <Card className="runner-panel">
            <div className="runner-panel__heading">
              <span className="runner-panel__icon"><ShieldCheck aria-hidden="true" /></span>
              <div>
                <h2>Approve cart</h2>
                <p>Review the runner's item estimate before purchase.</p>
              </div>
            </div>
            <ul className="runner-cart-list">
              {job.cart_preview_json.map((it, i) => (
                <li key={i} className="runner-cart-item">
                  <span>{it.name}</span>
                  <span>${Number(it.est_price).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="runner-receipt__total">
              <span>Total</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
            <p className="runner-cart-tolerance">
              Tolerance ±${RUNNER_TOLERANCE.toFixed(2)}. Final receipt over this requires re-approval.
            </p>
            <div className="runner-job-action-row">
              <Button type="button" onClick={handleApprove}>
                <CheckCircle2 aria-hidden="true" /> Approve
              </Button>
              <Button type="button" variant="outline" onClick={handleReject}>
                <XCircle aria-hidden="true" /> Reject
              </Button>
            </div>
          </Card>
        )}

        {job.status === 'delivered' && (
          <Card className="runner-panel">
            <div className="runner-panel__heading">
              <span className="runner-panel__icon"><CheckCircle2 aria-hidden="true" /></span>
              <div>
                <h2>Confirm delivery</h2>
                <p>Finish this runner request after checking your delivery.</p>
              </div>
            </div>
            <p className="runner-status-copy">
              Auto-confirms in 30 minutes. You have 24 hours after completion to dispute.
            </p>
            <Button type="button" className="runner-status-done" onClick={handleConfirm}>
              <CheckCircle2 aria-hidden="true" /> Done
            </Button>
          </Card>
        )}

        {(job.status === 'pending' || job.status === 'accepted') && (
          <Button type="button" className="runner-job-cancel" variant="outline" onClick={handleReject}>
            Cancel job
          </Button>
        )}

        {/* Always-visible Done — returns to home feed without cancelling the job */}
        <Button
          className="runner-status-done"
          variant={
            job.status === 'completed' ||
            job.status === 'cancelled' ||
            job.status === 'rejected'
              ? 'default'
              : 'secondary'
          }
          onClick={() => navigate('/app/feed/immersive')}
        >
          <CheckCircle2 aria-hidden="true" /> Done
        </Button>

        {job.dispute_window_ends_at && (
          <div className="runner-dispute-window">
            <Clock aria-hidden="true" />
            Dispute window ends {new Date(job.dispute_window_ends_at).toLocaleString()}
          </div>
        )}
      </div>
    </main>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="runner-receipt__row">
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

export default RunnerJobStatus;

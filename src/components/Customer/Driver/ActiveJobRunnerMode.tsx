import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Camera, ShoppingCart, Truck, CheckCircle2, X, Plus, Clock, AlertTriangle } from 'lucide-react';
import type { RunnerJob, RunnerCartItem } from '@/hooks/useRunnerJobs';

interface Props {
  job: RunnerJob;
  onUpdated?: () => void;
}

const APPROVAL_REMINDER_MS = 60_000;
const APPROVAL_OVERRIDE_MS = 120_000;

/**
 * ActiveJob (Runner Mode)
 * Single component handling all runner-side state transitions.
 */
export const ActiveJobRunnerMode = ({ job, onUpdated }: Props) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<RunnerCartItem[]>(job.cart_preview_json ?? []);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [waitedFor, setWaitedFor] = useState(0);
  const reminderShownRef = useRef(false);

  // Approval timer (runner side)
  useEffect(() => {
    if (job.status !== 'awaiting_approval' || !job.approval_requested_at) return;
    const start = new Date(job.approval_requested_at).getTime();
    const tick = () => setWaitedFor(Date.now() - start);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [job.status, job.approval_requested_at]);

  useEffect(() => {
    if (
      job.status === 'awaiting_approval' &&
      waitedFor >= APPROVAL_REMINDER_MS &&
      !reminderShownRef.current
    ) {
      reminderShownRef.current = true;
      toast.info('Reminder sent to customer');
    }
  }, [waitedFor, job.status]);

  const update = async (patch: Partial<RunnerJob>) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from('runner_jobs' as any)
        .update(patch as any)
        .eq('id', job.id);
      if (error) throw error;
      onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = () =>
    update({ status: 'accepted', runner_id: user!.id, accepted_at: new Date().toISOString() });

  const handleAtStore = () => update({ status: 'at_store' });

  const uploadPhoto = async (file: File, folder: 'cart' | 'receipt' | 'dropoff') => {
    const path = `${job.id}/${folder}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('runner-job-media').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('runner-job-media').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleCartPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push(await uploadPhoto(f, 'cart'));
      const res = await supabase.functions.invoke('extract-runner-cart', {
        body: { job_id: job.id, image_urls: urls },
      });
      const extracted = (res.data?.items ?? []) as RunnerCartItem[];
      if (extracted.length) setItems((prev) => [...prev, ...extracted]);
      else toast.info('No items detected — add manually');
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const addItem = () => {
    const price = parseFloat(newPrice);
    if (!newName.trim() || isNaN(price) || price < 0) return;
    setItems((p) => [...p, { name: newName.trim(), est_price: Math.round(price * 100) / 100 }]);
    setNewName('');
    setNewPrice('');
  };

  const submitCart = async () => {
    if (!items.length) {
      toast.error('Add at least one item');
      return;
    }
    await update({
      status: 'awaiting_approval',
      cart_preview_json: items as any,
      approval_requested_at: new Date().toISOString(),
    });
  };

  const cancelPreApproval = async () => {
    setBusy(true);
    try {
      await supabase.functions.invoke('cancel-runner-job', {
        body: { job_id: job.id, reason: 'items_unavailable', by: 'runner' },
      });
      toast.success('Job cancelled (no penalty)');
      onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const proceedWithinApproved = async () => {
    // Runner override after 2 min: ONLY allowed if current cart total
    // is within the original estimate. Never blind-approve over-budget carts.
    const currentCart = (job.cart_preview_json ?? items).reduce(
      (s, i) => s + (i.est_price || 0),
      0,
    );
    if (currentCart > Number(job.est_item_cost_usd)) {
      toast.error(
        `Cart $${currentCart.toFixed(2)} exceeds original estimate $${Number(
          job.est_item_cost_usd,
        ).toFixed(2)}. Customer must approve.`,
      );
      return;
    }
    await update({
      status: 'approved',
      approved_total_usd: Math.round(currentCart * 100) / 100,
      approved_at: new Date().toISOString(),
    });
  };

  const handleReceiptUpload = async (file: File | null, finalCost: number) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadPhoto(file, 'receipt');
      await update({
        status: 'purchased',
        purchased_at: new Date().toISOString(),
        final_item_cost_usd: finalCost,
        purchase_proof_urls: [...job.purchase_proof_urls, url],
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDropoffUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadPhoto(file, 'dropoff');
      await update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        dropoff_proof_urls: [...job.dropoff_proof_urls, url],
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const cartTotal = items.reduce((s, i) => s + (i.est_price || 0), 0);
  const cap = 50;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4" />
          <span className="font-semibold">ActiveJob (Runner Mode)</span>
        </div>
        <Badge variant="secondary">{job.status}</Badge>
      </div>

      <div className="text-sm">
        <div className="text-muted-foreground text-xs">Task</div>
        {job.task_description}
      </div>
      <div className="text-xs text-muted-foreground">
        Est ${Number(job.est_item_cost_usd).toFixed(2)} · Fee ${Number(job.runner_fee_usd).toFixed(2)} ·
        Tip ${Number(job.tip_usd).toFixed(2)} · Cap ${cap}
      </div>

      {job.status === 'pending' && (
        <div className="space-y-2">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              You will earn
            </div>
            <div className="text-lg font-semibold text-emerald-500">
              ${(Number(job.runner_fee_usd) + Number(job.tip_usd)).toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">
              ${Number(job.runner_fee_usd).toFixed(2)} fee + ${Number(job.tip_usd).toFixed(2)} tip
            </div>
            <div className="mt-2 border-t border-border pt-2 text-xs">
              <span className="text-muted-foreground">You'll spend approx:</span>{' '}
              <span className="font-semibold text-foreground">
                ~${Number(job.est_item_cost_usd).toFixed(2)}
              </span>
              <span className="text-muted-foreground"> (reimbursed on delivery, cap ${cap})</span>
            </div>
          </div>
          <Button disabled={busy} onClick={handleAccept} className="w-full">
            Accept job
          </Button>
        </div>
      )}

      {job.status === 'accepted' && (
        <Button disabled={busy} onClick={handleAtStore} className="w-full">
          I'm at the store
        </Button>
      )}

      {job.status === 'at_store' && (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Camera className="h-4 w-4" /> Upload item photos
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => handleCartPhotos(e.target.files)}
              className="block w-full text-xs"
            />
          </label>

          <div className="space-y-1">
            {items.map((it, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{it.name}</span>
                <div className="flex items-center gap-2">
                  <span>${Number(it.est_price).toFixed(2)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setItems((p) => p.filter((_, k) => k !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Item"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              placeholder="$"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="w-24"
            />
            <Button size="icon" variant="outline" onClick={addItem}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Total</span>
            <span>${cartTotal.toFixed(2)}</span>
          </div>

          {cartTotal > cap && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Exceeds ${cap} out-of-pocket cap
            </div>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy || !items.length || cartTotal > cap}
              onClick={submitCart}
            >
              <ShoppingCart className="mr-2 h-4 w-4" /> Send for approval
            </Button>
            <Button variant="outline" disabled={busy} onClick={cancelPreApproval}>
              Items unavailable
            </Button>
          </div>
        </div>
      )}

      {job.status === 'awaiting_approval' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Waiting for customer approval ·{' '}
            {Math.floor(waitedFor / 1000)}s
          </div>
          {waitedFor >= APPROVAL_OVERRIDE_MS && (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={proceedWithinApproved}
              >
                Proceed within original ${Number(job.est_item_cost_usd).toFixed(2)}
              </Button>
              <Button variant="outline" disabled={busy} onClick={cancelPreApproval}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {job.status === 'approved' && (
        <ReceiptStep
          busy={busy}
          approved={Number(job.approved_total_usd ?? 0)}
          onSubmit={handleReceiptUpload}
        />
      )}

      {job.status === 'purchased' && (
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-medium">
            <Camera className="h-4 w-4" /> Upload drop-off proof
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleDropoffUpload(e.target.files?.[0] ?? null)}
            className="block w-full text-xs"
          />
        </label>
      )}

      {job.status === 'delivered' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" /> Delivered. Awaiting customer confirmation.
        </div>
      )}

      {job.status === 'completed' && (
        <div className="flex items-center gap-2 text-sm text-emerald-500">
          <CheckCircle2 className="h-4 w-4" /> Paid out. Dispute window open for 24h.
        </div>
      )}
    </Card>
  );
};

const ReceiptStep = ({
  busy,
  approved,
  onSubmit,
}: {
  busy: boolean;
  approved: number;
  onSubmit: (file: File | null, finalCost: number) => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [final, setFinal] = useState(approved.toFixed(2));
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 flex items-center gap-2 text-sm font-medium">
          <Camera className="h-4 w-4" /> Upload receipt
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs"
        />
      </label>
      <div className="flex gap-2">
        <Input
          type="number"
          step="0.01"
          value={final}
          onChange={(e) => setFinal(e.target.value)}
          placeholder="Final cost"
        />
        <Button
          disabled={busy || !file}
          onClick={() => onSubmit(file, parseFloat(final) || 0)}
        >
          Submit
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tolerance ±$0.50 vs approved ${approved.toFixed(2)}. Over → re-approval.
      </p>
    </div>
  );
};

export default ActiveJobRunnerMode;

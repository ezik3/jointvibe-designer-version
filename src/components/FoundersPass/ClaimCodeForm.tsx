import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Key, Loader2, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { PassType } from '@/types/foundersPass';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ClaimCodeFormProps {
  passType: PassType;
}

export function ClaimCodeForm({ passType }: ClaimCodeFormProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [claimCode, setClaimCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [claimedCity, setClaimedCity] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!claimCode.trim()) {
      setError('Please enter your claim code');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: claimError } = await supabase.functions.invoke('founders-claim-pass', {
        body: { claimCode: claimCode.trim(), passType },
      });

      if (claimError) throw claimError;
      if (data?.error) {
        setError(data.error);
        return;
      }

      setSuccess(true);
      setClaimedCity(data?.city || '');
      toast.success('Founders Pass claimed successfully!');
    } catch (err: any) {
      setError(err?.message || 'Failed to claim pass. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    const homePath = passType === 'venue' ? '/venue/home' : '/app/feed/immersive';
    return (
      <div className="mx-auto max-w-lg text-center py-12">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mb-3 text-2xl font-bold text-foreground">Pass Claimed Successfully!</h2>
        <p className="mb-6 text-muted-foreground">
          Your {passType === 'venue' ? 'Venue' : 'City'} Founders License{claimedCity ? ` for ${claimedCity}` : ''} is now active.
        </p>
        <Button size="lg" onClick={() => navigate(homePath)}>
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  const citiesPath = passType === 'venue' ? '/venue/founders/cities' : '/app/founders/cities';

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <Key className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Claim Your {passType === 'venue' ? 'Venue' : ''} Founders Pass</h1>
        <p className="text-muted-foreground">Enter the claim code from your purchase confirmation email.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="claimCode">Claim Code</Label>
          <Input
            id="claimCode"
            type="text"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
            className="text-center font-mono text-lg tracking-wider"
            maxLength={24}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
          ) : (
            'Claim Pass'
          )}
        </Button>
      </form>

      <div className="mt-8 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 font-semibold text-foreground">Don't have a claim code?</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Purchase a Founders Pass first, then check your email for the claim code.
        </p>
        <Button variant="outline" className="w-full" onClick={() => navigate(citiesPath)}>
          Browse Cities
        </Button>
      </div>
    </div>
  );
}

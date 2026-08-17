import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Building2, Landmark, Loader2, Lock, RefreshCw } from "lucide-react";
import { PaymentStatus } from "@/components/Payment/PaymentStatus";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePaymentSecurity } from "@/hooks/usePaymentSecurity";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';
import "./user-withdraw-modal.css";

interface UserWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  balance: number;
  pendingBalance?: number;
  pendingUntil?: string | null;
  onSuccess?: () => void;
}

const WITHDRAWAL_FEE = 1.00;
const MIN_WITHDRAWAL = 10;
const MAX_WITHDRAWAL = 500;

type Step = 'amount' | 'pin' | 'processing' | 'success' | 'error';

export default function UserWithdrawModal({ 
  open, onClose, balance, pendingBalance = 0, pendingUntil, onSuccess 
}: UserWithdrawModalProps) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [connectStatus, setConnectStatus] = useState<{ stripe_account_id: string | null; stripe_payouts_enabled: boolean | null } | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pinDigits, setPinDigits] = useState<string[]>(Array(6).fill(''));
  const [pinError, setPinError] = useState('');
  const { toast } = useToast();
  const { verifyPin } = usePaymentSecurity();
  const { user } = useAuth();

  const availableBalance = balance - pendingBalance;
  const numAmount = parseFloat(amount) || 0;
  const netPayout = numAmount - WITHDRAWAL_FEE;
  const isValid = numAmount >= MIN_WITHDRAWAL && numAmount <= MAX_WITHDRAWAL && numAmount <= availableBalance && netPayout > 0;

  // Check Stripe Connect status on open
  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from('customer_profiles')
      .select('stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setConnectStatus(data);
      });
  }, [open, user]);

  const resetModal = () => {
    setStep('amount');
    setAmount('');
    setPinDigits(Array(6).fill(''));
    setPinError('');
    setErrorMsg('');
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handlePinDigitChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const current = [...pinDigits];
    current[index] = value;
    setPinDigits(current);
    if (value && index < 5) {
      document.getElementById(`user-pin-${index + 1}`)?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      document.getElementById(`user-pin-${index - 1}`)?.focus();
    }
  };

  const handleVerifyAndWithdraw = async () => {
    const pin = pinDigits.join('');
    if (pin.length !== 6) return;

    setLoading(true);
    setPinError('');

    try {
      const result = await verifyPin(pin);
      if (!result.success || !result.verified) {
        setPinError(result.message || t('withdraw_modal.invalid_pin'));
        setPinDigits(Array(6).fill(''));
        setLoading(false);
        return;
      }

      // PIN verified — process withdrawal
      setStep('processing');

      const { data, error } = await supabase.functions.invoke('process-withdrawal', {
        body: { amount: numAmount }
      });

      if (error) throw error;

      if (data?.needs_connect_setup) {
        setStep('amount');
        setConnectStatus({ stripe_account_id: null, stripe_payouts_enabled: null });
        toast({ title: t('withdraw_modal.payout_setup_required'), description: t('withdraw_modal.payout_setup_required_desc'), variant: "destructive" });
        return;
      }

      if (!data?.success) throw new Error(data?.error || t('withdraw_modal.withdrawal_failed'));

      setStep('success');
      toast({ title: t('withdraw_modal.submitted_title'), description: `$${netPayout.toFixed(2)} ${t('withdraw_modal.desc_processing')}` });

      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 2500);

    } catch (err: any) {
      setErrorMsg(err?.message || t('withdraw_modal.unknown_error'));
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="customer-dialog-surface user-withdraw-dialog user-withdraw-dialog--status">
          <div className="user-withdraw-modal__status">
            <PaymentStatus
              state="success"
              title={t('withdraw_modal.submitted_title')}
              subtitle={t('withdraw_modal.submitted_desc', { amount: netPayout.toFixed(2) })}
              amount={`$${netPayout.toFixed(2)}`}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (step === 'error') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="customer-dialog-surface user-withdraw-dialog user-withdraw-dialog--status">
          <div className="user-withdraw-modal__status user-withdraw-modal__status--error">
            <PaymentStatus
              state="error"
              title={t('withdraw_modal.failed_title')}
              subtitle={errorMsg}
            />
            <Button
              onClick={() => { setStep('amount'); setErrorMsg(''); }}
              variant="outline"
              className="user-withdraw-modal__secondary-action"
            >
              {t('withdraw_modal.try_again')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="customer-dialog-surface user-withdraw-dialog">
        <DialogHeader className="user-withdraw-modal__header">
          <DialogTitle className="user-withdraw-modal__title">
            {step === 'amount' && t('withdraw_modal.title_amount')}
            {step === 'pin' && t('withdraw_modal.title_pin')}
            {step === 'processing' && t('withdraw_modal.title_processing')}
          </DialogTitle>
          <DialogDescription className="user-withdraw-modal__intro">
            {step === 'amount' && t('withdraw_modal.desc_amount', { fee: WITHDRAWAL_FEE.toFixed(2) })}
            {step === 'pin' && t('withdraw_modal.desc_pin')}
            {step === 'processing' && t('withdraw_modal.desc_processing')}
          </DialogDescription>
        </DialogHeader>

        {/* STEP: Amount */}
        {step === 'amount' && (
          <div className="user-withdraw-modal__content">
            {/* No Connect account */}
            {!connectStatus?.stripe_account_id && (
              <div className="user-withdraw-modal__setup">
                <div className="user-withdraw-modal__icon" aria-hidden="true">
                  <Landmark />
                </div>
                <h3>{t('withdraw_modal.setup_payout_account')}</h3>
                <p className="user-withdraw-modal__copy">
                  {t('withdraw_modal.setup_desc')}
                </p>
                <Button
                  onClick={async () => {
                    setConnectLoading(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('connect-onboard', {
                        body: { account_type: 'user' }
                      });
                      if (error) throw error;
                      if (data?.onboarding_url) {
                        window.open(data.onboarding_url, '_blank');
                        toast({ title: t('withdraw_modal.stripe_setup_title'), description: t('withdraw_modal.stripe_setup_desc') });
                      }
                    } catch (err: any) {
                      toast({ title: t('app.error'), description: err?.message || t('withdraw_modal.setup_failed'), variant: "destructive" });
                    } finally { setConnectLoading(false); }
                  }}
                  disabled={connectLoading}
                  className="user-withdraw-modal__primary-action"
                >
                  {connectLoading ? <Loader2 className="animate-spin" /> : <Building2 />}
                  <span>{t('withdraw_modal.setup_payout_account')}</span>
                </Button>
              </div>
            )}

            {/* Account exists but payouts not enabled */}
            {connectStatus?.stripe_account_id && !connectStatus?.stripe_payouts_enabled && (
              <div className="user-withdraw-modal__setup">
                <div className="user-withdraw-modal__icon" aria-hidden="true">
                  <Landmark />
                </div>
                <h3>{t('withdraw_modal.complete_payout_setup')}</h3>
                <p className="user-withdraw-modal__copy">
                  {t('withdraw_modal.complete_setup_desc')}
                </p>
                <div className="user-withdraw-modal__connect-actions">
                  <Button onClick={async () => {
                    setConnectLoading(true);
                    try {
                      const { data } = await supabase.functions.invoke('connect-refresh', {
                        body: { action: 'refresh', account_type: 'user' }
                      });
                      if (data?.onboarding_url) window.open(data.onboarding_url, '_blank');
                    } catch (err: any) { toast({ title: t('app.error'), description: err?.message, variant: "destructive" }); }
                    finally { setConnectLoading(false); }
                  }} className="user-withdraw-modal__primary-action" disabled={connectLoading}>
                    {connectLoading ? <Loader2 className="animate-spin" /> : <Building2 />}
                    <span>{t('withdraw_modal.complete_setup')}</span>
                  </Button>
                  <Button variant="outline" onClick={async () => {
                    const { data } = await supabase.functions.invoke('connect-refresh', {
                      body: { action: 'status', account_type: 'user' }
                    });
                    if (data) setConnectStatus(prev => ({
                      ...prev!,
                      stripe_payouts_enabled: data.payouts_enabled,
                    }));
                  }} className="user-withdraw-modal__secondary-action">
                    <RefreshCw />
                    <span>{t('withdraw_modal.refresh')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Payouts enabled — normal flow */}
            {connectStatus?.stripe_payouts_enabled && (
              <div className="user-withdraw-modal__form">
                <div className="user-withdraw-modal__balance">
                  <p>{t('withdraw_modal.available_withdrawal')}</p>
                  <strong>${availableBalance.toFixed(2)}</strong>
                  {pendingBalance > 0 && (
                    <div className="user-withdraw-modal__pending">
                      <AlertCircle aria-hidden="true" />
                      <span>
                        {t('withdraw_modal.pending_processing', { amount: pendingBalance.toFixed(2) })}
                        {pendingUntil && t('withdraw_modal.clears_on', { date: new Date(pendingUntil).toLocaleDateString() })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="user-withdraw-modal__field">
                  <Label className="user-withdraw-modal__label">{t('withdraw_modal.amount_label')}</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    max={Math.min(MAX_WITHDRAWAL, availableBalance)}
                    step="0.01"
                    className="user-withdraw-modal__amount-input"
                  />
                  <div className="user-withdraw-modal__amount-meta">
                    <span>{t('withdraw_modal.min_max', { min: MIN_WITHDRAWAL, max: MAX_WITHDRAWAL })}</span>
                    <button type="button" onClick={() => setAmount(Math.min(MAX_WITHDRAWAL, availableBalance).toString())}>
                      {t('withdraw_modal.use_max')}
                    </button>
                  </div>
                </div>

                {numAmount > 0 && (
                  <div className="user-withdraw-modal__breakdown">
                    <div>
                      <span>{t('withdraw_modal.amount')}</span>
                      <span>${numAmount.toFixed(2)}</span>
                    </div>
                    <div className="user-withdraw-modal__fee">
                      <span>{t('withdraw_modal.platform_fee')}</span>
                      <span>-${WITHDRAWAL_FEE.toFixed(2)}</span>
                    </div>
                    <div className="user-withdraw-modal__total">
                      <span>{t('withdraw_modal.youll_receive')}</span>
                      <span className={netPayout > 0 ? 'user-withdraw-modal__total-value' : 'user-withdraw-modal__total-value user-withdraw-modal__total-value--invalid'}>
                        ${Math.max(0, netPayout).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => setStep('pin')}
                  disabled={!isValid}
                  className="user-withdraw-modal__primary-action" size="lg"
                >
                  <Lock />
                  <span>{t('withdraw_modal.continue_verify')}</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* STEP: PIN */}
        {step === 'pin' && (
          <div className="user-withdraw-modal__content user-withdraw-modal__pin">
            <div className="user-withdraw-modal__pin-head">
              <div className="user-withdraw-modal__icon" aria-hidden="true">
                <Lock />
              </div>
              <p className="user-withdraw-modal__pin-amount">{t('withdraw_modal.withdrawing_amount', { amount: netPayout.toFixed(2) })}</p>
              <p className="user-withdraw-modal__copy">{t('withdraw_modal.enter_pin_hint')}</p>
            </div>

            <div className="user-withdraw-modal__pin-inputs">
              {pinDigits.map((digit, i) => (
                <Input
                  key={i}
                  id={`user-pin-${i}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinDigitChange(i, e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  className="user-withdraw-modal__pin-input"
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {pinError && <p className="user-withdraw-modal__pin-error">{pinError}</p>}

            <Button
              onClick={handleVerifyAndWithdraw}
              disabled={loading || pinDigits.some(d => !d)}
              className="user-withdraw-modal__primary-action" size="lg"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Lock />}
              {!loading && <span>{t('withdraw_modal.verify_withdraw')}</span>}
            </Button>

            <Button variant="outline" onClick={() => { setStep('amount'); setPinDigits(Array(6).fill('')); setPinError(''); }} className="user-withdraw-modal__secondary-action">
              {t('withdraw_modal.back')}
            </Button>
          </div>
        )}

        {/* STEP: Processing */}
        {step === 'processing' && (
          <div className="user-withdraw-modal__status">
            <PaymentStatus
              state="processing"
              title={t('withdraw_modal.processing_title')}
              subtitle={t('withdraw_modal.please_wait')}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

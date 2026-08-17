import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, Building2, Check, Copy, CreditCard, Globe, Info, Loader2 } from 'lucide-react';
import { XrpIcon } from '@/components/icons/XrpIcon';
import { useJVCoinWallet } from '@/hooks/useJVCoinWallet';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from '@/hooks/use-toast';
import { getPaymentRailForCountry } from '@/config/countryRouting';
import { useTranslation } from 'react-i18next';
import { CryptoDepositPanel } from '@/components/wallet/CryptoDepositPanel';
import CryptoSandboxPanel from '@/components/wallet/CryptoSandboxPanel';
import './deposit-modal.css';

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
}

const QUICK_AMOUNTS_USD = [10, 25, 50, 100, 500];

const getUserCountryCode = () => {
  const saved = localStorage.getItem('jv_signup_country') || localStorage.getItem('jv_user_country_code');
  if (saved) return saved.toUpperCase();

  const locale = navigator.language || 'en-US';
  return (locale.split('-')[1] || 'US').toUpperCase();
};

export const DepositModal: React.FC<DepositModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation('common');
  const userCountryCode = getUserCountryCode();
  const paymentRail = getPaymentRailForCountry(userCountryCode);
  const isGatewayCountry = paymentRail === 'gateway';
  const isHybridCountry = paymentRail === 'both';
  const isBlockedCountry = paymentRail === 'blocked';
  const showStripeMethods = paymentRail === 'stripe' || isHybridCountry;
  const showCryptoMethod = isGatewayCountry || isHybridCountry;
  const availableMethodCount = (showStripeMethods ? 2 : 0) + (showCryptoMethod ? 1 : 0);

  const [amountLocal, setAmountLocal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [depositMethod, setDepositMethod] = useState<'card' | 'bank' | 'payid' | 'crypto'>(() => (
    isGatewayCountry ? 'crypto' : 'card'
  ));
  const [instructions, setInstructions] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const { depositWithCard, depositWithBankTransfer, depositWithPayID, depositWithTopup } = useJVCoinWallet();
  const {
    userCurrency,
    localToJvc,
    usdToLocal,
    formatCurrency,
    getCurrencyInfo,
    JVC_TO_USD,
  } = useCurrency();

  const quickAmountsLocal = QUICK_AMOUNTS_USD.map((usd) => Math.round(usdToLocal(usd)));
  const jvcAmount = localToJvc(amountLocal);
  const usdEquivalent = jvcAmount * JVC_TO_USD;
  const currencyInfo = getCurrencyInfo();

  useEffect(() => {
    if (isGatewayCountry && depositMethod !== 'crypto') {
      setDepositMethod('crypto');
    }
    if (isBlockedCountry) {
      setDepositMethod('crypto');
    }
  }, [depositMethod, isBlockedCountry, isGatewayCountry]);

  const handleQuickAmount = (quickAmount: number) => {
    setAmountLocal((previous) => previous + quickAmount);
  };

  const handleDeposit = async () => {
    if (isBlockedCountry) {
      toast({
        title: t('deposit_modal.region_not_supported_title'),
        description: t('deposit_modal.region_not_supported_desc'),
        variant: 'destructive',
      });
      return;
    }

    if (depositMethod === 'crypto') {
      toast({
        title: t('deposit_modal.crypto_ready_title', 'Crypto deposit address ready'),
        description: t('deposit_modal.crypto_ready_desc', 'Send XRP or RLUSD using the address and destination tag shown above.'),
      });
      return;
    }

    if (amountLocal <= 0) {
      toast({
        title: t('deposit_modal.invalid_amount_title'),
        description: t('deposit_modal.invalid_amount_desc'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setInstructions(null);

    try {
      const amountUsd = usdEquivalent;

      if (isGatewayCountry && (depositMethod === 'card' || depositMethod === 'bank')) {
        const result = await depositWithTopup(amountUsd, userCurrency, userCountryCode);

        if (result?.error === 'GATEWAY_NOT_ENABLED') {
          toast({
            title: t('deposit_modal.region_not_supported_title'),
            description: t('deposit_modal.region_not_supported_desc'),
          });
          return;
        }

        if (result?.success) {
          onClose();
        } else {
          toast({
            title: t('deposit_modal.deposit_failed'),
            description: result?.error || t('deposit_modal.please_try_again'),
            variant: 'destructive',
          });
        }
        return;
      }

      let result;

      switch (depositMethod) {
        case 'card':
          result = await depositWithCard(amountUsd, userCurrency);
          if (result.success && result.payment_url) {
            onClose();
          }
          break;
        case 'bank':
          result = await depositWithBankTransfer(amountUsd, userCurrency);
          if (result.success && result.payment_url) {
            onClose();
          }
          break;
        case 'payid':
          result = await depositWithPayID(amountUsd);
          if (result.success && result.instructions) {
            setInstructions({
              ...result.instructions,
              jvcAmount,
              localAmount: amountLocal,
              localCurrency: userCurrency,
            });
          }
          break;
      }

      if (result?.success && !result?.instructions) {
        if (depositMethod === 'card' && result.status === 'completed') {
          onClose();
        }
      } else if (!result?.success) {
        toast({
          title: t('deposit_modal.deposit_failed'),
          description: result?.error || t('deposit_modal.please_try_again'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Deposit error:', error);
      toast({
        title: t('deposit_modal.error'),
        description: t('deposit_modal.something_went_wrong'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: t('deposit_modal.copied'), description: t('deposit_modal.address_copied') });
  };

  const resetModal = () => {
    setAmountLocal(0);
    setInstructions(null);
    setCopied(false);
  };

  const tabColumns = availableMethodCount === 3
    ? 'wallet-deposit-modal__methods--three'
    : availableMethodCount === 2
      ? 'wallet-deposit-modal__methods--two'
      : 'wallet-deposit-modal__methods--one';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { resetModal(); onClose(); } }}>
      <DialogContent className="customer-dialog-surface customer-dialog-surface--wide wallet-deposit-dialog !gap-0 !p-0">
        <DialogHeader className="wallet-deposit-modal__header !space-y-0">
          <DialogTitle>{t('deposit_modal.title')}</DialogTitle>
          <DialogDescription>
            <Globe />
            {depositMethod === 'crypto'
              ? `Wallet shown in ${userCurrency} - Deposit in XRP / RLUSD`
              : t('deposit_modal.paying_in', { name: currencyInfo.name, currency: userCurrency })}
          </DialogDescription>
        </DialogHeader>

        {!instructions ? (
          <>
            <div className={`wallet-deposit-modal__body ${depositMethod === 'crypto' ? '' : 'wallet-deposit-modal__body--single'}`}>
              <div className="wallet-deposit-modal__primary">
                <Tabs value={depositMethod} onValueChange={(value) => setDepositMethod(value as typeof depositMethod)} className="wallet-deposit-modal__tabs">
                  {availableMethodCount > 0 && (
                    <TabsList className={`wallet-deposit-modal__methods ${tabColumns}`}>
                      {showStripeMethods && (
                        <TabsTrigger value="card" className="wallet-deposit-modal__method">
                          <CreditCard />
                          {t('deposit_modal.card')}
                        </TabsTrigger>
                      )}
                      {showStripeMethods && (
                        <TabsTrigger value="bank" className="wallet-deposit-modal__method">
                          <Building2 />
                          {t('deposit_modal.bank')}
                        </TabsTrigger>
                      )}
                      {showCryptoMethod && (
                        <TabsTrigger value="crypto" className="wallet-deposit-modal__method">
                          <XrpIcon />
                          Crypto
                        </TabsTrigger>
                      )}
                    </TabsList>
                  )}

                  {depositMethod !== 'crypto' && (
                    <div className="wallet-deposit-modal__amount">
                      <label>
                        {t('deposit_modal.amount_label', { currency: userCurrency })}
                        <Badge variant="outline">{currencyInfo.symbol}</Badge>
                      </label>
                      <Input
                        type="number"
                        value={amountLocal || ''}
                        onChange={(event) => setAmountLocal(Number(event.target.value))}
                        placeholder={t('deposit_modal.enter_amount', { currency: userCurrency })}
                      />
                      <div className="wallet-deposit-modal__quick-amounts">
                        {quickAmountsLocal.map((quickAmount) => (
                          <Button
                            key={quickAmount}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickAmount(quickAmount)}
                          >
                            +{currencyInfo.symbol}{quickAmount}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {amountLocal > 0 && depositMethod !== 'crypto' && (
                    <div className="wallet-deposit-modal__conversion">
                      <div className="wallet-deposit-modal__conversion-row">
                        <span>{t('deposit_modal.you_pay')}</span>
                        <strong>{formatCurrency(amountLocal)}</strong>
                      </div>
                      <div className="wallet-deposit-modal__conversion-arrow">
                        <ArrowRight />
                      </div>
                      <div className="wallet-deposit-modal__conversion-row wallet-deposit-modal__conversion-row--receive">
                        <span>{t('deposit_modal.you_receive')}</span>
                        <strong>{formatCurrency(amountLocal)}</strong>
                      </div>
                    </div>
                  )}

                  <TabsContent value="card" className="mt-4">
                    <p className="wallet-deposit-modal__payment-copy">{t('deposit_modal.card_desc')}</p>
                    <p className="wallet-deposit-modal__payment-copy">{t('deposit_modal.card_fee_hint')}</p>
                    {amountLocal > 0 && (
                      <p className="wallet-deposit-modal__payment-copy wallet-deposit-modal__payment-copy--success">
                        {t('deposit_modal.card_total_hint', { amount: formatCurrency(amountLocal + (usdEquivalent * 0.029 + 0.30) * (amountLocal / usdEquivalent)) })}
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="bank" className="mt-4">
                    <p className="wallet-deposit-modal__payment-copy">{t('deposit_modal.bank_desc')}</p>
                    <p className="wallet-deposit-modal__payment-copy wallet-deposit-modal__payment-copy--success">{t('deposit_modal.bank_fee_hint')}</p>
                  </TabsContent>

                  <TabsContent value="crypto" className="mt-4">
                    {showCryptoMethod ? <CryptoDepositPanel showSandbox={false} /> : (
                      <p className="wallet-deposit-modal__payment-copy">{t('deposit_modal.region_not_supported_desc')}</p>
                    )}
                  </TabsContent>
                </Tabs>
              </div>

              {depositMethod === 'crypto' && (
                <aside className="wallet-deposit-modal__side">
                  {isGatewayCountry && (
                    <section className="wallet-deposit-modal__notice">
                      <XrpIcon />
                      <div>
                        <strong>Crypto gateway active for {userCountryCode}</strong>
                        <p>Card and bank deposits are hidden for this country. Use the XRP Ledger test address below to test crypto or stablecoin deposits.</p>
                      </div>
                    </section>
                  )}
                  <CryptoSandboxPanel />
                </aside>
              )}
            </div>

            <div className="wallet-deposit-modal__footer">
              {depositMethod === 'crypto' ? (
                <Button type="button" onClick={handleDeposit} size="lg">
                  <Info />
                  Crypto deposit address shown
                </Button>
              ) : (
                <Button type="button" onClick={handleDeposit} disabled={amountLocal <= 0 || loading} size="lg">
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {t('deposit_modal.processing')}
                    </>
                  ) : (
                    t('deposit_modal.deposit_button', { amount: formatCurrency(amountLocal) })
                  )}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="wallet-deposit-modal__body wallet-deposit-modal__body--single">
              <div className="wallet-deposit-modal__primary">
                <div className="wallet-deposit-modal__instructions">
                  {instructions.payid && (
                    <div className="wallet-deposit-modal__instruction-field">
                      <label>{t('deposit_modal.payid')}</label>
                      <div className="wallet-deposit-modal__instruction-value">
                        <span>{instructions.payid}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => copyToClipboard(instructions.payid)}>
                          {copied ? <Check className="text-green-500" /> : <Copy />}
                        </Button>
                      </div>
                    </div>
                  )}

                  {instructions.address && (
                    <div className="wallet-deposit-modal__instruction-field">
                      <label>{t('deposit_modal.xrp_address')}</label>
                      <div className="wallet-deposit-modal__instruction-value">
                        <span>{instructions.address}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => copyToClipboard(instructions.address)}>
                          {copied ? <Check className="text-green-500" /> : <Copy />}
                        </Button>
                      </div>
                    </div>
                  )}

                  {instructions.reference && (
                    <div className="wallet-deposit-modal__instruction-field">
                      <label>{t('deposit_modal.reference_important')}</label>
                      <div className="wallet-deposit-modal__instruction-value">
                        <span>{instructions.reference}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => copyToClipboard(instructions.reference)}>
                          {copied ? <Check className="text-green-500" /> : <Copy />}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="wallet-deposit-modal__instruction-summary">
                    <label>{t('deposit_modal.you_will_receive')}</label>
                    <p>{formatCurrency(instructions.localAmount)}</p>
                    <p>{t('deposit_modal.after_deposit_confirmed')}</p>
                  </div>

                  {instructions.message && (
                    <p className="wallet-deposit-modal__instruction-message">{instructions.message}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="wallet-deposit-modal__footer">
              <Button type="button" variant="outline" onClick={() => setInstructions(null)}>
                {t('deposit_modal.back')}
              </Button>
              <Button type="button" onClick={onClose}>
                {t('deposit_modal.done')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

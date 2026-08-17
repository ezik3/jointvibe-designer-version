import { useState } from 'react';
import { FlaskConical, Lock, Plus, ArrowDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCryptoSandbox } from '@/hooks/useCryptoSandbox';
import { useCurrency } from '@/hooks/useCurrency';

const QUICK_AMOUNTS_USD = [10, 50, 100, 500];

export default function CryptoSandboxPanel() {
  const { balance, eligible, loading, simulateDeposit } = useCryptoSandbox();
  const { usdToLocal, localToUsd, formatCurrency, getCurrencyInfo, userCurrency } = useCurrency();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading && !balance) return null;
  if (!eligible && (!balance || balance.total_granted_usd === 0)) return null;

  const currencyInfo = getCurrencyInfo();
  const decimals = currencyInfo.decimals;

  const addToAmount = (usd: number) => {
    const localAdd = usdToLocal(usd);
    const current = Number(amount) || 0;
    setAmount((current + localAdd).toFixed(decimals));
  };

  const handleDeposit = async () => {
    const local = Number(amount);
    if (!local) return;

    setSubmitting(true);
    const ok = await simulateDeposit(localToUsd(local));
    setSubmitting(false);
    if (ok) setAmount('');
  };

  return (
    <section className="wallet-deposit-sandbox">
      <div className="wallet-deposit-sandbox__title">
        <span>
          <FlaskConical />
          Crypto sandbox
        </span>
        {balance?.is_locked && (
          <span>
            <Lock /> Locked
          </span>
        )}
      </div>

      <div>
        <p className="wallet-deposit-sandbox__balance-label">Test balance</p>
        <p className="wallet-deposit-sandbox__balance">
          {formatCurrency(usdToLocal(balance?.balance_usd ?? 0))}
        </p>
        <p className="wallet-deposit-sandbox__meta">
          Granted {formatCurrency(usdToLocal(balance?.total_granted_usd ?? 0))} | Spent {formatCurrency(usdToLocal(balance?.total_spent_usd ?? 0))}
        </p>
      </div>

      {balance?.is_locked ? (
        <div className="wallet-deposit-sandbox__locked">
          Sandbox locked. You have made a real on-chain deposit, so crypto activity now uses real funds.
        </div>
      ) : eligible ? (
        <div>
          <div className="wallet-deposit-sandbox__quick">
            {QUICK_AMOUNTS_USD.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => addToAmount(value)}
              >
                <Plus />
                {formatCurrency(usdToLocal(value))}
              </Button>
            ))}
          </div>
          <div className="wallet-deposit-sandbox__form">
            <Input
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Enter amount in ${userCurrency}`}
            />
            <Button type="button" disabled={submitting || !Number(amount)} onClick={handleDeposit}>
              <ArrowDownLeft />
              Deposit
            </Button>
          </div>
          <p className="wallet-deposit-sandbox__note">
            Test funds only. Shown in {userCurrency}, settled internally as USD-pegged JVC. Cannot pay real venues and is removed after a real crypto deposit.
          </p>
        </div>
      ) : (
        <p className="wallet-deposit-sandbox__note">
          Sandbox available only while you're an active tester for a venue.
        </p>
      )}
    </section>
  );
}

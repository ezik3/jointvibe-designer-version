import { useState } from 'react';
import { Copy, Check, Loader2, Clock } from 'lucide-react';
import { useCryptoDeposit } from '@/hooks/useCryptoDeposit';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { XrpIcon } from '@/components/icons/XrpIcon';
import CryptoSandboxPanel from '@/components/wallet/CryptoSandboxPanel';

interface CryptoDepositPanelProps {
  showSandbox?: boolean;
}

export const CryptoDepositPanel = ({ showSandbox = true }: CryptoDepositPanelProps) => {
  const { address, deposits, loading, error } = useCryptoDeposit();
  const [copied, setCopied] = useState<'addr' | 'tag' | null>(null);

  const copy = (text: string, which: 'addr' | 'tag') => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    toast({ title: 'Copied' });
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading && !address) {
    return (
      <section className="wallet-deposit-crypto wallet-deposit-crypto--status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (error) {
    return <section className="wallet-deposit-crypto wallet-deposit-crypto--status text-sm text-destructive">{error}</section>;
  }

  if (!address) return null;

  return (
    <div className="wallet-deposit-crypto-stack">
      <section className="wallet-deposit-crypto">
        <div className="wallet-deposit-crypto__head">
          <div>
            <XrpIcon />
            <h3>Deposit with crypto</h3>
          </div>
          <span className="wallet-deposit-crypto__network">
            {address.network.includes('testnet') ? 'Testnet' : 'Mainnet'}
          </span>
        </div>

        <p className="wallet-deposit-crypto__intro">
          Send <strong>XRP</strong> or <strong>RLUSD</strong> on the XRP Ledger to the address below. You must include the
          destination tag so the funds can be credited.
        </p>

        <div className="wallet-deposit-crypto__field">
          <span>Address</span>
          <button
            type="button"
            onClick={() => copy(address.address, 'addr')}
            className="wallet-deposit-crypto__field-value"
            aria-label="Copy crypto deposit address"
          >
            <code>{address.address}</code>
            <span className="wallet-deposit-crypto__copy" aria-hidden="true">
              {copied === 'addr' ? <Check /> : <Copy />}
            </span>
          </button>
        </div>

        <div className="wallet-deposit-crypto__field">
          <span>Destination tag (required)</span>
          <button
            type="button"
            onClick={() => copy(String(address.destination_tag), 'tag')}
            className="wallet-deposit-crypto__field-value wallet-deposit-crypto__field-value--tag"
            aria-label="Copy crypto destination tag"
          >
            <code>{address.destination_tag}</code>
            <span className="wallet-deposit-crypto__copy" aria-hidden="true">
              {copied === 'tag' ? <Check /> : <Copy />}
            </span>
          </button>
        </div>

        <div className="wallet-deposit-crypto__hold">
          <div className="wallet-deposit-crypto__hold-title">
            <Clock /> Hold periods
          </div>
          <ul>
            <li>Spendable in-app (50%) immediately after confirmation</li>
            <li>Full balance available after 72 hours</li>
            <li>Crypto withdrawal locked for 7 days from deposit</li>
          </ul>
        </div>

        {deposits.length > 0 && (
          <div className="wallet-deposit-crypto__recent">
            <h4>Recent crypto deposits</h4>
            {deposits.slice(0, 5).map((deposit) => (
              <div key={deposit.id} className="wallet-deposit-crypto__recent-item">
                <div>
                  <strong>{Number(deposit.amount_received).toFixed(4)} {deposit.asset_received}</strong>
                  <small>{formatDistanceToNow(new Date(deposit.detected_at), { addSuffix: true })}</small>
                </div>
                <div>
                  <strong>${Number(deposit.usd_value_at_receipt).toFixed(2)}</strong>
                  <small>{deposit.status}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showSandbox && <CryptoSandboxPanel />}
    </div>
  );
};

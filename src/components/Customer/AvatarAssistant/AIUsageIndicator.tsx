import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAIUsage } from '@/hooks/useAIUsage';
import { useAITopup, TOKEN_PACKAGES } from '@/hooks/useAITopup';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AIUsageIndicatorProps {
  compact?: boolean;
}

export default function AIUsageIndicator({ compact = false }: AIUsageIndicatorProps) {
  const { t } = useTranslation('common');
  const { usage, isLoading } = useAIUsage();
  const { packages, purchaseWithWallet, isProcessing, walletBalance } = useAITopup();
  const [showTopup, setShowTopup] = useState(false);

  if (isLoading || !usage) {
    return null;
  }

  const getUsageColor = () => {
    if (usage.isUnlimited) return 'text-primary';
    if (usage.percentUsed > 90) return 'text-destructive';
    if (usage.percentUsed > 70) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const getProgressColor = () => {
    if (usage.isUnlimited) return 'bg-primary';
    if (usage.percentUsed > 90) return 'bg-destructive';
    if (usage.percentUsed > 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const formatTokens = (tokens: number) => {
    if (tokens < 0) return '∞';
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return String(tokens);
  };

  const handlePurchase = async (index: number) => {
    const success = await purchaseWithWallet(index);
    if (success) {
      setShowTopup(false);
    }
  };

  if (compact) {
    return (
      <>
        <button
          onClick={() => setShowTopup(true)}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${getUsageColor()} bg-background/60 backdrop-blur-sm border border-border/30 hover:bg-background/80`}
        >
          <Zap className="w-3 h-3" />
          <span>{formatTokens(usage.remainingTokens)}</span>
          {!usage.isUnlimited && usage.percentUsed > 80 && (
            <Plus className="w-3 h-3" />
          )}
        </button>

        <TopupDialog
          open={showTopup}
          onOpenChange={setShowTopup}
          usage={usage}
          packages={packages}
          walletBalance={walletBalance}
          isProcessing={isProcessing}
          onPurchase={handlePurchase}
          formatTokens={formatTokens}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-background/60 backdrop-blur-sm border border-border/30">
        <div className="flex items-center gap-1.5">
          <Zap className={`w-4 h-4 ${getUsageColor()}`} />
          <span className="text-xs font-medium">
            {formatTokens(usage.remainingTokens)} left
          </span>
        </div>
        
        {!usage.isUnlimited && (
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${getProgressColor()}`}
              initial={{ width: 0 }}
              animate={{ width: `${100 - usage.percentUsed}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setShowTopup(true)}
        >
          <Plus className="w-3 h-3 mr-1" />
          Top Up
        </Button>
      </div>

      <TopupDialog
        open={showTopup}
        onOpenChange={setShowTopup}
        usage={usage}
        packages={packages}
        walletBalance={walletBalance}
        isProcessing={isProcessing}
        onPurchase={handlePurchase}
        formatTokens={formatTokens}
      />
    </>
  );
}

interface TopupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usage: NonNullable<ReturnType<typeof useAIUsage>['usage']>;
  packages: typeof TOKEN_PACKAGES;
  walletBalance: number;
  isProcessing: boolean;
  onPurchase: (index: number) => void;
  formatTokens: (tokens: number) => string;
}

function TopupDialog({
  open,
  onOpenChange,
  usage,
  packages,
  walletBalance,
  isProcessing,
  onPurchase,
  formatTokens,
}: TopupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="customer-dialog-surface max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Get More AI Tokens
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current balance */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Current tokens</span>
              <span className="font-semibold">{formatTokens(usage.remainingTokens)}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-muted-foreground">Wallet balance</span>
              <span className="font-semibold">{walletBalance.toFixed(2)} JVC</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-muted-foreground">Current plan</span>
              <span className="font-semibold capitalize">{usage.plan}</span>
            </div>
          </div>

          {/* Package options */}
          <div className="space-y-2">
            {packages.map((pkg, index) => (
              <motion.button
                key={pkg.tokens}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onPurchase(index)}
                disabled={isProcessing || walletBalance < pkg.priceJVC}
                className={`w-full p-3 rounded-lg border transition-colors flex justify-between items-center ${
                  walletBalance >= pkg.priceJVC
                    ? 'bg-background hover:bg-muted border-border'
                    : 'bg-muted/30 border-border/50 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="font-medium">{pkg.label}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{pkg.priceJVC} JVC</div>
                  <div className="text-xs text-muted-foreground">${pkg.priceUSD}</div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Info text */}
          <p className="text-xs text-muted-foreground text-center">
            Venue ordering AI is always free. These tokens are for personal assistant features.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

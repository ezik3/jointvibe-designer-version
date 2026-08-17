import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useOfflinePaymentQueue } from '@/hooks/useOfflinePaymentQueue';
import { useTranslation } from 'react-i18next';
import "./pos-popovers.css";

export const OfflinePaymentIndicator: React.FC = () => {
  const { t } = useTranslation('pos');
  const {
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    syncQueue,
    getFailedPayments,
    retryPayment,
    removeFromQueue,
    clearSynced,
  } = useOfflinePaymentQueue();

  const failedPayments = getFailedPayments();
  const hasIssues = pendingCount > 0 || failedCount > 0;

  if (isOnline && !hasIssues) {
    return null; // Don't show anything when online and no pending payments
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`pos-offline-payment__trigger relative ${!isOnline ? 'is-offline' : hasIssues ? 'has-issues' : ''}`}
        >
          <AnimatePresence mode="wait">
            {!isOnline ? (
              <motion.div
                key="offline"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <WifiOff className="h-5 w-5" />
              </motion.div>
            ) : isSyncing ? (
              <motion.div
                key="syncing"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              >
                <RefreshCw className="h-5 w-5" />
              </motion.div>
            ) : hasIssues ? (
              <motion.div
                key="pending"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <CloudOff className="h-5 w-5" />
              </motion.div>
            ) : (
              <motion.div
                key="online"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Wifi className="h-5 w-5 text-emerald-500" />
              </motion.div>
            )}
          </AnimatePresence>

          {hasIssues && (
            <Badge
              variant="destructive"
              className="pos-offline-payment__count absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center"
            >
              {pendingCount + failedCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="pos-offline-payment-popover" align="end">
        <div className="pos-offline-payment__content">
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <Wifi className="h-4 w-4 text-emerald-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-destructive" />
              )}
              <span className="pos-offline-payment__state">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            {isSyncing && (
              <Badge variant="secondary" className="pos-offline-payment__syncing">Syncing...</Badge>
            )}
          </div>

          {/* Pending Payments */}
          {pendingCount > 0 && (
            <div className="pos-offline-payment__pending">
              <div className="flex items-center gap-2">
                <CloudOff className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {pendingCount} payment{pendingCount > 1 ? 's' : ''} pending sync
                </span>
              </div>
              <p>
                {isOnline
                  ? 'Will sync automatically...'
                  : 'Will sync when connection is restored.'}
              </p>
              {isOnline && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncQueue()}
                  disabled={isSyncing}
                  className="pos-offline-payment__sync-button w-full"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  Sync Now
                </Button>
              )}
            </div>
          )}

          {/* Failed Payments */}
          {failedPayments.length > 0 && (
            <div className="pos-offline-payment__failed">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {failedPayments.length} payment{failedPayments.length > 1 ? 's' : ''} failed
                </span>
              </div>
              <p>
                Manual review required.
              </p>
              <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                {failedPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="pos-offline-payment__payment-row flex items-center justify-between text-xs"
                  >
                    <span>${payment.amount.toFixed(2)}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => retryPayment(payment.id)}
                      >
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="pos-offline-payment__remove h-6 px-2"
                        onClick={() => removeFromQueue(payment.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Synced */}
          {!hasIssues && isOnline && (
            <div className="pos-offline-payment__synced text-center">
              <Wifi className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm">All payments synced</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

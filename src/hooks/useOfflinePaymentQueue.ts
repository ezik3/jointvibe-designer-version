import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface OfflinePayment {
  id: string;
  customerId: string;
  customerSessionToken: string; // Required for customer authentication
  venueId: string;
  employeeId: string;
  orderId?: string;
  amount: number;
  fee: number;
  paymentMethod: 'nfc' | 'qr';
  timestamp: number;
  signature: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
}

const STORAGE_KEY = 'offline_payment_queue';
const MAX_RETRIES = 3;
const SYNC_INTERVAL = 30000; // 30 seconds

export const useOfflinePaymentQueue = () => {
  const [queue, setQueue] = useState<OfflinePayment[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setQueue(parsed);
      } catch (e) {
        console.error('Failed to parse offline queue:', e);
      }
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }, [queue]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: 'Back Online',
        description: 'Syncing pending payments...',
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: 'Offline Mode',
        description: 'Payments will be queued and synced when online.',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync when online
  useEffect(() => {
    if (isOnline && queue.some(p => p.status === 'pending')) {
      syncQueue();
    }
  }, [isOnline]);

  // Periodic sync attempt
  useEffect(() => {
    const interval = setInterval(() => {
      if (isOnline && queue.some(p => p.status === 'pending' || p.status === 'failed')) {
        syncQueue();
      }
    }, SYNC_INTERVAL);

    return () => clearInterval(interval);
  }, [isOnline, queue]);

  // Add payment to offline queue
  const addToQueue = useCallback((payment: Omit<OfflinePayment, 'id' | 'status' | 'retryCount'>) => {
    const newPayment: OfflinePayment = {
      ...payment,
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      retryCount: 0,
    };

    setQueue(prev => [...prev, newPayment]);
    
    toast({
      title: 'Payment Queued',
      description: 'Will sync when connection is restored.',
    });

    return newPayment.id;
  }, []);

  // Sync a single payment
  const syncPayment = async (payment: OfflinePayment): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('process-nfc-payment', {
        body: {
          customer_id: payment.customerId,
          customer_session_token: payment.customerSessionToken, // Include customer auth token
          amount: payment.amount,
          venue_id: payment.venueId,
          employee_id: payment.employeeId,
          order_id: payment.orderId,
          offline_id: payment.id,
          offline_timestamp: payment.timestamp,
          offline_signature: payment.signature,
        },
      });

      if (error) throw error;
      
      if (data?.success) {
        return true;
      } else {
        throw new Error(data?.error || 'Payment processing failed');
      }
    } catch (error) {
      console.error('Sync payment error:', error);
      return false;
    }
  };

  // Sync all pending payments
  const syncQueue = useCallback(async () => {
    if (isSyncing || !isOnline) return;

    const pendingPayments = queue.filter(
      p => p.status === 'pending' || (p.status === 'failed' && p.retryCount < MAX_RETRIES)
    );

    if (pendingPayments.length === 0) return;

    setIsSyncing(true);

    for (const payment of pendingPayments) {
      // Update status to syncing
      setQueue(prev =>
        prev.map(p =>
          p.id === payment.id ? { ...p, status: 'syncing' as const } : p
        )
      );

      const success = await syncPayment(payment);

      if (success) {
        setQueue(prev =>
          prev.map(p =>
            p.id === payment.id ? { ...p, status: 'synced' as const } : p
          )
        );
      } else {
        setQueue(prev =>
          prev.map(p =>
            p.id === payment.id
              ? {
                  ...p,
                  status: 'failed' as const,
                  retryCount: p.retryCount + 1,
                  lastError: 'Sync failed',
                }
              : p
          )
        );
      }
    }

    setIsSyncing(false);

    // Check results
    const syncedCount = queue.filter(p => p.status === 'synced').length;
    const failedCount = queue.filter(p => p.status === 'failed' && p.retryCount >= MAX_RETRIES).length;

    if (syncedCount > 0) {
      toast({
        title: 'Payments Synced',
        description: `${syncedCount} payment(s) successfully processed.`,
      });
    }

    if (failedCount > 0) {
      toast({
        title: 'Sync Issues',
        description: `${failedCount} payment(s) failed after retries. Manual review required.`,
        variant: 'destructive',
      });
    }
  }, [queue, isOnline, isSyncing]);

  // Remove synced payments from queue
  const clearSynced = useCallback(() => {
    setQueue(prev => prev.filter(p => p.status !== 'synced'));
  }, []);

  // Get failed payments that need manual review
  const getFailedPayments = useCallback(() => {
    return queue.filter(p => p.status === 'failed' && p.retryCount >= MAX_RETRIES);
  }, [queue]);

  // Retry a specific failed payment
  const retryPayment = useCallback(async (paymentId: string) => {
    const payment = queue.find(p => p.id === paymentId);
    if (!payment) return false;

    setQueue(prev =>
      prev.map(p =>
        p.id === paymentId ? { ...p, status: 'pending' as const, retryCount: 0 } : p
      )
    );

    return true;
  }, [queue]);

  // Remove a payment from queue (after manual resolution)
  const removeFromQueue = useCallback((paymentId: string) => {
    setQueue(prev => prev.filter(p => p.id !== paymentId));
  }, []);

  return {
    queue,
    isOnline,
    isSyncing,
    pendingCount: queue.filter(p => p.status === 'pending').length,
    failedCount: queue.filter(p => p.status === 'failed').length,
    addToQueue,
    syncQueue,
    clearSynced,
    getFailedPayments,
    retryPayment,
    removeFromQueue,
  };
};

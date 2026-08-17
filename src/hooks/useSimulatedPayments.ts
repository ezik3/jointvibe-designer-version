/**
 * Simulated Payments Hook
 * 
 * This hook handles simulated payment transactions that appear real
 * but don't actually process money. Used when SIMULATION_MODE is true.
 */

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SIMULATION_DELAY_MS } from '@/config/paymentConfig';

export interface SimulatedTransaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'receive';
  amount: number;
  fee: number;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  fromUserId?: string;
  toUserId?: string;
  venueId?: string;
  venueName?: string;
}

interface SimulatedWalletState {
  balance: number;
  pending: number;
  rewards: number;
}

const STORAGE_KEY = 'jv_simulated_wallet';
const TRANSACTIONS_KEY = 'jv_simulated_transactions';

// Get initial state from localStorage or defaults
const getInitialState = (userId: string): SimulatedWalletState => {
  const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return { balance: 100, pending: 0, rewards: 0 };
    }
  }
  return { balance: 100, pending: 0, rewards: 0 };
};

// Read-only snapshot helper (avoids hook-driven re-render loops)
export const readSimulatedWalletSnapshot = (userId: string) => {
  const state = getInitialState(userId);
  return {
    balance: state.balance,
    pending: state.pending,
    rewards: state.rewards,
  };
};

// Get transactions from localStorage
export const getSimulatedTransactions = (userId: string): SimulatedTransaction[] => {
  const stored = localStorage.getItem(`${TRANSACTIONS_KEY}_${userId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
};

export const readVenueSimulatedWalletSnapshot = (venueId: string) => {
  const balance = Number.parseFloat(localStorage.getItem(`jv_venue_simulated_wallet_${venueId}`) || '0');
  const storedTransactions = localStorage.getItem(`jv_venue_simulated_transactions_${venueId}`);

  try {
    return {
      balance: Number.isFinite(balance) ? balance : 0,
      transactions: storedTransactions ? JSON.parse(storedTransactions) as SimulatedTransaction[] : [],
    };
  } catch {
    return { balance: Number.isFinite(balance) ? balance : 0, transactions: [] as SimulatedTransaction[] };
  }
};

// Save state to localStorage
const saveState = (userId: string, state: SimulatedWalletState) => {
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(state));
};

// Save transactions to localStorage
const saveTransactions = (userId: string, transactions: SimulatedTransaction[]) => {
  localStorage.setItem(`${TRANSACTIONS_KEY}_${userId}`, JSON.stringify(transactions));
};

export const useSimulatedPayments = (userId: string | null) => {
  const [walletState, setWalletState] = useState<SimulatedWalletState>(() =>
    userId ? getInitialState(userId) : { balance: 0, pending: 0, rewards: 0 }
  );
  const [transactions, setTransactions] = useState<SimulatedTransaction[]>(() =>
    userId ? getSimulatedTransactions(userId) : []
  );
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync local state when user changes (e.g. login/logout)
  useEffect(() => {
    if (!userId) {
      setWalletState({ balance: 0, pending: 0, rewards: 0 });
      setTransactions([]);
      return;
    }

    setWalletState(getInitialState(userId));
    setTransactions(getSimulatedTransactions(userId));
  }, [userId]);

  // Add a transaction
  const addTransaction = useCallback((transaction: Omit<SimulatedTransaction, 'id' | 'timestamp'>) => {
    if (!userId) return null;
    
    const newTransaction: SimulatedTransaction = {
      ...transaction,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    
    const updatedTransactions = [newTransaction, ...transactions].slice(0, 100); // Keep last 100
    setTransactions(updatedTransactions);
    saveTransactions(userId, updatedTransactions);
    
    return newTransaction;
  }, [userId, transactions]);

  // Simulate a deposit
  const simulateDeposit = useCallback(async (amount: number, method: string): Promise<{ success: boolean; transactionId: string }> => {
    if (!userId) return { success: false, transactionId: '' };
    
    setIsProcessing(true);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, SIMULATION_DELAY_MS));
    
    const newBalance = walletState.balance + amount;
    const newState = { ...walletState, balance: newBalance };
    
    setWalletState(newState);
    saveState(userId, newState);
    
    const transaction = addTransaction({
      type: 'deposit',
      amount,
      fee: 0,
      description: `Deposit via ${method} (Simulated)`,
      status: 'completed',
    });
    
    setIsProcessing(false);
    return { success: true, transactionId: transaction?.id || '' };
  }, [userId, walletState, addTransaction]);

  // Simulate a transfer to another user
  const simulateTransfer = useCallback(async (
    recipientId: string, 
    amount: number, 
    fee: number,
    recipientName?: string
  ): Promise<{ success: boolean; transactionId: string }> => {
    if (!userId) return { success: false, transactionId: '' };
    
    const totalDeducted = amount + fee;
    if (walletState.balance < totalDeducted) {
      return { success: false, transactionId: '' };
    }
    
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, SIMULATION_DELAY_MS));
    
    const newBalance = walletState.balance - totalDeducted;
    const newState = { ...walletState, balance: newBalance };
    
    setWalletState(newState);
    saveState(userId, newState);
    
    const transaction = addTransaction({
      type: 'transfer',
      amount,
      fee,
      description: `Transfer to ${recipientName || 'User'} (Simulated)`,
      status: 'completed',
      toUserId: recipientId,
    });
    
    setIsProcessing(false);
    return { success: true, transactionId: transaction?.id || '' };
  }, [userId, walletState, addTransaction]);

  // Simulate a venue payment
  const simulateVenuePayment = useCallback(async (
    venueId: string,
    venueName: string,
    amount: number,
    fee: number,
    orderId?: string
  ): Promise<{ success: boolean; transactionId: string }> => {
    if (!userId) return { success: false, transactionId: '' };
    
    const totalDeducted = amount + fee;
    if (walletState.balance < totalDeducted) {
      return { success: false, transactionId: '' };
    }
    
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, SIMULATION_DELAY_MS));
    
    const newBalance = walletState.balance - totalDeducted;
    const newState = { ...walletState, balance: newBalance };
    
    setWalletState(newState);
    saveState(userId, newState);
    
    // Also update venue's simulated wallet
    const venueWalletKey = `jv_venue_simulated_wallet_${venueId}`;
    const venueBalance = parseFloat(localStorage.getItem(venueWalletKey) || '0');
    localStorage.setItem(venueWalletKey, (venueBalance + amount).toString());
    
    // Add to venue's transactions
    const venueTransactionsKey = `jv_venue_simulated_transactions_${venueId}`;
    const venueTransactions = JSON.parse(localStorage.getItem(venueTransactionsKey) || '[]');
    const venueTransaction = {
      id: uuidv4(),
      type: 'receive',
      amount,
      fee: 0,
      description: `Payment received ${orderId ? `(Order: ${orderId})` : ''}`,
      status: 'completed',
      timestamp: new Date().toISOString(),
    };
    venueTransactions.unshift(venueTransaction);
    localStorage.setItem(venueTransactionsKey, JSON.stringify(venueTransactions.slice(0, 100)));
    
    const transaction = addTransaction({
      type: 'payment',
      amount,
      fee,
      description: `Payment to ${venueName} (Simulated)`,
      status: 'completed',
      venueId,
      venueName,
    });
    
    setIsProcessing(false);
    return { success: true, transactionId: transaction?.id || '' };
  }, [userId, walletState, addTransaction]);

  // Simulate a withdrawal
  const simulateWithdrawal = useCallback(async (
    amount: number,
    fee: number,
    method: string
  ): Promise<{ success: boolean; withdrawalId: string }> => {
    if (!userId) return { success: false, withdrawalId: '' };
    
    const totalDeducted = amount + fee;
    if (walletState.balance < totalDeducted) {
      return { success: false, withdrawalId: '' };
    }
    
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, SIMULATION_DELAY_MS));
    
    const newBalance = walletState.balance - totalDeducted;
    const newState = { ...walletState, balance: newBalance };
    
    setWalletState(newState);
    saveState(userId, newState);
    
    const transaction = addTransaction({
      type: 'withdrawal',
      amount,
      fee,
      description: `Withdrawal via ${method} (Simulated)`,
      status: 'completed',
    });
    
    setIsProcessing(false);
    return { success: true, withdrawalId: transaction?.id || '' };
  }, [userId, walletState, addTransaction]);

  // Refresh state from localStorage
  const refreshBalance = useCallback(() => {
    if (!userId) return;
    setWalletState(getInitialState(userId));
    setTransactions(getSimulatedTransactions(userId));
  }, [userId]);

  // Clear all simulated data
  const clearSimulatedData = useCallback(() => {
    if (!userId) return;
    localStorage.removeItem(`${STORAGE_KEY}_${userId}`);
    localStorage.removeItem(`${TRANSACTIONS_KEY}_${userId}`);
    setWalletState({ balance: 0, pending: 0, rewards: 0 });
    setTransactions([]);
  }, [userId]);

  return {
    balance: walletState.balance,
    pending: walletState.pending,
    rewards: walletState.rewards,
    transactions,
    isProcessing,
    simulateDeposit,
    simulateTransfer,
    simulateVenuePayment,
    simulateWithdrawal,
    refreshBalance,
    clearSimulatedData,
  };
};

// Hook for venue simulated wallet
export const useVenueSimulatedPayments = (venueId: string | null) => {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<SimulatedTransaction[]>([]);

  const refreshBalance = useCallback(() => {
    if (!venueId) return;
    const snapshot = readVenueSimulatedWalletSnapshot(venueId);
    setBalance(snapshot.balance);
    setTransactions(snapshot.transactions);
  }, [venueId]);

  // Clear venue simulated data
  const clearVenueSimulatedData = useCallback(() => {
    if (!venueId) return;
    localStorage.removeItem(`jv_venue_simulated_wallet_${venueId}`);
    localStorage.removeItem(`jv_venue_simulated_transactions_${venueId}`);
    setBalance(0);
    setTransactions([]);
  }, [venueId]);

  return {
    balance,
    transactions,
    refreshBalance,
    clearVenueSimulatedData,
  };
};

// Clear ALL simulated payment data (for resetting)
export const clearAllSimulatedPaymentData = () => {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('jv_simulated_') ||
      key.startsWith('jv_venue_simulated_')
    )) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log(`Cleared ${keysToRemove.length} simulated payment records`);
};

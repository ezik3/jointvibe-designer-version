import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, ArrowRight, History, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/useCurrency";
import { useWalletTransactions, type WalletTransaction } from "@/hooks/useWalletTransactions";
import { format, isToday, isYesterday, isThisYear } from "date-fns";
import { useTranslation } from 'react-i18next';

interface TransactionHistoryProps {
  venueId?: string;
}

export default function TransactionHistory({ venueId }: TransactionHistoryProps) {
  const { t } = useTranslation('wallet');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const { formatCurrency, jvcToLocal } = useCurrency();
  const { transactions, loading, refresh } = useWalletTransactions({ venueId });

  useEffect(() => {
    setPage(0);
  }, [transactions]);

  const formatGmailTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday';
    if (isThisYear(d)) return format(d, 'd MMM');
    return format(d, 'd MMM yyyy');
  };

  const getTransactionIcon = (type: string, isIncoming: boolean) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownLeft className="h-4 w-4 text-emerald-400" />;
      case 'withdrawal':
        return <ArrowUpRight className="h-4 w-4 text-red-400" />;
      case 'transfer':
      case 'payment':
        return isIncoming 
          ? <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
          : <ArrowUpRight className="h-4 w-4 text-orange-400" />;
      default:
        return <ArrowRight className="h-4 w-4 text-zinc-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">Completed</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">Pending</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">Failed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const isIncomingTransaction = (tx: WalletTransaction) => {
    return tx.to_wallet_type === (venueId ? 'venue' : 'user') || tx.transaction_type === 'deposit';
  };

  if (loading) {
    return (
      <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-2xl overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-zinc-700/50">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-zinc-500" />
            <h3 className="font-semibold text-white">{t("wallet:actions.history")}</h3>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full bg-zinc-700/50" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32 bg-zinc-700/50" />
                <Skeleton className="h-3 w-24 bg-zinc-700/50" />
              </div>
              <Skeleton className="h-6 w-20 bg-zinc-700/50" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-center justify-between border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-zinc-500" />
          <h3 className="font-semibold text-white">{t("wallet:actions.history")}</h3>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={refresh}
          className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Content */}
      {transactions.length === 0 ? (
        <div className="text-center py-16 px-6">
          {/* Empty State Icon */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-full blur-xl" />
            <div className="relative w-full h-full flex items-center justify-center">
              <Search className="w-10 h-10 text-zinc-600" strokeWidth={1.5} />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-zinc-700 rounded-full flex items-center justify-center">
              <span className="text-zinc-400 text-xs">0</span>
            </div>
          </div>
          
          <h2 className="text-xl font-bold text-white mb-2">Your financial journey starts here</h2>
          <p className="text-zinc-500 text-sm leading-relaxed max-w-sm mx-auto mb-6">
            No transactions yet. Start by depositing funds to your elite wallet to unlock full potential.
          </p>
          <button className="text-cyan-400 text-sm font-semibold uppercase tracking-wider hover:text-cyan-300 transition-colors">
            View Guides & Tutorials
          </button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-zinc-700/30">
            {transactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((tx) => {
              const incoming = isIncomingTransaction(tx);
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 hover:bg-zinc-700/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      incoming ? 'bg-emerald-500/20' : 'bg-red-500/20'
                    }`}>
                      {getTransactionIcon(tx.transaction_type, incoming)}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-white capitalize">
                        {tx.transaction_type}
                        {tx.fee_amount > 0 && (
                          <span className="text-xs text-zinc-500 ml-2">
                            (fee: ${tx.fee_amount.toFixed(2)})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {tx.description || tx.transaction_type}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${incoming ? 'text-emerald-400' : 'text-red-400'}`}>
                      {incoming ? '+' : '-'}{formatCurrency(jvcToLocal(tx.amount_jvc))}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-zinc-500">{formatGmailTime(tx.created_at)}</span>
                      {getStatusBadge(tx.status)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {transactions.length > PAGE_SIZE && (
            <div className="flex items-center justify-between p-4 border-t border-zinc-700/30">
              <span className="text-xs text-zinc-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, transactions.length)} of {transactions.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="text-zinc-400 hover:text-white hover:bg-zinc-700/50 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={(page + 1) * PAGE_SIZE >= transactions.length}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-zinc-400 hover:text-white hover:bg-zinc-700/50 disabled:opacity-30"
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

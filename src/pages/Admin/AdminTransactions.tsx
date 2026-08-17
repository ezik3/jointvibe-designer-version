import { useEffect, useState } from "react";
import "./admin-dialogs.css";
import { ArrowLeftRight, Search, Filter, Eye, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface Transaction {
  id: string;
  transaction_type: string;
  amount_jvc: number;
  amount_usd: number;
  fee_amount: number;
  status: string;
  from_wallet_type: string | null;
  to_wallet_type: string | null;
  description: string | null;
  created_at: string;
  completed_at: string | null;
}

export default function AdminTransactions() {
  const { t } = useTranslation('admin');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to fetch transactions");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      transfer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      deposit: "bg-green-500/20 text-green-400 border-green-500/30",
      withdrawal: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      payment: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      fee: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    };
    return <Badge className={colors[type] || "bg-slate-500/20 text-slate-400 border-slate-500/30"}>{type}</Badge>;
  };

  const filteredTransactions = transactions.filter(tx => {
    const query = searchQuery.toLowerCase();
    return (
      tx.transaction_type.toLowerCase().includes(query) ||
      tx.status.toLowerCase().includes(query) ||
      tx.description?.toLowerCase().includes(query) ||
      tx.id.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="h-12 w-12 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Transactions</h1>
          <p className="text-slate-400 mt-1">All platform transactions</p>
        </div>
        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
          {transactions.length} Total
        </Badge>
      </div>

      {/* Search & Filter */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search by ID, type, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <Button variant="outline" className="border-slate-700 text-slate-300">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-sm font-medium text-slate-400">ID</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Amount</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Fee</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Flow</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Date</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-4">
                      <span className="text-slate-400 font-mono text-xs">
                        {tx.id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="p-4">
                      {getTypeBadge(tx.transaction_type)}
                    </td>
                    <td className="p-4">
                      <div>
                        <span className="text-cyan-400 font-medium">
                          {tx.amount_jvc.toLocaleString()} JVC
                        </span>
                        <p className="text-xs text-slate-500">
                          ${tx.amount_usd.toLocaleString()}
                        </p>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-yellow-400">
                        ${tx.fee_amount.toFixed(2)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">{tx.from_wallet_type || "—"}</span>
                        <ArrowRight className="h-3 w-3 text-slate-600" />
                        <span className="text-slate-400">{tx.to_wallet_type || "—"}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(tx.status)}
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {new Date(tx.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-white"
                        onClick={() => setSelectedTx(tx)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredTransactions.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No transactions found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Details Dialog */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="admin-dialog max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Transaction ID</p>
                <p className="text-white font-mono text-sm">{selectedTx.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Type</p>
                  <div className="mt-1">{getTypeBadge(selectedTx.transaction_type)}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedTx.status)}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Amount</p>
                  <p className="text-cyan-400 font-semibold">{selectedTx.amount_jvc.toLocaleString()} JVC</p>
                  <p className="text-xs text-slate-500">${selectedTx.amount_usd.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Fee</p>
                  <p className="text-yellow-400 font-semibold">${selectedTx.fee_amount.toFixed(2)}</p>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Flow</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-3 py-1 rounded bg-slate-700 text-slate-300 text-sm">
                    {selectedTx.from_wallet_type || "N/A"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-600" />
                  <span className="px-3 py-1 rounded bg-slate-700 text-slate-300 text-sm">
                    {selectedTx.to_wallet_type || "N/A"}
                  </span>
                </div>
              </div>
              {selectedTx.description && (
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Description</p>
                  <p className="text-white mt-1">{selectedTx.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Created</p>
                  <p className="text-white text-sm">{new Date(selectedTx.created_at).toLocaleString()}</p>
                </div>
                {selectedTx.completed_at && (
                  <div className="p-4 rounded-lg bg-slate-800/50">
                    <p className="text-sm text-slate-400">Completed</p>
                    <p className="text-white text-sm">{new Date(selectedTx.completed_at).toLocaleString()}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

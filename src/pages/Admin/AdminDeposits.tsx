import { useEffect, useState } from "react";
import "./admin-dialogs.css";
import { Download, Search, Filter, Eye, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

interface Deposit {
  id: string;
  user_id: string | null;
  venue_id: string | null;
  amount_local: number;
  amount_usd: number;
  amount_jvc: number;
  deposit_method: string;
  status: string;
  local_currency: string;
  exchange_rate: number;
  stripe_payment_intent_id: string | null;
  created_at: string;
  completed_at: string | null;
  failure_reason: string | null;
}

export default function AdminDeposits() {
  const { t } = useTranslation('admin');
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);

  useEffect(() => {
    fetchDeposits();
  }, []);

  const fetchDeposits = async () => {
    try {
      const { data, error } = await supabase
        .from("deposit_records")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setDeposits(data || []);
    } catch (error) {
      console.error("Error fetching deposits:", error);
      toast.error("Failed to fetch deposits");
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

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      card: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      bank_transfer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      crypto: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    };
    return <Badge className={colors[method] || "bg-slate-500/20 text-slate-400 border-slate-500/30"}>{method}</Badge>;
  };

  const filteredDeposits = deposits.filter(deposit => {
    const query = searchQuery.toLowerCase();
    return (
      deposit.deposit_method.toLowerCase().includes(query) ||
      deposit.status.toLowerCase().includes(query) ||
      deposit.id.toLowerCase().includes(query)
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
          <h1 className="text-3xl font-bold text-white">Deposits</h1>
          <p className="text-slate-400 mt-1">All platform deposits</p>
        </div>
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          {deposits.filter(d => d.status === "pending").length} Pending
        </Badge>
      </div>

      {/* Search & Filter */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search deposits..."
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

      {/* Deposits Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-sm font-medium text-slate-400">ID</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Method</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Amount</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">JVC Credited</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Date</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeposits.map((deposit) => (
                  <tr key={deposit.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-4">
                      <span className="text-slate-400 font-mono text-xs">
                        {deposit.id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="p-4">
                      {getMethodBadge(deposit.deposit_method)}
                    </td>
                    <td className="p-4">
                      <div>
                        <span className="text-white font-medium">
                          {deposit.amount_local.toLocaleString()} {deposit.local_currency}
                        </span>
                        <p className="text-xs text-slate-500">
                          ${deposit.amount_usd.toLocaleString()} USD
                        </p>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-cyan-400 font-medium">
                        {deposit.amount_jvc.toLocaleString()} JVC
                      </span>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(deposit.status)}
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {new Date(deposit.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-white"
                        onClick={() => setSelectedDeposit(deposit)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredDeposits.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No deposits found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deposit Details Dialog */}
      <Dialog open={!!selectedDeposit} onOpenChange={(open) => !open && setSelectedDeposit(null)}>
        <DialogContent className="admin-dialog max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Deposit Details</DialogTitle>
          </DialogHeader>
          {selectedDeposit && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Deposit ID</p>
                <p className="text-white font-mono text-sm">{selectedDeposit.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Method</p>
                  <div className="mt-1">{getMethodBadge(selectedDeposit.deposit_method)}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedDeposit.status)}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Local Amount</p>
                  <p className="text-white font-semibold">
                    {selectedDeposit.amount_local.toLocaleString()} {selectedDeposit.local_currency}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">USD Amount</p>
                  <p className="text-green-400 font-semibold">
                    ${selectedDeposit.amount_usd.toLocaleString()}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">JVC Credited</p>
                  <p className="text-cyan-400 font-semibold">
                    {selectedDeposit.amount_jvc.toLocaleString()} JVC
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Exchange Rate</p>
                  <p className="text-white">{selectedDeposit.exchange_rate}</p>
                </div>
              </div>
              {selectedDeposit.stripe_payment_intent_id && (
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Stripe Payment Intent</p>
                  <p className="text-white font-mono text-sm">{selectedDeposit.stripe_payment_intent_id}</p>
                </div>
              )}
              {selectedDeposit.failure_reason && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400">Failure Reason</p>
                  <p className="text-red-300 mt-1">{selectedDeposit.failure_reason}</p>
                </div>
              )}
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Created</p>
                <p className="text-white text-sm">{new Date(selectedDeposit.created_at).toLocaleString()}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import "./admin-dialogs.css";
import { Search, Filter, Eye, XCircle, Clock, Play, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface Withdrawal {
  id: string;
  user_id: string | null;
  venue_id: string | null;
  amount_jvc: number;
  amount_usd: number;
  amount_local: number;
  withdrawal_method: string;
  status: string;
  local_currency: string;
  fee_amount: number;
  net_payout: number;
  bank_name: string | null;
  bank_account_last4: string | null;
  created_at: string;
  approved_at: string | null;
  completed_at: string | null;
  rejection_reason: string | null;
  metadata: any;
}

export default function AdminWithdrawals() {
  const { t } = useTranslation('admin');
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; withdrawal: Withdrawal | null }>({
    open: false,
    withdrawal: null
  });
  const [rejectReason, setRejectReason] = useState("");
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const fetchWithdrawals = async () => {
    try {
      const { data, error } = await supabase
        .from("withdrawal_records")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setWithdrawals(data || []);
    } catch (error) {
      console.error("Error fetching withdrawals:", error);
      toast.error("Failed to fetch withdrawals");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog.withdrawal || !rejectReason) return;

    try {
      const { data, error } = await supabase.functions.invoke('admin-withdrawal', {
        body: {
          withdrawal_id: rejectDialog.withdrawal.id,
          action: 'reject',
          reason: rejectReason
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to reject');
      
      toast.success("Withdrawal rejected - funds unlocked");
      setRejectDialog({ open: false, withdrawal: null });
      setRejectReason("");
      fetchWithdrawals();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject withdrawal");
    }
  };

  const handleRunBatchPayout = async (dryRun: boolean = false) => {
    setIsBatchProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('payout-batch', {
        body: { dry_run: dryRun, limit: 50 }
      });

      if (error) throw error;
      
      if (dryRun) {
        toast.info(`Preview: Would process ${data.payouts?.length || 0} payouts totaling $${data.payouts?.reduce((s: number, p: any) => s + p.amount, 0).toFixed(2) || 0}`);
      } else {
        toast.success(`Batch complete: ${data.processed} processed, ${data.failed} failed. Total paid: $${data.total_paid?.toFixed(2) || 0}`);
        fetchWithdrawals();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to run batch payout");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Paid</Badge>;
      case "approved":
      case "approved_automatically":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          {status === "approved_automatically" ? "Auto-Approved" : "Approved"}
        </Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case "needs_review":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Needs Review</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Rejected</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">{status}</Badge>;
    }
  };

  const filteredWithdrawals = withdrawals.filter(w => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      w.withdrawal_method.toLowerCase().includes(query) ||
      w.status.toLowerCase().includes(query) ||
      w.id.toLowerCase().includes(query)
    );
    const matchesStatus = statusFilter === "all" || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const stats = {
    needsReview: withdrawals.filter(w => w.status === "needs_review").length,
    autoApproved: withdrawals.filter(w => w.status === "approved_automatically").length,
    pendingPayout: withdrawals.filter(w => ["approved", "approved_automatically"].includes(w.status)).length,
    totalPendingAmount: withdrawals
      .filter(w => ["approved", "approved_automatically"].includes(w.status))
      .reduce((sum, w) => sum + w.net_payout, 0)
  };

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
          <h1 className="text-3xl font-bold text-white">Withdrawals</h1>
          <p className="text-slate-400 mt-1">Automated withdrawal processing with monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {stats.pendingPayout > 0 && (
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-3 py-1">
              {stats.pendingPayout} ready for payout (${stats.totalPendingAmount.toFixed(2)})
            </Badge>
          )}
          {stats.needsReview > 0 && (
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 px-3 py-1">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {stats.needsReview} needs review
            </Badge>
          )}
        </div>
      </div>

      {/* Batch Payout Controls */}
      <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-400" />
                Batch Payout Processor
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Process all auto-approved withdrawals in one batch. Runs automatically daily, or trigger manually.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-600 text-slate-300"
                onClick={() => handleRunBatchPayout(true)}
                disabled={isBatchProcessing}
              >
                {isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                Preview
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => handleRunBatchPayout(false)}
                disabled={isBatchProcessing || stats.pendingPayout === 0}
              >
                {isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Run Batch Payout
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search & Filter */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search withdrawals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("all")}
                className={statusFilter === "all" ? "bg-purple-600" : "border-slate-700 text-slate-300"}
              >
                All
              </Button>
              <Button
                variant={statusFilter === "needs_review" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("needs_review")}
                className={statusFilter === "needs_review" ? "bg-orange-600" : "border-slate-700 text-slate-300"}
              >
                Needs Review
              </Button>
              <Button
                variant={statusFilter === "approved_automatically" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("approved_automatically")}
                className={statusFilter === "approved_automatically" ? "bg-blue-600" : "border-slate-700 text-slate-300"}
              >
                Auto-Approved
              </Button>
              <Button
                variant={statusFilter === "completed" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("completed")}
                className={statusFilter === "completed" ? "bg-green-600" : "border-slate-700 text-slate-300"}
              >
                Paid
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawals Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-sm font-medium text-slate-400">ID</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Method</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Amount</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Net Payout</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Date</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWithdrawals.map((withdrawal) => (
                  <tr key={withdrawal.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-4">
                      <span className="text-slate-400 font-mono text-xs">
                        {withdrawal.id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="p-4">
                      <Badge className={withdrawal.venue_id 
                        ? "bg-green-500/20 text-green-400 border-green-500/30" 
                        : "bg-purple-500/20 text-purple-400 border-purple-500/30"
                      }>
                        {withdrawal.venue_id ? "Venue" : "User"}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                        {withdrawal.withdrawal_method}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div>
                        <span className="text-cyan-400 font-medium">
                          {withdrawal.amount_jvc.toLocaleString()} JVC
                        </span>
                        <p className="text-xs text-slate-500">
                          Fee: ${withdrawal.fee_amount.toFixed(2)}
                        </p>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-green-400 font-medium">
                        ${withdrawal.net_payout.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        {getStatusBadge(withdrawal.status)}
                        {withdrawal.metadata?.auto_approved && (
                          <span className="text-xs text-blue-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Auto
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {new Date(withdrawal.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Only show reject for needs_review items */}
                        {withdrawal.status === "needs_review" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => setRejectDialog({ open: true, withdrawal })}
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-white"
                          onClick={() => setSelectedWithdrawal(withdrawal)}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredWithdrawals.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No withdrawals found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ open, withdrawal: rejectDialog.withdrawal })}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle className="text-white">Reject Withdrawal</DialogTitle>
            <DialogDescription>
              This withdrawal was flagged for review. Please provide a reason for rejecting.
              {rejectDialog.withdrawal?.metadata?.review_reason && (
                <span className="block mt-2 text-orange-400">
                  Review reason: {rejectDialog.withdrawal.metadata.review_reason}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Rejection Reason</Label>
              <Textarea
                placeholder="Enter the reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog({ open: false, withdrawal: null })}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              className="admin-dialog__danger"
              disabled={!rejectReason}
            >
              Reject Withdrawal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Details Dialog */}
      <Dialog open={!!selectedWithdrawal} onOpenChange={(open) => !open && setSelectedWithdrawal(null)}>
        <DialogContent className="admin-dialog max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Withdrawal Details</DialogTitle>
          </DialogHeader>
          {selectedWithdrawal && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Withdrawal ID</p>
                <p className="text-white font-mono text-sm">{selectedWithdrawal.id}</p>
              </div>
              
              {/* Auto-approval info */}
              {selectedWithdrawal.metadata?.auto_approved && (
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Auto-approved by system rules
                  </p>
                </div>
              )}
              
              {/* Review needed info */}
              {selectedWithdrawal.status === "needs_review" && selectedWithdrawal.metadata?.review_reason && (
                <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <p className="text-sm text-orange-400">Flagged for Review</p>
                  <p className="text-orange-300 mt-1">{selectedWithdrawal.metadata.review_reason}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Type</p>
                  <p className="text-white mt-1">{selectedWithdrawal.venue_id ? 'Venue' : 'User'}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Method</p>
                  <p className="text-white mt-1">{selectedWithdrawal.withdrawal_method}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedWithdrawal.status)}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">JVC Amount</p>
                  <p className="text-cyan-400 font-semibold">
                    {selectedWithdrawal.amount_jvc.toLocaleString()} JVC
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Fee</p>
                  <p className="text-yellow-400 font-semibold">
                    ${selectedWithdrawal.fee_amount.toFixed(2)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Net Payout</p>
                  <p className="text-green-400 font-semibold">
                    ${selectedWithdrawal.net_payout.toLocaleString()}
                  </p>
                </div>
              </div>
              {selectedWithdrawal.bank_name && (
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Bank Details</p>
                  <p className="text-white mt-1">
                    {selectedWithdrawal.bank_name} •••• {selectedWithdrawal.bank_account_last4}
                  </p>
                </div>
              )}
              {selectedWithdrawal.rejection_reason && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400">Rejection Reason</p>
                  <p className="text-red-300 mt-1">{selectedWithdrawal.rejection_reason}</p>
                </div>
              )}
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Created</p>
                <p className="text-white text-sm">{new Date(selectedWithdrawal.created_at).toLocaleString()}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import "./admin-dialogs.css";
import { AlertTriangle, Search, Filter, Eye, Unlock } from "lucide-react";
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

interface WalletFreeze {
  id: string;
  wallet_id: string;
  wallet_type: string;
  frozen_by: string;
  freeze_reason: string;
  is_active: boolean;
  unfrozen_by: string | null;
  unfrozen_at: string | null;
  unfreeze_reason: string | null;
  created_at: string;
}

export default function AdminWalletFreezes() {
  const { t } = useTranslation('wallet');
  const [freezes, setFreezes] = useState<WalletFreeze[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFreeze, setSelectedFreeze] = useState<WalletFreeze | null>(null);
  const [unfreezeDialog, setUnfreezeDialog] = useState<{ open: boolean; freeze: WalletFreeze | null }>({
    open: false,
    freeze: null
  });
  const [unfreezeReason, setUnfreezeReason] = useState("");

  useEffect(() => {
    fetchFreezes();
  }, []);

  const fetchFreezes = async () => {
    try {
      const { data, error } = await supabase
        .from("wallet_freezes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFreezes(data || []);
    } catch (error) {
      console.error("Error fetching wallet freezes:", error);
      toast.error("Failed to fetch wallet freezes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnfreeze = async () => {
    if (!unfreezeDialog.freeze || !unfreezeReason) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("wallet_freezes")
        .update({
          is_active: false,
          unfrozen_by: user.id,
          unfrozen_at: new Date().toISOString(),
          unfreeze_reason: unfreezeReason
        })
        .eq("id", unfreezeDialog.freeze.id);

      if (error) throw error;

      // Also update the wallet itself
      // Update the wallet based on type
      if (unfreezeDialog.freeze.wallet_type === "user") {
        await supabase
          .from("user_wallets")
          .update({
            is_frozen: false,
            frozen_at: null,
            frozen_by: null,
            freeze_reason: null
          })
          .eq("user_id", unfreezeDialog.freeze.wallet_id);
      } else {
        await supabase
          .from("venue_wallets")
          .update({
            is_frozen: false,
            frozen_at: null,
            frozen_by: null,
            freeze_reason: null
          })
          .eq("venue_id", unfreezeDialog.freeze.wallet_id);
      }

      toast.success("Wallet unfrozen successfully");
      setUnfreezeDialog({ open: false, freeze: null });
      setUnfreezeReason("");
      fetchFreezes();
    } catch (error: any) {
      toast.error(error.message || "Failed to unfreeze wallet");
    }
  };

  const filteredFreezes = freezes.filter(freeze => {
    const query = searchQuery.toLowerCase();
    return (
      freeze.wallet_type.toLowerCase().includes(query) ||
      freeze.freeze_reason.toLowerCase().includes(query) ||
      freeze.wallet_id.toLowerCase().includes(query)
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
          <h1 className="text-3xl font-bold text-white">Wallet Freezes</h1>
          <p className="text-slate-400 mt-1">Manage frozen wallets</p>
        </div>
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          {freezes.filter(f => f.is_active).length} Active Freezes
        </Badge>
      </div>

      {/* Search & Filter */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search freezes..."
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

      {/* Freezes Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Wallet ID</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Reason</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Frozen At</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFreezes.map((freeze) => (
                  <tr key={freeze.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-4">
                      <span className="text-slate-400 font-mono text-xs">
                        {freeze.wallet_id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="p-4">
                      <Badge className={freeze.wallet_type === "user" 
                        ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        : "bg-purple-500/20 text-purple-400 border-purple-500/30"
                      }>
                        {freeze.wallet_type}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-300 text-sm max-w-xs truncate block">
                        {freeze.freeze_reason}
                      </span>
                    </td>
                    <td className="p-4">
                      {freeze.is_active ? (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          Resolved
                        </Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {new Date(freeze.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {freeze.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                            onClick={() => setUnfreezeDialog({ open: true, freeze })}
                          >
                            <Unlock className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-white"
                          onClick={() => setSelectedFreeze(freeze)}
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

          {filteredFreezes.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No wallet freezes found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unfreeze Dialog */}
      <Dialog open={unfreezeDialog.open} onOpenChange={(open) => setUnfreezeDialog({ open, freeze: unfreezeDialog.freeze })}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle className="text-white">Unfreeze Wallet</DialogTitle>
            <DialogDescription>
              Please provide a reason for unfreezing this wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Unfreeze Reason</Label>
              <Textarea
                placeholder="Enter the reason for unfreezing..."
                value={unfreezeReason}
                onChange={(e) => setUnfreezeReason(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnfreezeDialog({ open: false, freeze: null })}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnfreeze}
              className="admin-dialog__primary"
              disabled={!unfreezeReason}
            >
              Unfreeze Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Freeze Details Dialog */}
      <Dialog open={!!selectedFreeze} onOpenChange={(open) => !open && setSelectedFreeze(null)}>
        <DialogContent className="admin-dialog max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Freeze Details</DialogTitle>
          </DialogHeader>
          {selectedFreeze && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Wallet ID</p>
                <p className="text-white font-mono text-sm">{selectedFreeze.wallet_id}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Wallet Type</p>
                  <p className="text-white mt-1 capitalize">{selectedFreeze.wallet_type}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Status</p>
                  <div className="mt-1">
                    {selectedFreeze.is_active ? (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Active</Badge>
                    ) : (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Resolved</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Freeze Reason</p>
                <p className="text-white mt-1">{selectedFreeze.freeze_reason}</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Frozen At</p>
                <p className="text-white text-sm">{new Date(selectedFreeze.created_at).toLocaleString()}</p>
              </div>
              {selectedFreeze.unfrozen_at && (
                <>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm text-green-400">Unfreeze Reason</p>
                    <p className="text-green-300 mt-1">{selectedFreeze.unfreeze_reason}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-800/50">
                    <p className="text-sm text-slate-400">Unfrozen At</p>
                    <p className="text-white text-sm">{new Date(selectedFreeze.unfrozen_at).toLocaleString()}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

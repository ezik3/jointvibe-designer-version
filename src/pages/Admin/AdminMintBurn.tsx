import { useEffect, useState } from "react";
import "./admin-dialogs.css";
import { Coins, Plus, Minus, Search, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface MintBurnRecord {
  id: string;
  operation_type: string;
  amount_jvc: number;
  amount_usd: number;
  triggered_by: string;
  admin_reason: string | null;
  wallet_type: string;
  balance_before: number;
  balance_after: number;
  total_supply_before: number;
  total_supply_after: number;
  created_at: string;
}

export default function AdminMintBurn() {
  const { t } = useTranslation('admin');
  const [records, setRecords] = useState<MintBurnRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [mintDialog, setMintDialog] = useState(false);
  const [burnDialog, setBurnDialog] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    walletType: "user",
    walletId: "",
    reason: ""
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("mint_burn_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error("Error fetching mint/burn records:", error);
      toast.error("Failed to fetch records");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMint = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }

      // Get current treasury
      const { data: treasury } = await supabase
        .from("platform_treasury")
        .select("*")
        .limit(1)
        .single();

      const currentSupply = treasury?.total_jvc_supply || 0;

      // Create audit record
      const { error: auditError } = await supabase
        .from("mint_burn_audit")
        .insert({
          operation_type: "mint",
          amount_jvc: amount,
          amount_usd: amount, // 1:1 peg
          triggered_by: "admin_manual",
          admin_id: user.id,
          admin_reason: formData.reason,
          wallet_type: formData.walletType,
          wallet_id: formData.walletId || user.id,
          balance_before: 0,
          balance_after: amount,
          total_supply_before: currentSupply,
          total_supply_after: currentSupply + amount
        });

      if (auditError) throw auditError;

      // Update treasury
      if (treasury) {
        const { error: treasuryError } = await supabase
          .from("platform_treasury")
          .update({
            total_jvc_supply: currentSupply + amount,
            updated_at: new Date().toISOString()
          })
          .eq("id", treasury.id);

        if (treasuryError) throw treasuryError;
      }

      toast.success(`Minted ${amount.toLocaleString()} JVC`);
      setMintDialog(false);
      setFormData({ amount: "", walletType: "user", walletId: "", reason: "" });
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || "Mint operation failed");
    }
  };

  const handleBurn = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }

      // Get current treasury
      const { data: treasury } = await supabase
        .from("platform_treasury")
        .select("*")
        .limit(1)
        .single();

      const currentSupply = treasury?.total_jvc_supply || 0;

      if (amount > currentSupply) {
        throw new Error("Cannot burn more than current supply");
      }

      // Create audit record
      const { error: auditError } = await supabase
        .from("mint_burn_audit")
        .insert({
          operation_type: "burn",
          amount_jvc: amount,
          amount_usd: amount,
          triggered_by: "admin_manual",
          admin_id: user.id,
          admin_reason: formData.reason,
          wallet_type: formData.walletType,
          wallet_id: formData.walletId || user.id,
          balance_before: amount,
          balance_after: 0,
          total_supply_before: currentSupply,
          total_supply_after: currentSupply - amount
        });

      if (auditError) throw auditError;

      // Update treasury
      if (treasury) {
        const { error: treasuryError } = await supabase
          .from("platform_treasury")
          .update({
            total_jvc_supply: currentSupply - amount,
            updated_at: new Date().toISOString()
          })
          .eq("id", treasury.id);

        if (treasuryError) throw treasuryError;
      }

      toast.success(`Burned ${amount.toLocaleString()} JVC`);
      setBurnDialog(false);
      setFormData({ amount: "", walletType: "user", walletId: "", reason: "" });
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || "Burn operation failed");
    }
  };

  const filteredRecords = records.filter(record => {
    const query = searchQuery.toLowerCase();
    return (
      record.operation_type.toLowerCase().includes(query) ||
      record.triggered_by.toLowerCase().includes(query) ||
      record.admin_reason?.toLowerCase().includes(query)
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
          <h1 className="text-3xl font-bold text-white">Mint / Burn</h1>
          <p className="text-slate-400 mt-1">Manage JVC token supply</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setMintDialog(true)}
            className="bg-green-500 hover:bg-green-600 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Mint JVC
          </Button>
          <Button
            onClick={() => setBurnDialog(true)}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            <Minus className="h-4 w-4 mr-2" />
            Burn JVC
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search operations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Operation History</CardTitle>
          <CardDescription>All mint and burn operations</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Amount</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Triggered By</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Reason</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Supply Change</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-4">
                      {record.operation_type === "mint" ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          <ArrowUpCircle className="h-3 w-3 mr-1" />
                          Mint
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          <ArrowDownCircle className="h-3 w-3 mr-1" />
                          Burn
                        </Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`font-medium ${record.operation_type === "mint" ? "text-green-400" : "text-red-400"}`}>
                        {record.operation_type === "mint" ? "+" : "-"}
                        {record.amount_jvc.toLocaleString()} JVC
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-300 capitalize">
                        {record.triggered_by.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {record.admin_reason || "-"}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {record.total_supply_before.toLocaleString()} → {record.total_supply_after.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {new Date(record.created_at).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredRecords.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No operations found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mint Dialog */}
      <Dialog open={mintDialog} onOpenChange={setMintDialog}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Coins className="h-5 w-5 text-green-400" />
              Mint JVC
            </DialogTitle>
            <DialogDescription>
              Create new JVC tokens. This increases total supply.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Amount (JVC)</Label>
              <Input
                type="number"
                placeholder="1000"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Target Wallet Type</Label>
              <Select
                value={formData.walletType}
                onValueChange={(value) => setFormData({ ...formData, walletType: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-select-popover">
                  <SelectItem value="user">User Wallet</SelectItem>
                  <SelectItem value="venue">Venue Wallet</SelectItem>
                  <SelectItem value="treasury">Treasury</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Reason</Label>
              <Textarea
                placeholder="Reason for minting..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMintDialog(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMint}
              className="admin-dialog__primary"
              disabled={!formData.amount || !formData.reason}
            >
              Mint Tokens
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Burn Dialog */}
      <Dialog open={burnDialog} onOpenChange={setBurnDialog}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Coins className="h-5 w-5 text-red-400" />
              Burn JVC
            </DialogTitle>
            <DialogDescription>
              Destroy JVC tokens. This decreases total supply.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Amount (JVC)</Label>
              <Input
                type="number"
                placeholder="1000"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Source Wallet Type</Label>
              <Select
                value={formData.walletType}
                onValueChange={(value) => setFormData({ ...formData, walletType: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-select-popover">
                  <SelectItem value="user">User Wallet</SelectItem>
                  <SelectItem value="venue">Venue Wallet</SelectItem>
                  <SelectItem value="treasury">Treasury</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Reason</Label>
              <Textarea
                placeholder="Reason for burning..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBurnDialog(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBurn}
              className="admin-dialog__danger"
              disabled={!formData.amount || !formData.reason}
            >
              Burn Tokens
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

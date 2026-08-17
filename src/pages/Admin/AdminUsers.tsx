import { useState, useEffect } from "react";
import "./admin-dialogs.css";
import { Search, Filter, MoreHorizontal, Eye, Shield, Ban, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface UserWallet {
  id: string;
  user_id: string;
  balance_jv_token: number;
  balance_usd: number;
  is_frozen: boolean;
  freeze_reason: string | null;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

const levelColors: Record<string, string> = {
  Bronze: "bg-amber-900/20 text-amber-500",
  Silver: "bg-slate-400/20 text-slate-400",
  Gold: "bg-yellow-500/20 text-yellow-500",
  Diamond: "bg-cyan-400/20 text-cyan-400",
  Platinum: "bg-purple-400/20 text-purple-400",
};

export default function AdminUsers() {
  const { t } = useTranslation('admin');
  const [users, setUsers] = useState<UserWallet[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [freezeDialog, setFreezeDialog] = useState<{ open: boolean; user: UserWallet | null }>({
    open: false,
    user: null
  });
  const [freezeReason, setFreezeReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWallet | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: wallets, error } = await supabase
        .from("user_wallets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const usersWithProfiles = await Promise.all(
        (wallets || []).map(async (wallet) => {
          const { data: profile } = await supabase
            .from("customer_profiles")
            .select("display_name, avatar_url")
            .eq("user_id", wallet.user_id)
            .single();

          return {
            ...wallet,
            profile: profile || undefined
          };
        })
      );

      setUsers(usersWithProfiles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFreezeWallet = async () => {
    if (!freezeDialog.user || !freezeReason) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: walletError } = await supabase
        .from("user_wallets")
        .update({
          is_frozen: true,
          frozen_at: new Date().toISOString(),
          frozen_by: user.id,
          freeze_reason: freezeReason
        })
        .eq("id", freezeDialog.user.id);

      if (walletError) throw walletError;

      const { error: freezeError } = await supabase
        .from("wallet_freezes")
        .insert({
          wallet_id: freezeDialog.user.user_id,
          wallet_type: "user",
          frozen_by: user.id,
          freeze_reason: freezeReason,
          is_active: true
        });

      if (freezeError) throw freezeError;

      toast.success("Wallet frozen successfully");
      setFreezeDialog({ open: false, user: null });
      setFreezeReason("");
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to freeze wallet");
    }
  };

  const handleUnfreezeWallet = async (wallet: UserWallet) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: walletError } = await supabase
        .from("user_wallets")
        .update({
          is_frozen: false,
          frozen_at: null,
          frozen_by: null,
          freeze_reason: null
        })
        .eq("id", wallet.id);

      if (walletError) throw walletError;

      const { error: freezeError } = await supabase
        .from("wallet_freezes")
        .update({
          is_active: false,
          unfrozen_by: user.id,
          unfrozen_at: new Date().toISOString(),
          unfreeze_reason: "Admin unfroze wallet"
        })
        .eq("wallet_id", wallet.user_id)
        .eq("is_active", true);

      if (freezeError) throw freezeError;

      toast.success("Wallet unfrozen successfully");
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to unfreeze wallet");
    }
  };

  const filteredUsers = users.filter(user => {
    const name = user.profile?.display_name?.toLowerCase() || "";
    const id = user.user_id.toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || id.includes(query);
  });

  // Assign levels based on balance
  const getUserLevel = (balance: number): string => {
    if (balance >= 10000) return "Diamond";
    if (balance >= 5000) return "Platinum";
    if (balance >= 1000) return "Gold";
    if (balance >= 100) return "Silver";
    return "Bronze";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all end-users across the platform
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          Export Users
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted border-border"
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-muted-foreground text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-4 font-medium">User</th>
                <th className="text-left px-6 py-4 font-medium">Status</th>
                <th className="text-left px-6 py-4 font-medium">Level</th>
                <th className="text-left px-6 py-4 font-medium">JVC Balance</th>
                <th className="text-left px-6 py-4 font-medium">Joined</th>
                <th className="text-right px-6 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((user) => {
                const level = getUserLevel(user.balance_jv_token || 0);
                return (
                  <tr key={user.id} className="hover:bg-muted/50 transition-colors duration-150">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {user.profile?.display_name?.[0] || "U"}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.profile?.display_name || "Unknown User"}</p>
                          <p className="text-xs text-muted-foreground">{user.user_id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        user.is_frozen 
                          ? "bg-destructive/10 text-destructive" 
                          : "bg-success/10 text-success"
                      )}>
                        {user.is_frozen ? "Frozen" : "Active"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", levelColors[level])}>
                        {level}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">${(user.balance_jv_token || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground text-sm">{new Date(user.created_at).toLocaleDateString()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="admin-menu-popover" align="end">
                            <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Shield className="w-4 h-4 mr-2" />
                              Change Role
                            </DropdownMenuItem>
                            {user.is_frozen ? (
                              <DropdownMenuItem 
                                className="text-success"
                                onClick={() => handleUnfreezeWallet(user)}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Unfreeze Account
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => setFreezeDialog({ open: true, user })}
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                Freeze Account
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            No users found
          </div>
        )}
      </div>

      {/* Freeze Dialog */}
      <Dialog open={freezeDialog.open} onOpenChange={(open) => setFreezeDialog({ open, user: freezeDialog.user })}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>Freeze Wallet</DialogTitle>
            <DialogDescription>
              This will prevent the user from making any transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for freezing</Label>
              <Textarea
                placeholder="Enter the reason for freezing this wallet..."
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFreezeDialog({ open: false, user: null })}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFreezeWallet}
              className="bg-destructive hover:bg-destructive/90"
              disabled={!freezeReason}
            >
              Freeze Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="admin-dialog max-w-lg">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-xl font-medium text-primary">
                    {selectedUser.profile?.display_name?.[0] || "U"}
                  </span>
                </div>
                <div>
                  <p className="text-xl font-semibold text-foreground">
                    {selectedUser.profile?.display_name || "Unknown User"}
                  </p>
                  <p className="text-sm text-muted-foreground font-mono">{selectedUser.user_id}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">JVC Balance</p>
                  <p className="text-lg font-semibold text-primary">
                    {(selectedUser.balance_jv_token || 0).toLocaleString()} JVC
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">USD Balance</p>
                  <p className="text-lg font-semibold text-success">
                    ${(selectedUser.balance_usd || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Account Status</p>
                <div className="mt-2">
                  {selectedUser.is_frozen ? (
                    <div>
                      <Badge variant="destructive">Frozen</Badge>
                      {selectedUser.freeze_reason && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Reason: {selectedUser.freeze_reason}
                        </p>
                      )}
                    </div>
                  ) : (
                    <Badge className="bg-success/10 text-success">Active</Badge>
                  )}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Member Since</p>
                <p className="text-foreground">{new Date(selectedUser.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

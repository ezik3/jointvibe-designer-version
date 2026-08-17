import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Trash2, Loader2, Search, Clock, Check, X, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';

interface SearchResult {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  invite_status: string | null;
}

interface Invite {
  id: string;
  invited_user_id: string;
  status: string;
  created_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  test_balance_cents: number;
  display_name?: string;
  avatar_url?: string | null;
}

interface TestUserManagerProps {
  venueId: string;
  maxTestUsers?: number;
}

export default function TestUserManager({ venueId, maxTestUsers = 10 }: TestUserManagerProps) {
  const { t } = useTranslation('venue');
  const { user } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  const acceptedCount = invites.filter(i => i.status === "accepted").length;
  const pendingCount = invites.filter(i => i.status === "pending").length;

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("venue_test_invites")
      .select("id, invited_user_id, status, created_at, accepted_at, declined_at, test_balance_cents")
      .eq("venue_id", venueId)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching invites:", error);
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      const userIds = data.map((i: any) => i.invited_user_id);
      const { data: profiles } = await supabase
        .from("customer_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }])
      );

      setInvites(
        data.map((i: any) => ({
          ...i,
          display_name: profileMap.get(i.invited_user_id)?.display_name || "Unknown User",
          avatar_url: profileMap.get(i.invited_user_id)?.avatar_url || null,
        }))
      );
    } else {
      setInvites([]);
    }
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    if (venueId) fetchInvites();
  }, [venueId, fetchInvites]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("search-users-for-invite", {
          body: { query: searchQuery.trim(), venue_id: venueId },
        });
        if (error) throw error;
        setSearchResults(data?.users || []);
      } catch (err: any) {
        console.error("Search error:", err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery, venueId]);

  const handleInvite = async (targetUser: SearchResult) => {
    if (!user) return;
    if (acceptedCount + pendingCount >= maxTestUsers) {
      toast.error(`Maximum ${maxTestUsers} active testers allowed`);
      return;
    }

    setInviting(targetUser.user_id);
    try {
      // Create invite
      const { error: insertError } = await (supabase as any)
        .from("venue_test_invites")
        .insert({
          venue_id: venueId,
          invited_user_id: targetUser.user_id,
          invited_by: user.id,
          status: "pending",
          test_balance_cents: 250000, // $2,500
        });

      if (insertError) {
        if (insertError.code === "23505") {
          toast.error("This user already has an active invite");
        } else {
          throw insertError;
        }
        return;
      }

      // Get venue name for notification
      const { data: venueData } = await supabase
        .from("venues")
        .select("name")
        .eq("id", venueId)
        .single();

      // Send notification to invited user
      await supabase.from("customer_notifications").insert({
        user_id: targetUser.user_id,
        type: "test_invite",
        title: `🧪 You've been invited to test ${venueData?.name || "a venue"}`,
        message: `Accept to get $2,500 in test funds to try out their menu and features. This is sandbox money — not real funds.`,
        reference_id: venueId,
        reference_type: "venue_test_invite",
      });

      toast.success(`Invite sent to ${targetUser.display_name}!`);
      setSearchQuery("");
      setSearchResults([]);
      fetchInvites();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send invite");
    } finally {
      setInviting(null);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("venue_test_invites")
        .update({ status: "revoked" })
        .eq("id", inviteId);

      if (error) throw error;
      toast.success("Invite revoked");
      fetchInvites();
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke invite");
    }
  };

  const pendingInvites = invites.filter(i => i.status === "pending");
  const acceptedInvites = invites.filter(i => i.status === "accepted");

  return (
    <Card className="glass border-border">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-amber-400" />
            <h2 className="text-xl font-bold">Test Users</h2>
          </div>
          <span className="text-sm text-muted-foreground">
            {acceptedCount + pendingCount}/{maxTestUsers}
          </span>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Invite up to {maxTestUsers} users to test your venue. Each tester gets $2,500 in sandbox funds to try your menu.
        </p>

        {/* Search input */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            disabled={acceptedCount + pendingCount >= maxTestUsers}
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div className="mb-4 rounded-lg border border-border bg-secondary/30 overflow-hidden">
            {searchResults.map((r) => (
              <div
                key={r.user_id}
                className="flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {r.display_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span className="text-sm font-medium">{r.display_name}</span>
                </div>
                {r.invite_status === "pending" ? (
                  <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">Pending</span>
                ) : r.invite_status === "accepted" ? (
                  <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">Tester</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleInvite(r)}
                    disabled={inviting === r.user_id}
                    className="gap-1.5 h-8"
                  >
                    {inviting === r.user_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <UserPlus className="h-3 w-3" />
                    )}
                    Invite
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Pending</span>
            </div>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/10"
                >
                  <div className="flex items-center gap-3">
                    {inv.avatar_url ? (
                      <img src={inv.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-amber-400">
                          {(inv.display_name || "U").charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{inv.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited {new Date(inv.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevoke(inv.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted Testers */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : acceptedInvites.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Active Testers</span>
            </div>
            <div className="space-y-2">
              {acceptedInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10"
                >
                  <div className="flex items-center gap-3">
                    {inv.avatar_url ? (
                      <img src={inv.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-400/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-emerald-400">
                          {(inv.display_name || "U").charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{inv.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Accepted {inv.accepted_at ? new Date(inv.accepted_at).toLocaleDateString() : ""}
                        {" · "}${(inv.test_balance_cents / 100).toLocaleString()} test balance
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevoke(inv.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="Revoke tester access"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : pendingInvites.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">
            No test users yet. Search and invite someone to start testing!
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

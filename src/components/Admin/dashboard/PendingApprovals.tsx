import { useEffect, useState } from "react";
import { Store, Check, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';

interface PendingVenue {
  id: string;
  name: string;
  city: string | null;
  venue_type: string | null;
  created_at: string;
}

export function PendingApprovals() {
  const { t } = useTranslation('admin');
  const [venues, setVenues] = useState<PendingVenue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPendingVenues();

    const channel = supabase
      .channel(createRealtimeChannelTopic("admin-pending-approvals"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "venues" },
        () => {
          fetchPendingVenues();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPendingVenues = async () => {
    try {
      const { data, error } = await supabase
        .from("venues")
        .select("id, name, city, venue_type, created_at")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setVenues(data || []);
    } catch (error) {
      console.error("Error fetching pending venues:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (venue: PendingVenue) => {
    setProcessingId(venue.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: updatedVenue, error } = await supabase
        .from("venues")
        .update({
          approval_status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq("id", venue.id)
        .select("id, approval_status")
        .maybeSingle();

      if (error) throw error;
      if (!updatedVenue || updatedVenue.approval_status !== "approved") {
        throw new Error("Approval failed (no permission or venue not found).");
      }

      // Create venue wallet if it doesn't exist
      const { error: walletError } = await supabase
        .from("venue_wallets")
        .upsert(
          {
            venue_id: venue.id,
            balance_jvc: 0,
            balance_usd: 0,
          },
          { onConflict: "venue_id" }
        );

      if (walletError) {
        console.error("Wallet creation error:", walletError);
      }

      // Log the action
      await supabase
        .from("admin_audit_log")
        .insert({
          admin_id: user.id,
          action_type: "venue_approved",
          target_type: "venue",
          target_id: venue.id,
          details: { venue_name: venue.name },
        });

      toast.success(`${venue.name} has been approved!`);
      fetchPendingVenues();
    } catch (error: any) {
      console.error("Error approving venue:", error);
      toast.error(error?.message || "Failed to approve venue");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (venue: PendingVenue) => {
    // Navigate to venues page to handle rejection with reason
    navigate("/admin/venues");
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  if (isLoading) {
    return (
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">Pending Approvals</h3>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">Pending Approvals</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-warning/10 text-warning rounded-full">
            {venues.length}
          </span>
        </div>
        <button 
          className="text-xs text-primary hover:underline"
          onClick={() => navigate("/admin/venues")}
        >
          View all
        </button>
      </div>
      <div className="space-y-3">
        {venues.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No pending approvals
          </div>
        ) : (
          venues.map((venue) => (
            <div
              key={venue.id}
              className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className="p-3 rounded-lg bg-warning/10">
                <Store className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{venue.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <MapPin className="w-3 h-3" />
                  {venue.city || "Unknown location"}
                  <span className="text-border">•</span>
                  {venue.venue_type || "Venue"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleReject(venue)}
                  disabled={processingId === venue.id}
                >
                  <X className="w-4 h-4" />
                </Button>
                <Button 
                  size="sm" 
                  className="bg-success hover:bg-success/90 text-success-foreground"
                  onClick={() => handleApprove(venue)}
                  disabled={processingId === venue.id}
                >
                  <Check className="w-4 h-4 mr-1" />
                  {processingId === venue.id ? "..." : "Approve"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

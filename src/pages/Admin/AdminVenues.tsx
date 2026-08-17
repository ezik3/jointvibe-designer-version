import { useState, useEffect } from "react";
import "./admin-dialogs.css";
import { Search, Filter, MoreHorizontal, Store, MapPin, Check, X, Eye, Clock, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from 'react-i18next';

interface Venue {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  venue_type: string | null;
  image_url: string | null;
  vibe_score: number | null;
  capacity: number | null;
  current_occupancy: number | null;
  created_at: string;
  approval_status: string;
  owner_user_id: string | null;
  business_license: string | null;
  business_email: string | null;
  rejection_reason: string | null;
  wallet?: {
    balance_jvc: number;
    balance_usd: number;
    is_frozen: boolean;
  };
}

const statusColors: Record<string, string> = {
  approved: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  rejected: "bg-destructive/10 text-destructive",
};

export default function AdminVenues() {
  const { t } = useTranslation('admin');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [venueToAction, setVenueToAction] = useState<Venue | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchVenues();

    const channel = supabase
      .channel(createRealtimeChannelTopic("admin-venues"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "venues" },
        () => {
          fetchVenues();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchVenues = async () => {
    try {
      const { data: venuesData, error } = await supabase
        .from("venues")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const venuesWithWallets = await Promise.all(
        (venuesData || []).map(async (venue) => {
          const { data: wallet } = await supabase
            .from("venue_wallets")
            .select("balance_jvc, balance_usd, is_frozen")
            .eq("venue_id", venue.id)
            .maybeSingle();

          return {
            ...venue,
            wallet: wallet || undefined
          };
        })
      );

      setVenues(venuesWithWallets);
    } catch (error) {
      console.error("Error fetching venues:", error);
      toast.error("Failed to fetch venues");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!venueToAction) return;
    setIsProcessing(true);

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
        .eq("id", venueToAction.id)
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
            venue_id: venueToAction.id,
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
          target_id: venueToAction.id,
          details: { venue_name: venueToAction.name },
        });

      toast.success(`${venueToAction.name} has been approved!`);
      setApproveDialogOpen(false);
      setVenueToAction(null);
      fetchVenues();
    } catch (error: any) {
      console.error("Error approving venue:", error);
      toast.error(error?.message || "Failed to approve venue");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!venueToAction || !rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setIsProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("venues")
        .update({
          approval_status: "rejected",
          rejection_reason: rejectionReason
        })
        .eq("id", venueToAction.id);

      if (error) throw error;

      // Log the action
      await supabase
        .from("admin_audit_log")
        .insert({
          admin_id: user?.id,
          action_type: "venue_rejected",
          target_type: "venue",
          target_id: venueToAction.id,
          details: { venue_name: venueToAction.name, reason: rejectionReason }
        });

      toast.success(`${venueToAction.name} has been rejected`);
      setRejectDialogOpen(false);
      setVenueToAction(null);
      setRejectionReason("");
      fetchVenues();
    } catch (error) {
      console.error("Error rejecting venue:", error);
      toast.error("Failed to reject venue");
    } finally {
      setIsProcessing(false);
    }
  };

  const openApproveDialog = (venue: Venue) => {
    setVenueToAction(venue);
    setApproveDialogOpen(true);
  };

  const openRejectDialog = (venue: Venue) => {
    setVenueToAction(venue);
    setRejectDialogOpen(true);
  };

  const filteredVenues = venues.filter((venue) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      venue.name.toLowerCase().includes(query) ||
      venue.city?.toLowerCase().includes(query) ||
      venue.venue_type?.toLowerCase().includes(query) ||
      venue.business_email?.toLowerCase().includes(query);
    
    if (activeTab === "pending") return matchesSearch && venue.approval_status === "pending";
    if (activeTab === "approved") return matchesSearch && venue.approval_status === "approved";
    if (activeTab === "rejected") return matchesSearch && venue.approval_status === "rejected";
    return matchesSearch;
  });

  const pendingCount = venues.filter((v) => v.approval_status === "pending").length;
  const approvedCount = venues.filter((v) => v.approval_status === "approved").length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Venue Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and manage venue registrations ({venues.length} total)
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          Export Venues
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList className="bg-muted">
            <TabsTrigger value="all">All Venues ({venues.length})</TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              Pending
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-warning/20 text-warning rounded-full">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">Active ({approvedCount})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search venues..."
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

        <TabsContent value={activeTab} className="mt-6">
          {/* Venues Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredVenues.map((venue) => (
              <div
                key={venue.id}
                className={cn(
                  "bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg p-5 transition-all duration-200",
                  venue.approval_status === "pending" && "border-warning/30"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-3 rounded-lg",
                      venue.approval_status === "pending" ? "bg-warning/10" : 
                      venue.approval_status === "rejected" ? "bg-destructive/10" : "bg-primary/10"
                    )}>
                      <Store className={cn(
                        "w-5 h-5",
                        venue.approval_status === "pending" ? "text-warning" : 
                        venue.approval_status === "rejected" ? "text-destructive" : "text-primary"
                      )} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{venue.name}</h3>
                      <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1", statusColors[venue.approval_status || "pending"])}>
                        {venue.approval_status}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="admin-menu-popover" align="end">
                      <DropdownMenuItem onClick={() => setSelectedVenue(venue)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {venue.approval_status === "pending" && (
                        <>
                          <DropdownMenuItem 
                            className="text-success"
                            onClick={() => openApproveDialog(venue)}
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => openRejectDialog(venue)}
                          >
                            <X className="w-4 h-4 mr-2" />
                            Reject
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {venue.address || venue.city || "Unknown location"}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Store className="w-4 h-4" />
                    {venue.venue_type || "Venue"}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Submitted: {new Date(venue.created_at).toLocaleDateString()}
                  </div>
                </div>

                {venue.business_email && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">Business Email</p>
                    <p className="text-sm text-foreground">{venue.business_email}</p>
                  </div>
                )}

                {venue.rejection_reason && (
                  <div className="mt-3 p-2 rounded bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center gap-1 text-xs text-destructive font-medium">
                      <AlertCircle className="w-3 h-3" />
                      Rejection Reason
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{venue.rejection_reason}</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-xs text-muted-foreground">JVC Balance</p>
                      <p className="text-sm font-medium text-primary">
                        {(venue.wallet?.balance_jvc || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-xs text-muted-foreground">Capacity</p>
                      <p className="text-sm font-medium text-foreground">
                        {venue.current_occupancy || 0}/{venue.capacity || "∞"}
                      </p>
                    </div>
                  </div>
                </div>

                {venue.approval_status === "pending" && (
                  <div className="flex items-center gap-2 mt-4">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => openRejectDialog(venue)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button 
                      size="sm" 
                      className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                      onClick={() => openApproveDialog(venue)}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredVenues.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No venues found
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Venue Details Dialog */}
      <Dialog open={!!selectedVenue} onOpenChange={(open) => !open && setSelectedVenue(null)}>
        <DialogContent className="admin-dialog max-w-2xl">
          <DialogHeader>
            <DialogTitle>Venue Details</DialogTitle>
          </DialogHeader>
          {selectedVenue && (
            <div className="space-y-6">
              <div className="flex items-start gap-6">
                <div className="w-32 h-32 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                  {selectedVenue.image_url ? (
                    <img
                      src={selectedVenue.image_url}
                      alt={selectedVenue.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Store className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-foreground">{selectedVenue.name}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    {selectedVenue.venue_type && (
                      <Badge className="bg-primary/20 text-primary">
                        {selectedVenue.venue_type}
                      </Badge>
                    )}
                    <Badge className={statusColors[selectedVenue.approval_status || "pending"]}>
                      {selectedVenue.approval_status}
                    </Badge>
                  </div>
                  {selectedVenue.description && (
                    <p className="text-muted-foreground mt-3">{selectedVenue.description}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="text-foreground mt-1">
                    {selectedVenue.address || "No address"}, {selectedVenue.city || "Unknown city"}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Business Email</p>
                  <p className="text-foreground mt-1">
                    {selectedVenue.business_email || "Not provided"}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Business License</p>
                  <p className="text-foreground mt-1">
                    {selectedVenue.business_license || "Not provided"}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Capacity</p>
                  <p className="text-foreground mt-1">
                    {selectedVenue.current_occupancy || 0} / {selectedVenue.capacity || "Unlimited"}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">JVC Balance</p>
                  <p className="text-primary font-semibold mt-1">
                    {(selectedVenue.wallet?.balance_jvc || 0).toLocaleString()} JVC
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">USD Balance</p>
                  <p className="text-success font-semibold mt-1">
                    ${(selectedVenue.wallet?.balance_usd || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Venue ID</p>
                <p className="text-muted-foreground font-mono text-sm mt-1">{selectedVenue.id}</p>
              </div>

              {selectedVenue.approval_status === "pending" && (
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    className="text-destructive"
                    onClick={() => {
                      setSelectedVenue(null);
                      openRejectDialog(selectedVenue);
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button 
                    className="admin-dialog__primary"
                    onClick={() => {
                      setSelectedVenue(null);
                      openApproveDialog(selectedVenue);
                    }}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={(open) => !isProcessing && setApproveDialogOpen(open)}>
        <AlertDialogContent className="admin-alert-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Venue</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve <strong>{venueToAction?.name}</strong>? 
              This will allow the venue owner to access their dashboard and start using the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="admin-alert-dialog__footer">
            <AlertDialogCancel className="admin-alert-dialog__secondary" disabled={isProcessing}>{t("common:app.cancel")}</AlertDialogCancel>
            <Button 
              className="admin-alert-dialog__primary"
              onClick={handleApprove}
              disabled={isProcessing}
            >
              {isProcessing ? "Approving..." : "Approve Venue"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>Reject Venue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Please provide a reason for rejecting <strong>{venueToAction?.name}</strong>.
              This will be shown to the venue owner.
            </p>
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={isProcessing || !rejectionReason.trim()}
            >
              {isProcessing ? "Rejecting..." : "Reject Venue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

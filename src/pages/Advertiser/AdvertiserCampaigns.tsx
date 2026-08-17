import { useEffect, useState } from "react";
import "./advertiser-popups.css";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  Search, 
  Eye,
  Pencil,
  Trash2,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Home,
  Building,
  Key,
  CalendarPlus
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from 'react-i18next';
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

export default function AdvertiserCampaigns() {
  const { t } = useTranslation('common');
  const { advertiser } = useOutletContext<{ advertiser: any }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    if (!advertiser) return;
    try {
      const { data: campaignsData, error } = await supabase
        .from("ad_campaigns")
        .select(`
          *,
          ad_media (id, media_url, is_primary),
          ad_bookings (id, payment_status, start_date, end_date)
        `)
        .eq("advertiser_id", advertiser.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const today = new Date().toISOString().split('T')[0];
      const processedCampaigns = (campaignsData || []).map((campaign: any) => {
        const hasActivePaidBooking = campaign.ad_bookings?.some((booking: any) =>
          booking.payment_status === 'paid' &&
          booking.start_date <= today &&
          booking.end_date >= today
        );

        let displayStatus = campaign.status;
        if (campaign.status === 'live' && !hasActivePaidBooking) {
          displayStatus = 'approved';
        } else if (campaign.status === 'approved' && hasActivePaidBooking) {
          displayStatus = 'live';
        }

        return {
          ...campaign,
          displayStatus,
          hasActivePaidBooking
        };
      });

      setCampaigns(processedCampaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!advertiser) return;
    fetchCampaigns();
  }, [advertiser]);

  useEffect(() => {
    if (searchParams.get("booking_success") !== "true") return;
    toast.success("Ad booking paid successfully. Campaign status updated.");
    fetchCampaigns();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("booking_success");
      next.delete("booking_id");
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, advertiser]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("ad_campaigns")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      setCampaigns(campaigns.filter((c) => c.id !== deleteId));
      toast.success("Campaign deleted successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete campaign");
    } finally {
      setDeleteId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any; className?: string; label?: string }> = {
      draft: { variant: "secondary", icon: Clock },
      pending: { variant: "outline", icon: Clock },
      approved: { variant: "default", icon: CheckCircle, className: "bg-amber-500 hover:bg-amber-500/80", label: "Ready to Book" },
      live: { variant: "default", icon: TrendingUp, className: "bg-green-500 hover:bg-green-500/80" },
      rejected: { variant: "destructive", icon: AlertCircle },
      paused: { variant: "secondary", icon: Clock },
      completed: { variant: "outline", icon: CheckCircle },
    };
    
    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;
    const label = config.label || status.charAt(0).toUpperCase() + status.slice(1);
    
    return (
      <Badge variant={config.variant} className={`gap-1 ${config.className || ""}`}>
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  const getPropertyTypeIcon = (type: string) => {
    switch (type) {
      case "for_sale": return <Home className="w-4 h-4" />;
      case "for_lease": return <Building className="w-4 h-4" />;
      case "for_rent": return <Key className="w-4 h-4" />;
      default: return <Home className="w-4 h-4" />;
    }
  };

  const getPropertyTypeLabel = (type: string) => {
    switch (type) {
      case "for_sale": return "For Sale";
      case "for_lease": return "For Lease";
      case "for_rent": return "For Rent";
      default: return type;
    }
  };

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = 
      campaign.headline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.property_address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.city.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Campaigns</h1>
          <p className="text-muted-foreground mt-1">
            Manage your property advertisements
          </p>
        </div>
        <Button asChild>
          <Link to="/advertiser/campaigns/new">
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="advertiser-select-popover">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns List */}
      {filteredCampaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {campaigns.length === 0 ? "No campaigns yet" : "No campaigns found"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {campaigns.length === 0 
                ? "Create your first property advertisement to get started"
                : "Try adjusting your search or filters"
              }
            </p>
            {campaigns.length === 0 && (
              <Button asChild>
                <Link to="/advertiser/campaigns/new">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Campaign
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredCampaigns.map((campaign) => {
            const primaryMedia = campaign.ad_media?.find((m: any) => m.is_primary) || campaign.ad_media?.[0];
            
            return (
              <Card key={campaign.id} className="overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  {/* Image */}
                  <div className="w-full md:w-48 h-32 md:h-auto bg-muted shrink-0">
                    {primaryMedia?.media_url ? (
                      <img
                        src={primaryMedia.media_url}
                        alt={campaign.headline}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Home className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(campaign.displayStatus || campaign.status)}
                          <Badge variant="outline" className="gap-1">
                            {getPropertyTypeIcon(campaign.property_type)}
                            {getPropertyTypeLabel(campaign.property_type)}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-lg text-foreground truncate">
                          {campaign.headline}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {campaign.property_address} • {campaign.city}
                        </p>
                        {campaign.property_price && (
                          <p className="text-lg font-bold text-primary mt-2">
                            ${campaign.property_price.toLocaleString()}
                          </p>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {(campaign.displayStatus === "approved" || (campaign.status === "approved" && !campaign.hasActivePaidBooking)) && (
                          <Button variant="default" size="sm" className="bg-orange-500 hover:bg-orange-600" asChild>
                            <Link to={`/advertiser/campaigns/${campaign.id}/book`}>
                              <CalendarPlus className="w-4 h-4 mr-1" />
                              Push Live
                            </Link>
                          </Button>
                        )}
                        {campaign.displayStatus === "live" && campaign.hasActivePaidBooking && (
                          <Button variant="default" size="sm" asChild>
                            <Link to={`/advertiser/campaigns/${campaign.id}/book`}>
                              <CalendarPlus className="w-4 h-4 mr-1" />
                              Book More
                            </Link>
                          </Button>
                        )}
                        <Button variant="outline" size="icon" asChild>
                          <Link to={`/advertiser/campaigns/${campaign.id}/preview`}>
                            <Eye className="w-4 h-4" />
                          </Link>
                        </Button>
                        <Button variant="outline" size="icon" asChild>
                          <Link to={`/advertiser/campaigns/${campaign.id}/edit`}>
                            <Pencil className="w-4 h-4" />
                          </Link>
                        </Button>
                        {campaign.status === "draft" && (
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => setDeleteId(campaign.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Meta */}
                    <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                      <span>Created {format(new Date(campaign.created_at), "MMM d, yyyy")}</span>
                      {campaign.rejection_reason && (
                        <span className="text-destructive">
                          Rejection: {campaign.rejection_reason}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="advertiser-alert-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this campaign? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="advertiser-alert-dialog__footer">
            <AlertDialogCancel className="advertiser-alert-dialog__cancel">{t("common:app.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="advertiser-alert-dialog__danger">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

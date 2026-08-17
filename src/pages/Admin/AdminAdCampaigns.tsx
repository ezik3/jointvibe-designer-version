import { useState, useEffect } from "react";
import "./admin-dialogs.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  Loader2, 
  Search,
  Image as ImageIcon,
  MapPin,
  DollarSign,
  Calendar,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from 'react-i18next';

interface Campaign {
  id: string;
  headline: string;
  description: string | null;
  property_address: string;
  city: string;
  property_type: string;
  property_price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  cta_text: string | null;
  cta_url: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  campaign_type?: string | null;
  auto_details?: any;
  advertiser: {
    company_name: string | null;
    contact_email: string;
  } | null;
  media: {
    id: string;
    media_url: string;
    is_primary: boolean;
  }[];
}

export default function AdminAdCampaigns() {
  const { t } = useTranslation('admin');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, [activeTab]);

  const fetchCampaigns = async () => {
    setLoading(true);
    
    let query = supabase
      .from("ad_campaigns")
      .select(`
        *,
        advertiser:advertisers(company_name, contact_email),
        media:ad_media(id, media_url, is_primary)
      `)
      .order("created_at", { ascending: false });

    if (activeTab !== "all") {
      query = query.eq("status", activeTab as any);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching campaigns:", error);
      toast.error("Failed to load campaigns");
    } else {
      setCampaigns(data || []);
    }
    
    setLoading(false);
  };

  const handleApprove = async (campaignId: string) => {
    setActionLoading(true);
    
    const { error } = await supabase
      .from("ad_campaigns")
      .update({ 
        status: "approved", // Set to approved, not live - advertisers must book to go live
        rejection_reason: null
      })
      .eq("id", campaignId);

    if (error) {
      toast.error("Failed to approve campaign");
    } else {
      toast.success("Campaign approved - advertiser can now book to go live");
      setShowReviewModal(false);
      setSelectedCampaign(null);
      fetchCampaigns();
    }
    
    setActionLoading(false);
  };

  const handleReject = async (campaignId: string) => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    setActionLoading(true);
    
    const { error } = await supabase
      .from("ad_campaigns")
      .update({ 
        status: "rejected",
        rejection_reason: rejectionReason
      })
      .eq("id", campaignId);

    if (error) {
      toast.error("Failed to reject campaign");
    } else {
      toast.success("Campaign rejected");
      setShowReviewModal(false);
      setSelectedCampaign(null);
      setRejectionReason("");
      fetchCampaigns();
    }
    
    setActionLoading(false);
  };

  const openReviewModal = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setRejectionReason(campaign.rejection_reason || "");
    setShowReviewModal(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      live: "default",
      rejected: "destructive",
      draft: "outline",
      paused: "outline"
    };
    
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getPropertyTypeLabel = (type: string) => {
    switch (type) {
      case "for_sale": return "For Sale";
      case "for_lease": return "For Lease";
      case "for_rent": return "For Rent";
      default: return type;
    }
  };

  const filteredCampaigns = campaigns.filter(campaign =>
    campaign.headline.toLowerCase().includes(searchQuery.toLowerCase()) ||
    campaign.property_address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    campaign.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (campaign.advertiser?.company_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const statusCounts = {
    all: campaigns.length,
    pending: campaigns.filter(c => c.status === "pending").length,
    live: campaigns.filter(c => c.status === "live").length,
    rejected: campaigns.filter(c => c.status === "rejected").length,
    draft: campaigns.filter(c => c.status === "draft").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Ad Campaign Moderation</h1>
        <p className="text-muted-foreground">Review and manage advertiser campaigns</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-500">{statusCounts.pending}</div>
            <div className="text-sm text-muted-foreground">Pending Review</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-500">{statusCounts.live}</div>
            <div className="text-sm text-muted-foreground">Live Campaigns</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-500">{statusCounts.rejected}</div>
            <div className="text-sm text-muted-foreground">Rejected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-muted-foreground">{statusCounts.draft}</div>
            <div className="text-sm text-muted-foreground">Drafts</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Tabs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="pending">
                    Pending ({statusCounts.pending})
                  </TabsTrigger>
                  <TabsTrigger value="live">Live</TabsTrigger>
                  <TabsTrigger value="rejected">Rejected</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                variant="outline"
                size="icon"
                onClick={fetchCampaigns}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No campaigns found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Advertiser</TableHead>
                  <TableHead>Listing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {campaign.media?.[0]?.media_url ? (
                          <img
                            src={campaign.media.find(m => m.is_primary)?.media_url || campaign.media[0].media_url}
                            alt=""
                            className="w-12 h-12 rounded object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{campaign.headline}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {campaign.city}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {campaign.advertiser?.company_name || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {campaign.advertiser?.contact_email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {campaign.campaign_type === 'auto' ? (
                        <>
                          <div className="text-sm">Vehicle • {[campaign.auto_details?.year, campaign.auto_details?.make, campaign.auto_details?.model].filter(Boolean).join(' ') || '—'}</div>
                          {campaign.auto_details?.price && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {Number(campaign.auto_details.price).toLocaleString()}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-sm">{getPropertyTypeLabel(campaign.property_type)}</div>
                          {campaign.property_price && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {campaign.property_price.toLocaleString()}
                            </div>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(campaign.created_at), "MMM d, yyyy")}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReviewModal(campaign)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Modal */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="admin-dialog max-w-3xl">
          {selectedCampaign && (
            <>
              <DialogHeader>
                <DialogTitle>Review Campaign</DialogTitle>
                <DialogDescription>
                  Review the campaign details before approving or rejecting
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Media Preview */}
                {selectedCampaign.media && selectedCampaign.media.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Media</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedCampaign.media.map((m) => (
                        <img
                          key={m.id}
                          src={m.media_url}
                          alt=""
                          className={`w-full aspect-video object-cover rounded-lg ${
                            m.is_primary ? "ring-2 ring-primary" : ""
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Campaign Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Headline</h4>
                    <p className="text-foreground">{selectedCampaign.headline}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">City</h4>
                    <p className="text-foreground">{selectedCampaign.city}</p>
                  </div>
                  {selectedCampaign.campaign_type === 'auto' ? (
                    <>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground">Vehicle</h4>
                        <p className="text-foreground">
                          {[selectedCampaign.auto_details?.year, selectedCampaign.auto_details?.make, selectedCampaign.auto_details?.model].filter(Boolean).join(' ') || '—'}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground">Listing Type</h4>
                        <p className="text-foreground capitalize">
                          {selectedCampaign.auto_details?.listing_type || 'sale'}
                        </p>
                      </div>
                      {selectedCampaign.auto_details?.price && (
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground">Price</h4>
                          <p className="text-foreground">${Number(selectedCampaign.auto_details.price).toLocaleString()}</p>
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground">Specs</h4>
                        <p className="text-foreground">
                          {selectedCampaign.auto_details?.km ? `${selectedCampaign.auto_details.km} km` : '—'}
                          {selectedCampaign.auto_details?.transmission ? ` • ${selectedCampaign.auto_details.transmission}` : ''}
                          {selectedCampaign.auto_details?.fuel ? ` • ${selectedCampaign.auto_details.fuel}` : ''}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground">Property Address</h4>
                        <p className="text-foreground">{selectedCampaign.property_address}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground">Property Type</h4>
                        <p className="text-foreground">{getPropertyTypeLabel(selectedCampaign.property_type)}</p>
                      </div>
                      {selectedCampaign.property_price && (
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground">Price</h4>
                          <p className="text-foreground">${selectedCampaign.property_price.toLocaleString()}</p>
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground">Specs</h4>
                        <p className="text-foreground">
                          {selectedCampaign.bedrooms} bed • {selectedCampaign.bathrooms} bath • {selectedCampaign.parking} parking
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {selectedCampaign.description && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                    <p className="text-foreground">{selectedCampaign.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">CTA Button</h4>
                    <p className="text-foreground">{selectedCampaign.cta_text || (selectedCampaign.campaign_type === 'auto' ? "View Listing" : "View Property")}</p>
                  </div>
                  {selectedCampaign.cta_url && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">CTA URL</h4>
                      <a 
                        href={selectedCampaign.cta_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate block"
                      >
                        {selectedCampaign.cta_url}
                      </a>
                    </div>
                  )}
                </div>

                {/* Advertiser Info */}
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Advertiser</h4>
                  <p className="text-foreground">{selectedCampaign.advertiser?.company_name || "No company name"}</p>
                  <p className="text-sm text-muted-foreground">{selectedCampaign.advertiser?.contact_email}</p>
                </div>

                {/* Rejection Reason Input */}
                {selectedCampaign.status === "pending" && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Rejection Reason (required if rejecting)</h4>
                    <Textarea
                      placeholder="Explain why this campaign is being rejected..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}

                {/* Show existing rejection reason */}
                {selectedCampaign.status === "rejected" && selectedCampaign.rejection_reason && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <h4 className="text-sm font-medium text-destructive">Rejection Reason</h4>
                    <p className="text-foreground mt-1">{selectedCampaign.rejection_reason}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button className="admin-dialog__secondary" variant="outline" onClick={() => setShowReviewModal(false)}>
                  Close
                </Button>
                {selectedCampaign.status === "pending" && (
                  <>
                    <Button
                      className="admin-dialog__danger"
                      variant="destructive"
                      onClick={() => handleReject(selectedCampaign.id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <XCircle className="w-4 h-4 mr-2" />
                      )}
                      Reject
                    </Button>
                    <Button
                      className="admin-dialog__primary"
                      onClick={() => handleApprove(selectedCampaign.id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="w-4 h-4 mr-2" />
                      )}
                      Approve
                    </Button>
                  </>
                )}
                {selectedCampaign.status === "rejected" && (
                  <Button
                    onClick={() => handleApprove(selectedCampaign.id)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Approve & Go Live
                  </Button>
                )}
                {selectedCampaign.status === "live" && (
                  <Button
                    variant="destructive"
                    onClick={() => handleReject(selectedCampaign.id)}
                    disabled={actionLoading || !rejectionReason.trim()}
                  >
                    Suspend Campaign
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

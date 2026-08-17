import { useState, useEffect } from 'react';
import "./admin-dialogs.css";
import { AdminLayout } from '@/components/Admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Flag, Eye, CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink, Image } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface VenueReport {
  id: string;
  reporter_id: string;
  reported_venue_id: string;
  report_type: string;
  description: string;
  evidence_urls: string[] | null;
  status: string;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  venue?: {
    name: string;
    venue_type: string;
    city: string;
  };
}

const reportTypeLabels: Record<string, string> = {
  scam: 'Scam / Fraud',
  impersonation: 'Impersonation',
  fraud: 'Financial Fraud',
  inappropriate_content: 'Inappropriate Content',
  wrong_location: 'Wrong Location',
  closed_business: 'Closed Business',
  other: 'Other',
};

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: { color: 'bg-amber-500/20 text-amber-400', icon: <Clock className="w-3 h-3" /> },
  under_review: { color: 'bg-blue-500/20 text-blue-400', icon: <Eye className="w-3 h-3" /> },
  resolved: { color: 'bg-green-500/20 text-green-400', icon: <CheckCircle className="w-3 h-3" /> },
  dismissed: { color: 'bg-gray-500/20 text-gray-400', icon: <XCircle className="w-3 h-3" /> },
};

export default function AdminVenueReports() {
  const { t } = useTranslation('admin');
  const [reports, setReports] = useState<VenueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<VenueReport | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, [filter]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('venue_reports')
        .select(`
          *,
          venue:reported_venue_id (
            name,
            venue_type,
            city
          )
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Transform the data to match our interface
      const transformedData = (data || []).map(report => ({
        ...report,
        venue: Array.isArray(report.venue) ? report.venue[0] : report.venue
      }));
      
      setReports(transformedData);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast({
        title: "Error",
        description: "Failed to load reports.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReport = async () => {
    if (!selectedReport) return;
    
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const updateData: Record<string, unknown> = {
        admin_notes: adminNotes || selectedReport.admin_notes,
      };

      if (newStatus && newStatus !== selectedReport.status) {
        updateData.status = newStatus;
        if (newStatus === 'resolved' || newStatus === 'dismissed') {
          updateData.resolved_at = new Date().toISOString();
          updateData.resolved_by = user?.id;
        }
      }

      const { error } = await supabase
        .from('venue_reports')
        .update(updateData)
        .eq('id', selectedReport.id);

      if (error) throw error;

      toast({
        title: "Report Updated",
        description: "The report has been updated successfully.",
      });

      setSelectedReport(null);
      fetchReports();
    } catch (error) {
      console.error('Error updating report:', error);
      toast({
        title: "Error",
        description: "Failed to update report.",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const openReportDetails = (report: VenueReport) => {
    setSelectedReport(report);
    setAdminNotes(report.admin_notes || '');
    setNewStatus(report.status);
  };

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flag className="w-6 h-6 text-destructive" />
              Venue Reports
            </h1>
            <p className="text-muted-foreground mt-1">
              Review and manage reported venues
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              {pendingCount} Pending
            </Badge>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {['all', 'pending', 'under_review', 'resolved', 'dismissed'].map((status) => (
            <Button
              key={status}
              variant={filter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(status)}
            >
              {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Button>
          ))}
        </div>

        {/* Reports List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No reports found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <Card key={report.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{report.venue?.name || 'Unknown Venue'}</h3>
                        <Badge className={statusConfig[report.status]?.color}>
                          <span className="flex items-center gap-1">
                            {statusConfig[report.status]?.icon}
                            {report.status.replace('_', ' ')}
                          </span>
                        </Badge>
                        <Badge variant="outline">
                          {reportTypeLabels[report.report_type] || report.report_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {report.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Reported: {format(new Date(report.created_at), 'MMM d, yyyy h:mm a')}</span>
                        {report.venue?.city && <span>📍 {report.venue.city}</span>}
                        {report.evidence_urls && report.evidence_urls.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Image className="w-3 h-3" />
                            {report.evidence_urls.length} evidence file(s)
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openReportDetails(report)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Report Details Modal */}
        <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
          <DialogContent className="admin-dialog max-w-2xl">
            <DialogHeader>
              <DialogTitle>Report Details</DialogTitle>
            </DialogHeader>

            {selectedReport && (
              <div className="space-y-6">
                {/* Venue Info */}
                <div className="p-4 bg-muted/50 rounded-xl">
                  <h3 className="font-semibold mb-2">{selectedReport.venue?.name || 'Unknown Venue'}</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Type: {selectedReport.venue?.venue_type || 'N/A'}</p>
                    <p>City: {selectedReport.venue?.city || 'N/A'}</p>
                    <p>Venue ID: {selectedReport.reported_venue_id}</p>
                  </div>
                </div>

                {/* Report Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className={statusConfig[selectedReport.status]?.color}>
                      {selectedReport.status.replace('_', ' ')}
                    </Badge>
                    <Badge variant="outline">
                      {reportTypeLabels[selectedReport.report_type]}
                    </Badge>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      {selectedReport.description}
                    </p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Reported on {format(new Date(selectedReport.created_at), 'MMMM d, yyyy h:mm a')}
                  </p>
                </div>

                {/* Evidence */}
                {selectedReport.evidence_urls && selectedReport.evidence_urls.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Evidence Files</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedReport.evidence_urls.map((url, index) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Image className="w-4 h-4" />
                          <span className="text-sm truncate">Evidence {index + 1}</span>
                          <ExternalLink className="w-3 h-3 ml-auto" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin Actions */}
                <div className="border-t pt-4 space-y-4">
                  <h4 className="text-sm font-medium">Admin Actions</h4>
                  
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Update Status</label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="admin-select-popover">
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Admin Notes</label>
                    <Textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add internal notes about this report..."
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedReport(null)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpdateReport}
                      disabled={updating}
                      className="flex-1"
                    >
                      {updating ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

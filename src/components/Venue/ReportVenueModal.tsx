import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Flag, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface ReportVenueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  venueName: string;
}

const reportTypeIds = ['scam', 'impersonation', 'fraud', 'inappropriate_content', 'wrong_location', 'closed_business', 'other'] as const;

const typeKeyMap: Record<string, { label: string; desc: string }> = {
  scam: { label: 'scam_label', desc: 'scam_desc' },
  impersonation: { label: 'impersonation_label', desc: 'impersonation_desc' },
  fraud: { label: 'fraud_label', desc: 'fraud_desc' },
  inappropriate_content: { label: 'inappropriate_label', desc: 'inappropriate_desc' },
  wrong_location: { label: 'wrong_location_label', desc: 'wrong_location_desc' },
  closed_business: { label: 'closed_label', desc: 'closed_desc' },
  other: { label: 'other_label', desc: 'other_desc' },
};

export default function ReportVenueModal({ open, onOpenChange, venueId, venueName }: ReportVenueModalProps) {
  const { t } = useTranslation('venue');
  const [reportType, setReportType] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setEvidenceFiles(prev => [...prev, ...newFiles].slice(0, 5));
    }
  };

  const removeFile = (index: number) => {
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!reportType || !description.trim()) {
      toast({
        title: t('report_modal.missing_info_title'),
        description: t('report_modal.missing_info_desc'),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: t('report_modal.must_login_title'),
          description: t('report_modal.must_login_desc'),
          variant: "destructive",
        });
        return;
      }

      const evidenceUrls: string[] = [];
      for (const file of evidenceFiles) {
        const fileName = `${user.id}/${venueId}/${Date.now()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('venue-assets')
          .upload(`reports/${fileName}`, file);

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage
            .from('venue-assets')
            .getPublicUrl(`reports/${fileName}`);
          evidenceUrls.push(urlData.publicUrl);
        }
      }

      const { error } = await supabase
        .from('venue_reports')
        .insert({
          reporter_id: user.id,
          reported_venue_id: venueId,
          report_type: reportType,
          description: description.trim(),
          evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : null,
        });

      if (error) throw error;

      toast({
        title: t('report_modal.submitted_title'),
        description: t('report_modal.submitted_desc'),
      });

      setReportType('');
      setDescription('');
      setEvidenceFiles([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting report:', error);
      toast({
        title: t('report_modal.submit_failed_title'),
        description: t('report_modal.submit_failed_desc'),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="venue-dialog-surface venue-dialog-surface--scroll max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Flag className="w-5 h-5" />
            {t('report_modal.title')}
          </DialogTitle>
          <DialogDescription>
            {t('report_modal.description')} <strong>{venueName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200">
              {t('report_modal.warning')}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('report_modal.issue_label')}</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue placeholder={t('report_modal.select_type')} />
              </SelectTrigger>
              <SelectContent>
                {reportTypeIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    <div className="flex flex-col">
                      <span>{t(`report_modal.types.${typeKeyMap[id].label}`)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reportType && (
              <p className="text-xs text-muted-foreground">
                {t(`report_modal.types.${typeKeyMap[reportType].desc}`)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('report_modal.describe_label')}</Label>
            <Textarea
              placeholder={t('report_modal.describe_placeholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/1000
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('report_modal.evidence_label')}</Label>
            <div className="border-2 border-dashed border-border/50 rounded-lg p-4 hover:border-primary/50 transition-colors">
              <input
                type="file"
                id="evidence"
                multiple
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
                disabled={evidenceFiles.length >= 5}
              />
              <label htmlFor="evidence" className="flex flex-col items-center cursor-pointer">
                <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground text-center">
                  {t('report_modal.evidence_upload')}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {t('report_modal.evidence_max')}
                </span>
              </label>
            </div>
            {evidenceFiles.length > 0 && (
              <div className="space-y-2">
                {evidenceFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                    <span className="text-sm text-foreground truncate">{file.name}</span>
                    <button type="button" onClick={() => removeFile(index)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isSubmitting}
            >
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 bg-destructive hover:bg-destructive/90"
              disabled={isSubmitting || !reportType || !description.trim()}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('report_modal.submitting', 'Submitting...')}
                </span>
              ) : (
                t('report_modal.submit')
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

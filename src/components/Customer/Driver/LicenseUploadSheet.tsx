import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

export default function LicenseUploadSheet({ open, onOpenChange, onUploaded }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/license-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('driver-verification')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from('driver-verification')
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      // Upsert driver_profiles row
      const { data: existing } = await supabase
        .from('driver_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('driver_profiles')
          .update({
            drivers_license_url: signed?.signedUrl || path,
            drivers_license_status: 'pending',
          } as any)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('driver_profiles').insert({
          user_id: user.id,
          drivers_license_url: signed?.signedUrl || path,
          drivers_license_status: 'pending',
        } as any);
        if (error) throw error;
      }

      toast.success("License uploaded — pending review");
      onUploaded();
      onOpenChange(false);
    } catch (err: any) {
      console.error('[LicenseUpload]', err);
      toast.error(err.message || 'Failed to upload license');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="customer-dialog-surface max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--customer-modal-text)]">Upload Driver's License</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-[var(--customer-modal-muted)] text-sm">
            Required for Car and Motorcycle modes. A clear photo of the front of your driver's license.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="customer-modal-primary w-full"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading…</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" />Choose File</>
            )}
          </Button>
          <p className="text-[var(--customer-modal-faint)] text-xs">
            Status will be marked as pending. You can select Car / Motorcycle once uploaded, but a reviewer must verify it before some advanced features unlock.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

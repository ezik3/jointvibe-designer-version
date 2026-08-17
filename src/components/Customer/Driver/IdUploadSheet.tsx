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

type IdType = 'drivers_license' | 'passport' | 'age_card';

export default function IdUploadSheet({ open, onOpenChange, onUploaded }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [idType, setIdType] = useState<IdType>('drivers_license');

  const handleFile = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/id-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('driver-verification')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from('driver-verification')
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      const { data: existing } = await supabase
        .from('driver_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const payload = {
        id_document_url: signed?.signedUrl || path,
        id_document_type: idType,
        id_document_status: 'pending',
      } as any;

      if (existing) {
        const { error } = await supabase
          .from('driver_profiles')
          .update(payload)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('driver_profiles')
          .insert({ user_id: user.id, ...payload });
        if (error) throw error;
      }

      toast.success("ID uploaded — pending 18+ verification");
      onUploaded();
      onOpenChange(false);
    } catch (err: any) {
      console.error('[IdUpload]', err);
      toast.error(err.message || 'Failed to upload ID');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="customer-dialog-surface max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--customer-modal-text)]">Upload 18+ Government ID</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-[var(--customer-modal-muted)] text-sm">
            Required for Bicycle and JV Runner modes. We need to confirm you are 18 or older.
          </p>

          <div>
            <label className="text-[var(--customer-modal-muted)] text-sm mb-2 block">Document type</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'drivers_license', l: "Driver's License" },
                { v: 'passport', l: 'Passport' },
                { v: 'age_card', l: 'Age Card' },
              ] as const).map(({ v, l }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setIdType(v)}
                  className={`p-2 rounded-[6px] border text-xs ${
                    idType === v
                      ? 'bg-[var(--customer-modal-cyan-soft)] border-[var(--customer-modal-cyan)] text-[var(--customer-modal-cyan)]'
                      : 'bg-[var(--customer-modal-canvas)] border-[var(--customer-modal-line)] text-[var(--customer-modal-muted)]'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

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
            You can select Bicycle / JV Runner once uploaded. You cannot go active or start a shift until your ID is at least pending.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

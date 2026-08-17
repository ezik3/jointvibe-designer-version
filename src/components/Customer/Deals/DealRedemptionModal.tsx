import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface DealRedemptionModalProps {
  open: boolean;
  onClose: () => void;
  code: string;
  venueName: string;
  dealHeadline: string;
}

const DealRedemptionModal = ({ open, onClose, code, venueName, dealHeadline }: DealRedemptionModalProps) => {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t('deals.code_copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="customer-dialog-surface max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{t('deals.redeemed')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-muted-foreground text-sm">
            {t('deals.show_to_staff')} <span className="text-foreground font-semibold">{venueName}</span>
          </p>

          {/* QR remains high contrast for venue scanners. */}
          <div className="relative inline-block mx-auto animate-scale-in">
            <div className="relative rounded-[6px] bg-white p-6">
              <QRCodeSVG value={code} size={160} level="H" />
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-mono font-bold text-primary tracking-[0.3em] tabular-nums">{code}</span>
            <Button size="sm" variant="ghost" onClick={handleCopy} className="customer-modal-secondary active:scale-95 duration-fast">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </Button>
          </div>

          <p className="text-foreground font-medium">{dealHeadline}</p>
          <p className="text-muted-foreground text-xs">{t('deals.unique_code')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DealRedemptionModal;

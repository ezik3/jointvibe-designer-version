import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rocket, Eye, CreditCard, Bell, BarChart3 } from "lucide-react";
import { getVenuePrice } from "@/config/venuePricing";
import { useTranslation } from 'react-i18next';

interface GoLiveGateModalProps {
  open: boolean;
  onClose: () => void;
  onGoLive: () => void;
  venueCountryCode: string;
}

const benefits = [
  { icon: Eye, text: "Visible to all JointVibe customers" },
  { icon: CreditCard, text: "Accept real payments" },
  { icon: Bell, text: "Send push notifications & ads" },
  { icon: BarChart3, text: "Full analytics & reporting" },
];

export default function GoLiveGateModal({ open, onClose, onGoLive, venueCountryCode }: GoLiveGateModalProps) {
  const { t } = useTranslation('venue');
  const price = getVenuePrice(venueCountryCode);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="venue-dialog-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Rocket className="h-5 w-5 text-emerald-400" />
            Ready to Go Live?
          </DialogTitle>
          <DialogDescription>
            Your venue is set up and looking great. Subscribe to start accepting real customers and payments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {benefits.map((b) => (
            <div key={b.text} className="flex items-center gap-3 text-sm">
              <b.icon className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-foreground">{b.text}</span>
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose}>Keep Testing</Button>
          <Button onClick={onGoLive} className="venue-dialog-primary-action gap-1.5">
            <Rocket className="h-4 w-4" />
            Go Live — {price.display}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

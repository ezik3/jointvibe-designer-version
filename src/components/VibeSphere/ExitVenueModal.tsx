import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';
import "./vibe-modal.css";

interface ExitVenueModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  onExitOnly: () => void;
  onCheckout: () => void;
}

const ExitVenueModal = ({ 
  isOpen, 
  onClose, 
  venueId, 
  venueName,
  onExitOnly,
  onCheckout 
}: ExitVenueModalProps) => {
  const { t } = useTranslation('venue');
  const { user } = useAuth();

  const handleExitOnly = () => {
    // Just exit the VibeSphere view but stay checked in
    toast.success("Exited VenueVerse - you're still checked in!");
    onClose();
    // Small delay to let modal close animation complete
    setTimeout(() => onExitOnly(), 100);
  };

  const handleFullCheckout = async () => {
    if (!user || !venueId) {
      onClose();
      setTimeout(() => onCheckout(), 100);
      return;
    }

    try {
      // Update check_in record with checkout time
      const { error } = await supabase
        .from("check_ins")
        .update({ checked_out_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("venue_id", venueId)
        .is("checked_out_at", null);

      if (error) throw error;

      toast.success(`Checked out of ${venueName}`);
      onClose();
      // Small delay to let modal close animation complete
      setTimeout(() => onCheckout(), 100);
    } catch (error) {
      console.error("Error checking out:", error);
      toast.error("Failed to checkout. Please try again.");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div 
          className="vibe-modal-backdrop absolute inset-0"
          onClick={onClose}
        />
        
        {/* Modal */}
        <motion.div
          className="vibe-modal vibe-modal--compact relative w-full p-6"
          initial={{ scale: 0.9, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 50 }}
        >
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Content */}
          <div className="text-center mb-6">
            <div className="vibe-modal__icon">
              <DoorOpen className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Leaving {venueName}?
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose how you'd like to exit
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {/* Exit but Stay Checked In */}
            <Button
              variant="outline"
              className="vibe-modal__option w-full justify-start px-4 text-left"
              onClick={handleExitOnly}
            >
              <div className="vibe-modal__option-icon">
                <DoorOpen className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground">Exit VenueVerse</p>
                <p className="text-xs text-muted-foreground">Stay checked in, browse the app</p>
              </div>
            </Button>

            {/* Full Checkout */}
            <Button
              variant="outline"
              className="vibe-modal__option vibe-modal__option--danger w-full justify-start px-4 text-left"
              onClick={handleFullCheckout}
            >
              <div className="vibe-modal__option-icon">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground">Checkout Completely</p>
                <p className="text-xs text-muted-foreground">Leave venue & sign out of location</p>
              </div>
            </Button>
          </div>

          {/* Cancel */}
          <Button
            variant="ghost"
            className="w-full mt-4 text-muted-foreground"
            onClick={onClose}
          >
            Cancel
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ExitVenueModal;

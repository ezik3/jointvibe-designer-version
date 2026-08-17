import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import VenueTierBadge from "./VenueTierBadge";
import { type VenueTierName } from "@/hooks/useVenueTier";
import { motion, AnimatePresence } from "framer-motion";
import { Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';

const REACH_LABELS: Record<string, string> = {
  bronze: "city level",
  silver: "city level",
  gold: "state level",
  diamond: "country level",
  platinum: "global",
};

interface VenueTierUpCelebrationModalProps {
  open: boolean;
  onClose: () => void;
  newTier: VenueTierName;
  venueName?: string;
}

export default function VenueTierUpCelebrationModal({
  open,
  onClose,
  newTier,
  venueName,
}: VenueTierUpCelebrationModalProps) {
  const { t } = useTranslation('venue');
  const { toast } = useToast();

  const handleShare = () => {
    const text = `${venueName || "Our venue"} just reached ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} tier on Joint Vibe! 🎉 Now visible at ${REACH_LABELS[newTier] || "city level"}.`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard!" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="venue-dialog-surface max-w-sm mx-auto text-center p-8">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", duration: 0.6 }}
              className="flex flex-col items-center gap-5"
            >
              <motion.div
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                transition={{ delay: 0.2, type: "spring" }}
              >
                <VenueTierBadge tier={newTier} size="lg" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-2xl font-bold text-white"
              >
                Venue Level Up! 🎉
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-zinc-400 text-sm"
              >
                {venueName || "Your venue"} now reaches{" "}
                <span className="text-white font-semibold">
                  {REACH_LABELS[newTier] || "more customers"}
                </span>{" "}
                in Hot Venues
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="flex gap-3 w-full"
              >
                <Button
                  onClick={handleShare}
                  className="venue-dialog-primary-action flex-1"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="venue-dialog-secondary-action flex-1"
                >
                  Nice!
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

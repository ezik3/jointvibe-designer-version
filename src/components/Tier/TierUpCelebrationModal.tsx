import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TierBadge from "./TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import { motion, AnimatePresence } from "framer-motion";
import { Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';

const REACH_LABELS: Record<string, string> = {
  suburb: "your suburb",
  city: "your entire city",
  state: "your state",
  country: "your entire country",
  global: "the whole world",
};

interface TierUpCelebrationModalProps {
  open: boolean;
  onClose: () => void;
  newTier: TierName;
  geographicReach: string;
}

export default function TierUpCelebrationModal({
  open,
  onClose,
  newTier,
  geographicReach,
}: TierUpCelebrationModalProps) {
  const { t } = useTranslation('common');
  const { toast } = useToast();

  const handleShare = () => {
    const text = `I just reached ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} tier on Joint Vibe! 🎉 My content now reaches ${REACH_LABELS[geographicReach] || geographicReach}.`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard!" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm text-center">
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
                <TierBadge tier={newTier} size="lg" className="text-base px-5 py-2" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-2xl font-bold text-foreground"
              >
                Level Up! 🎉
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-muted-foreground text-sm"
              >
                Your content now reaches{" "}
                <span className="text-foreground font-semibold">
                  {REACH_LABELS[geographicReach] || geographicReach}
                </span>
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="flex gap-3 w-full"
              >
                <Button
                  onClick={handleShare}
                  className="flex-1"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
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

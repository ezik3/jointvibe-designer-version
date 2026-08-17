import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ArrowDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import AmbientBackground from "./AmbientBackground";
import Venue3DBackground from "./Venue3DBackground";
import OrbsLayer from "./OrbsLayer";
import { supabase } from "@/integrations/supabase/client";
import FloatingAIButton from "@/components/Customer/FloatingAIButton";
import CustomerMenuModal from "./CustomerMenuModal";
import CustomerChatModal from "./CustomerChatModal";
import ExitVenueModal from "./ExitVenueModal";
import MyTableModal from "./MyTableModal";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';
import "./vibe-modal.css";

const VENUE_TUTORIAL_SHOWN_KEY = "jv_venue_tutorial_shown";

interface VenueShellProps {
  venueName: string;
  venueType?: string;
  vibeLevel?: string;
  priceLevel?: string;
  hours?: string;
  venueId?: string;
  onExit: () => void;
  onCheckout?: () => void;
}

const VenueShell = ({
  venueName,
  venueType,
  vibeLevel = "🔥 Lit",
  priceLevel = "💰 $$",
  hours = "Closes 2 AM",
  venueId,
  onExit,
  onCheckout,
}: VenueShellProps) => {
  const { t } = useTranslation('venue');
  // Check if tutorial was ever shown before
  const [showInstructions, setShowInstructions] = useState(() => {
    return !localStorage.getItem(VENUE_TUTORIAL_SHOWN_KEY);
  });
  const [showAIChat, setShowAIChat] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showMyTable, setShowMyTable] = useState(false);
  const [venue3DModel, setVenue3DModel] = useState<{ model_url: string; model_type: string; hotspots: any } | null>(null);

  // Fetch venue 3D model on mount
  useEffect(() => {
    if (!venueId) return;
    const fetch3DModel = async () => {
      const { data } = await supabase
        .from("venue_3d_models" as any)
        .select("model_url, model_type, hotspots")
        .eq("venue_id", venueId)
        .eq("status", "ready")
        .maybeSingle();
      if (data) setVenue3DModel(data as any);
    };
    fetch3DModel();
  }, [venueId]);

  // Mark tutorial as shown when user dismisses it
  const handleDismissInstructions = () => {
    localStorage.setItem(VENUE_TUTORIAL_SHOWN_KEY, "true");
    setShowInstructions(false);
  };

  const handleDoubleClick = () => {
    setShowAIChat(true);
    toast.success("AI Waiter summoned!");
  };

  const handleExitClick = () => {
    setShowExitModal(true);
  };

  const handleExitOnly = () => {
    // Exit VenueVerse but stay checked in - close modal first
    setShowExitModal(false);
    onExit();
  };

  const handleFullCheckout = () => {
    // Full checkout - close modal and exit
    setShowExitModal(false);
    if (onCheckout) {
      onCheckout();
    }
    onExit();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-black"
      style={{ overflow: 'hidden', top: 0, left: 0, right: 0, bottom: 0 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Background: 3D venue model if available, otherwise ambient particles */}
      {venue3DModel ? (
        <Venue3DBackground
          modelUrl={venue3DModel.model_url}
          modelType={venue3DModel.model_type}
          hotspots={venue3DModel.hotspots}
        />
      ) : (
        <AmbientBackground />
      )}

      {/* Header Info Bar - Top Left on all screens */}
      <motion.div
        className="fixed top-4 left-4 z-30"
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <div className="vibe-venue-shell__info px-4 py-2 sm:px-6 sm:py-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-white text-sm sm:text-base">
            <span className="font-bold">{venueName}</span>
            <span className="text-white/50 hidden sm:inline">•</span>
            <span className="text-cyan">{vibeLevel}</span>
            <span className="text-white/50 hidden sm:inline">•</span>
            <span className="text-primary">{priceLevel}</span>
            <span className="text-white/50 hidden sm:inline">•</span>
            <span className="text-white/60">{hours}</span>
          </div>
        </div>
      </motion.div>

      {/* Floating Orbs */}
      <OrbsLayer 
        onAIClick={() => setShowAIChat(true)} 
        onMenuClick={() => setShowMenu(true)}
        onChatClick={() => setShowChat(true)}
        onTableClick={() => setShowMyTable(true)}
      />

      {/* Instructions Card */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            <div className="vibe-venue-shell__tutorial max-w-sm p-6">
              <div className="flex items-start gap-3 mb-4">
                <Info className="w-5 h-5 text-cyan flex-shrink-0 mt-0.5" />
                <div className="space-y-2 text-white/80 text-sm">
                  <p>🔮 Tap any orb to explore features</p>
                  <p>👆 Swipe up to exit venue</p>
                  <p>✨ Double tap anywhere for AI Waiter</p>
                </div>
              </div>
              <Button
                onClick={handleDismissInstructions}
                className="w-full"
              >
                Got it!
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit Button */}
      <motion.div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        <Button
          onClick={handleExitClick}
          variant="outline"
          className="vibe-venue-shell__exit px-6 py-3 text-foreground"
        >
          <ArrowDown className="w-5 h-5 mr-2" />
          Exit Venue
        </Button>
      </motion.div>

      {/* Exit Venue Modal */}
      <ExitVenueModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        venueId={venueId || ""}
        venueName={venueName}
        onExitOnly={handleExitOnly}
        onCheckout={handleFullCheckout}
      />

      {/* AI Chat - uses same visual as homepage AI assistant */}
      {showAIChat && venueId && (
        <FloatingAIButton
          mode="venue"
          venueId={venueId}
          defaultOpen
          onClose={() => setShowAIChat(false)}
        />
      )}

      {/* Customer Menu Modal */}
      <CustomerMenuModal
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        venueId={venueId || ""}
        venueName={venueName}
      />

      {/* Customer Chat Modal */}
      <CustomerChatModal
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        venueId={venueId || ""}
        venueName={venueName}
      />

      {/* My Table Modal */}
      <MyTableModal
        isOpen={showMyTable}
        onClose={() => setShowMyTable(false)}
        venueId={venueId || ""}
        venueName={venueName}
      />
    </motion.div>
  );
};

export default VenueShell;

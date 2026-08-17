import { useVenueFollow } from "@/hooks/useVenueFollow";
import { Button } from "@/components/ui/button";
import { Heart, UserPlus, UserCheck, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import fistIcon from "@/assets/fist-icon.png";
import { useTranslation } from 'react-i18next';

interface VenueFollowButtonProps {
  venueId: string;
  variant?: "default" | "compact";
  showCounts?: boolean;
}

const VenueFollowButton = ({ 
  venueId, 
  variant = "default",
  showCounts = true 
}: VenueFollowButtonProps) => {
  const { t } = useTranslation('venue');
  const { 
    isFollowing, 
    hasPounded, 
    followCount, 
    poundCount, 
    loading, 
    toggleFollow, 
    togglePound 
  } = useVenueFollow(venueId);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled>
          <Loader2 className="w-4 h-4 animate-spin" />
        </Button>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleFollow}
          className={`${
            isFollowing 
              ? "text-cyan bg-cyan/20 hover:bg-cyan/30" 
              : "text-white/60 hover:text-cyan hover:bg-cyan/10"
          }`}
        >
          {isFollowing ? (
            <UserCheck className="w-4 h-4" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          {showCounts && <span className="ml-1 text-xs">{followCount}</span>}
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={togglePound}
          className={`relative ${
            hasPounded 
              ? "text-pink bg-pink/20 hover:bg-pink/30" 
              : "text-white/60 hover:text-pink hover:bg-pink/10"
          }`}
        >
          <AnimatePresence>
            {hasPounded && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <img src={fistIcon} alt="pound" className="w-4 h-4" />
              </motion.div>
            )}
          </AnimatePresence>
          {!hasPounded && <Heart className="w-4 h-4" />}
          {hasPounded && <span className="opacity-0 w-4 h-4" />}
          {showCounts && <span className="ml-1 text-xs">{poundCount}</span>}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={toggleFollow}
        className={`transition-all ${
          isFollowing 
            ? "bg-cyan/20 text-cyan border-cyan/30 hover:bg-cyan/30" 
            : "bg-white/5 text-white hover:bg-white/10 border-white/10"
        }`}
        variant="outline"
      >
        {isFollowing ? (
          <>
            <UserCheck className="w-4 h-4 mr-2" />
            Following
          </>
        ) : (
          <>
            <UserPlus className="w-4 h-4 mr-2" />
            Follow
          </>
        )}
        {showCounts && (
          <span className="ml-2 px-2 py-0.5 rounded-full bg-white/10 text-xs">
            {followCount}
          </span>
        )}
      </Button>

      <Button
        onClick={togglePound}
        className={`relative transition-all ${
          hasPounded 
            ? "bg-pink/20 text-pink border-pink/30 hover:bg-pink/30" 
            : "bg-white/5 text-white hover:bg-white/10 border-white/10"
        }`}
        variant="outline"
      >
        <AnimatePresence mode="wait">
          {hasPounded ? (
            <motion.div
              key="pounded"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              className="flex items-center"
            >
              <img src={fistIcon} alt="pound" className="w-5 h-5 mr-2" />
              Pounded
            </motion.div>
          ) : (
            <motion.div
              key="unpounded"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="flex items-center"
            >
              <Heart className="w-4 h-4 mr-2" />
              Pound
            </motion.div>
          )}
        </AnimatePresence>
        {showCounts && (
          <span className="ml-2 px-2 py-0.5 rounded-full bg-white/10 text-xs">
            {poundCount}
          </span>
        )}
      </Button>
    </div>
  );
};

export default VenueFollowButton;

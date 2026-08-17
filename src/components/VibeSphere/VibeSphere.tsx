import { AnimatePresence } from "framer-motion";
import CheckInTransition from "./CheckInTransition";
import VenueShell from "./VenueShell";
import { useTranslation } from 'react-i18next';

interface VibeSphereProps {
  isCheckedIn: boolean;
  isTransitioning: boolean;
  venueName: string;
  venueType?: string;
  vibeLevel?: string;
  priceLevel?: string;
  hours?: string;
  venueId?: string;
  onExit: () => void;
  onCheckout?: () => void;
}

const VibeSphere = ({
  isCheckedIn,
  isTransitioning,
  venueName,
  venueType,
  vibeLevel,
  priceLevel,
  hours,
  venueId,
  onExit,
  onCheckout,
}: VibeSphereProps) => {
  const { t } = useTranslation('common');
  return (
    <>
      {/* Check-in Transition Animation */}
      <CheckInTransition
        isVisible={isTransitioning}
        venueName={venueName}
        venueType={venueType}
        vibeLevel={vibeLevel}
      />

      {/* Immersive Venue Shell */}
      <AnimatePresence>
        {isCheckedIn && !isTransitioning && (
          <VenueShell
            venueName={venueName}
            venueType={venueType}
            vibeLevel={vibeLevel}
            priceLevel={priceLevel}
            hours={hours}
            venueId={venueId}
            onExit={onExit}
            onCheckout={onCheckout}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default VibeSphere;

import { ReactNode, useRef, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import VenueProximityMonitor from "./VenueProximityMonitor";
import DesktopNavShell from "./DesktopNavShell";
import { useGlobalPrefetch } from "@/hooks/useGlobalPrefetch";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import LiveFollowerPopup from "./Live/LiveFollowerPopup";
import TierUpCelebrationModal from "@/components/Tier/TierUpCelebrationModal";
import FloatingAIButton from "./FloatingAIButton";
import "./customer-dialog.css";
import { useUserTier, getTierIndex, type TierName } from "@/hooks/useUserTier";
import { MobileNavVisibilityProvider, useMobileNavVisibility } from "@/contexts/MobileNavVisibilityContext";
import { useTranslation } from 'react-i18next';
import useCustomerDashboardPresentation from "@/hooks/useCustomerDashboardPresentation";

interface CustomerLayoutProps {
  children: ReactNode;
}

const usesMobileDashboardChrome = (pathname: string, isDashboardPresentation: boolean) =>
  isDashboardPresentation
    || pathname === "/app/venues"
    || pathname.startsWith("/app/venue/")
    || pathname === "/app/maps"
    || pathname === "/app/settings/security";

const CustomerLayoutInner = ({ children }: CustomerLayoutProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  const { currentTier, geographicReach, loading: tierLoading } = useUserTier();
  const { mobileNavsVisible } = useMobileNavVisibility();
  const useMobileDashboardChrome = usesMobileDashboardChrome(location.pathname, isDashboardPresentation);

  // Track tier-up celebrations
  const prevTierRef = useRef<TierName | null>(null);
  const [celebrationTier, setCelebrationTier] = useState<TierName | null>(null);
  const [celebrationReach, setCelebrationReach] = useState("");

  useEffect(() => {
    if (tierLoading) return;
    if (prevTierRef.current !== null && getTierIndex(currentTier) > getTierIndex(prevTierRef.current)) {
      setCelebrationTier(currentTier);
      setCelebrationReach(geographicReach);
    }
    prevTierRef.current = currentTier;
  }, [currentTier, tierLoading, geographicReach]);
  
  // Prefetch all key data on mount for instant page loads
  useGlobalPrefetch(user?.id);

  // Desktop: wrap in nav shell with left rail + top bar
  if (!isMobile || useMobileDashboardChrome) {
    return (
      <>
        <DesktopNavShell mobilePresentation={isMobile && useMobileDashboardChrome}>
          {/* No key on the wrapper — keeps caches/state alive across routes.
              React Router swaps `children` on navigation, so each page still
              mounts fresh; we just don't tear down the entire shell. */}
          <div className="min-h-full">
            {children}
          </div>
        </DesktopNavShell>
        <VenueProximityMonitor />
        <LiveFollowerPopup />
        <FloatingAIButton />
        {celebrationTier && (
          <TierUpCelebrationModal
            open={!!celebrationTier}
            onClose={() => setCelebrationTier(null)}
            newTier={celebrationTier}
            geographicReach={celebrationReach}
          />
        )}
      </>
    );
  }

  // Mobile: same page transition on route change
  return (
    <>
      <main>
        {children}
      </main>
      <VenueProximityMonitor />
      <LiveFollowerPopup />
      <FloatingAIButton visible={mobileNavsVisible} />
      {celebrationTier && (
        <TierUpCelebrationModal
          open={!!celebrationTier}
          onClose={() => setCelebrationTier(null)}
          newTier={celebrationTier}
          geographicReach={celebrationReach}
        />
      )}
    </>
  );
};

const CustomerLayout = ({ children }: CustomerLayoutProps) => {
  return (
    <MobileNavVisibilityProvider>
      <CustomerLayoutInner>{children}</CustomerLayoutInner>
    </MobileNavVisibilityProvider>
  );
};

export default CustomerLayout;

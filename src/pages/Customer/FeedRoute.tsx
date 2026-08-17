import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from 'react-i18next';

const ImmersiveFeed = lazy(() => import("./ImmersiveFeed"));
const DesktopFeed = lazy(() => import("./DesktopFeed"));

const FeedRoute = () => {
  const { t } = useTranslation('feed');
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const useDashboardPresentation = searchParams.get("presentation") === "dashboard";

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-white">
          Loading…
        </div>
      }
    >
      {isMobile && !useDashboardPresentation ? <ImmersiveFeed /> : <DesktopFeed />}
    </Suspense>
  );
};

export default FeedRoute;

import { FlaskConical, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVenuePrice } from "@/config/venuePricing";
import { useTranslation } from 'react-i18next';

interface TestingModeBannerProps {
  testUserCount: number;
  maxTestUsers: number;
  venueCountryCode: string;
  isVerified: boolean;
  onGoLive: () => void;
  onVerifyVenue: () => void;
}

export default function TestingModeBanner({
  testUserCount,
  maxTestUsers,
  venueCountryCode,
  isVerified,
  onGoLive,
  onVerifyVenue,
}: TestingModeBannerProps) {
  const { t } = useTranslation('venue');
  const price = getVenuePrice(venueCountryCode);

  return (
    <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-amber-200 min-w-0">
        <FlaskConical className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="truncate">
          <span className="font-semibold">Testing Mode</span>
          <span className="hidden sm:inline"> — Your venue is hidden from customers.</span>
          <span className="text-amber-300/80 ml-1">{testUserCount}/{maxTestUsers} test users</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        {isVerified ? (
          <Button
            size="sm"
            onClick={onGoLive}
            className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <Rocket className="h-3.5 w-3.5" />
            Go Live — {price.display}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onVerifyVenue}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Verify Venue
          </Button>
        )}
      </div>
    </div>
  );
}

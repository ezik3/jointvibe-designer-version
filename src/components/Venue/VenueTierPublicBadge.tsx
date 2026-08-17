import VenueTierBadge from "./VenueTierBadge";
import { type VenueTierName } from "@/hooks/useVenueTier";
import { useTranslation } from 'react-i18next';

interface VenueTierPublicBadgeProps {
  tier: VenueTierName;
  isFounder?: boolean;
  className?: string;
}

export default function VenueTierPublicBadge({ tier, isFounder = false, className }: VenueTierPublicBadgeProps) {
  const { t } = useTranslation('venue');
  return (
    <VenueTierBadge tier={tier} size="sm" isFounder={isFounder} className={className} />
  );
}

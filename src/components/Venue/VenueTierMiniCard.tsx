import { useNavigate } from "react-router-dom";
import VenueTierBadge from "./VenueTierBadge";
import { type VenueTierName } from "@/hooks/useVenueTier";
import { useTranslation } from 'react-i18next';

interface VenueTierMiniCardProps {
  tier: VenueTierName;
  compositeScore: number;
  isFounder?: boolean;
}

export default function VenueTierMiniCard({ tier, compositeScore, isFounder = false }: VenueTierMiniCardProps) {
  const { t } = useTranslation('venue');
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/venue/home")}
      className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-accent/10 transition-colors"
    >
      <VenueTierBadge tier={tier} size="sm" isFounder={isFounder} showLabel={false} />
      <span className="text-xs text-muted-foreground font-medium">{compositeScore}</span>
    </button>
  );
}

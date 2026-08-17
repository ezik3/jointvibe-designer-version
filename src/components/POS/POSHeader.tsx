import { Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useVenueWallet } from "@/hooks/useVenueWallet";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenueTier } from "@/hooks/useVenueTier";
import VenueTierMiniCard from "@/components/Venue/VenueTierMiniCard";
import { useTranslation } from 'react-i18next';

export default function POSHeader() {
  const { t } = useTranslation('pos');
  const navigate = useNavigate();
  const [venueId, setVenueId] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchVenueId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: venue } = await supabase
        .from('venues')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();
      
      if (venue) {
        setVenueId(venue.id);
      }
    };
    fetchVenueId();
  }, []);
  
  const { balance, loading } = useVenueWallet(venueId);
  const venueTier = useVenueTier(venueId);
  
  const displayBalance = loading ? '...' : `$${balance.jvc.toLocaleString()}`;
  
  return (
    <div className="flex items-center gap-2">
      {!venueTier.loading && venueId && (
        <VenueTierMiniCard
          tier={venueTier.currentTier}
          compositeScore={venueTier.compositeScore}
          isFounder={venueTier.isFounderVenue}
        />
      )}
      <Button
      variant="ghost"
      size="sm"
      className="flex items-center gap-2 text-primary hover:text-primary/80 hover:bg-primary/10"
      onClick={() => navigate('/venue/wallet')}
    >
        <Wallet className="w-4 h-4" />
        <span className="font-medium">{displayBalance}</span>
      </Button>
    </div>
  );
}

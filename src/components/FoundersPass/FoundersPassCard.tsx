import { Crown, Shield, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FounderEntitlement, PassType, CityProduct } from '@/types/foundersPass';
import { FounderOwnershipCard } from './FounderOwnershipCard';
import { useTranslation } from 'react-i18next';

interface FoundersPassCardProps {
  entitlement: FounderEntitlement | null;
  passType: PassType;
  loading?: boolean;
}

export function FoundersPassCard({ entitlement, passType, loading }: FoundersPassCardProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const routePrefix = passType === 'venue' ? '/venue/founders' : '/app/founders';

  // Get user's city from localStorage to check availability
  const userCountry = passType === 'venue'
    ? (() => { try { return JSON.parse(localStorage.getItem('jv_venue_data') || '{}').country; } catch { return ''; } })()
    : localStorage.getItem('jv_user_country') || '';

  const userCitySlug = passType === 'venue'
    ? localStorage.getItem('jv_venue_city_slug')
    : localStorage.getItem('jv_user_city_slug');

  // Check if user's city product is sold out
  const { data: cityProduct } = useQuery({
    queryKey: ['city-product-card', userCitySlug, passType],
    queryFn: async (): Promise<CityProduct | null> => {
      if (!userCitySlug) return null;
      const { data, error } = await supabase
        .from('city_products')
        .select('*')
        .eq('slug', userCitySlug)
        .eq('pass_type', passType)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CityProduct | null;
    },
    enabled: !!userCitySlug,
  });

  // Check if user's country has ANY active city products
  const { data: otherCities } = useQuery({
    queryKey: ['other-cities-card', userCountry, passType],
    queryFn: async (): Promise<CityProduct[]> => {
      if (!userCountry) return [];
      const { data, error } = await supabase
        .from('city_products')
        .select('*')
        .eq('country', userCountry)
        .eq('pass_type', passType)
        .eq('is_active', true);
      if (error) throw error;
      return (data as unknown as CityProduct[]) || [];
    },
    enabled: !!userCountry && !entitlement,
  });

  // If user's country has NO products at all, hide completely
  const countryHasProducts = otherCities && otherCities.length > 0;
  const countryCheckDone = !!userCountry && otherCities !== undefined;

  if (loading) return null;

  // No country set or country has no products — hide entirely
  if (!userCountry || (countryCheckDone && !countryHasProducts)) return null;

  // Has entitlement — show premium Founder Ownership Card
  if (entitlement) {
    // Find the matching city product for remaining count
    const entitlementCityProduct = cityProduct || (entitlement.city_product as unknown as CityProduct) || null;
    return (
      <FounderOwnershipCard
        entitlement={entitlement}
        cityProduct={entitlementCityProduct}
      />
    );
  }

  // Check if user's city is sold out
  const isCitySoldOut = cityProduct && cityProduct.sold_count >= cityProduct.total_supply;
  const hasOtherCitiesAvailable = otherCities?.some(c => c.sold_count < c.total_supply && c.slug !== userCitySlug);

  // City sold out and no other cities available — hide entirely
  if (isCitySoldOut && !hasOtherCitiesAvailable) {
    return null;
  }

  // City sold out but other cities available — show browse link
  if (isCitySoldOut && hasOtherCitiesAvailable) {
    return (
      <button
        onClick={() => navigate(`${routePrefix}/cities`)}
        className="w-full bg-zinc-800/60 hover:bg-zinc-800/80 border border-zinc-700/50 rounded-xl p-4 flex items-center gap-4 transition-colors text-left group"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
          <Crown className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">Founders License</span>
          <p className="text-sm font-bold text-foreground">Your city is sold out</p>
          <span className="text-xs text-amber-400">Browse other cities →</span>
        </div>
        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </button>
    );
  }

  return (
    <button
      onClick={() => navigate(routePrefix)}
      className="w-full bg-zinc-800/60 hover:bg-zinc-800/80 border border-primary/30 rounded-xl p-4 flex items-center gap-4 transition-colors text-left group"
    >
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
        <Crown className="w-6 h-6 text-primary" />
      </div>
      <div className="flex-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">Founders License</span>
        <p className="text-sm font-bold text-foreground">Limited to 1,000/city</p>
        <span className="text-xs text-primary">Learn more →</span>
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
    </button>
  );
}

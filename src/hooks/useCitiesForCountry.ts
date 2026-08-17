import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CityProduct, PassType } from '@/types/foundersPass';

export function useCitiesForCountry(country: string, passType: PassType) {
  return useQuery({
    queryKey: ['city-products-by-country', country, passType],
    queryFn: async (): Promise<CityProduct[]> => {
      const { data, error } = await supabase
        .from('city_products')
        .select('*')
        .eq('country', country)
        .eq('pass_type', passType)
        .eq('is_active', true)
        .order('city', { ascending: true });
      if (error) throw error;
      // Only return cities with remaining passes
      return ((data as unknown as CityProduct[]) || []).filter(
        p => p.sold_count < p.total_supply
      );
    },
    enabled: !!country,
  });
}

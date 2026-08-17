import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CityProduct, FounderEntitlement, PassType } from '@/types/foundersPass';

export function useCityProducts(passType: PassType) {
  return useQuery({
    queryKey: ['city-products', passType],
    queryFn: async (): Promise<CityProduct[]> => {
      const { data, error } = await supabase
        .from('city_products')
        .select('*')
        .eq('is_active', true)
        .eq('pass_type', passType)
        .order('tier', { ascending: true })
        .order('city', { ascending: true });
      if (error) throw error;
      return (data as unknown as CityProduct[]) || [];
    },
  });
}

export function useCityProduct(slug: string, passType: PassType) {
  return useQuery({
    queryKey: ['city-product', slug, passType],
    queryFn: async (): Promise<CityProduct | null> => {
      const { data, error } = await supabase
        .from('city_products')
        .select('*')
        .eq('slug', slug)
        .eq('pass_type', passType)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CityProduct | null;
    },
    enabled: !!slug,
  });
}

export function useCityProductsByCountry(passType: PassType) {
  const { data: products, ...rest } = useCityProducts(passType);

  const productsByCountry = products?.reduce((acc, product) => {
    if (!acc[product.country]) acc[product.country] = [];
    acc[product.country].push(product);
    return acc;
  }, {} as Record<string, CityProduct[]>) || {};

  return { productsByCountry, products, ...rest };
}

export function useFounderEntitlement(passType: PassType) {
  return useQuery({
    queryKey: ['founder-entitlement', passType],
    queryFn: async (): Promise<FounderEntitlement | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('founder_entitlements')
        .select('*, city_product:city_products(*)')
        .eq('user_id', user.id)
        .eq('pass_type', passType)
        .in('status', ['active', 'pending_kyc', 'pending_claim'])
        .maybeSingle();

      if (error) throw error;
      return data as unknown as FounderEntitlement | null;
    },
  });
}

export function getRemainingCount(product: CityProduct): number {
  return Math.max(0, product.total_supply - product.sold_count);
}

export function getScarcityLevel(remaining: number, total: number): 'low' | 'medium' | 'high' {
  const pct = (remaining / total) * 100;
  if (pct <= 20) return 'low';
  if (pct <= 50) return 'medium';
  return 'high';
}

export function formatFoundersPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

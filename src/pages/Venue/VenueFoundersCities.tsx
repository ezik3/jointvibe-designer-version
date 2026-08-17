import { useState, useMemo } from 'react';
import { CityCard } from '@/components/FoundersPass/CityCard';
import { useCityProductsByCountry } from '@/hooks/useFoundersPass';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function VenueFoundersCities() {
  const { t } = useTranslation('venue');
  const { products, productsByCountry, isLoading } = useCityProductsByCountry('venue');
  const [searchQuery, setSearchQuery] = useState('');
  const venueCountry = (() => { try { return JSON.parse(localStorage.getItem('jv_venue_data') || '{}').country || null; } catch { return null; } })();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(venueCountry);

  const countries = useMemo(() => Object.keys(productsByCountry).sort(), [productsByCountry]);
  const filteredProducts = useMemo(() => {
    let filtered = products || [];
    if (searchQuery) { const q = searchQuery.toLowerCase(); filtered = filtered.filter(p => p.city.toLowerCase().includes(q) || p.country.toLowerCase().includes(q)); }
    if (selectedCountry) filtered = filtered.filter(p => p.country === selectedCountry);
    return filtered;
  }, [products, searchQuery, selectedCountry]);

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container mx-auto px-4">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">Choose Your <span className="text-primary">City</span></h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">Secure a Venue Founders License for your city.</p>
        </div>
        <div className="mb-8 space-y-4">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search cities..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant={!selectedCountry ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCountry(null)}><Globe className="mr-1 h-4 w-4" />All</Button>
            {countries.map(c => (
              <Button key={c} variant={selectedCountry === c ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCountry(c)}>
                {c}<Badge variant="secondary" className="ml-2">{productsByCountry[c]?.length}</Badge>
              </Button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-24 text-center"><p className="text-muted-foreground">No cities found.</p></div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map(city => <CityCard key={city.id} city={city} passType="venue" />)}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import "./advertiser-popups.css";
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, differenceInDays } from 'date-fns';
import { APP_CITIES } from '@/constants/cities';
import { 
  CalendarIcon, 
  MapPin, 
  DollarSign, 
  ArrowLeft, 
  Loader2,
  Building2,
  Users,
  TrendingUp,
  Car
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import SuburbMapboxSelector from '@/components/Advertiser/SuburbMapboxSelector';

type PlacementType = 'city_view' | 'public_post' | 'sidebar' | 'driver_signup';

interface Campaign {
  id: string;
  headline: string;
  property_address: string;
  city: string;
  property_type: string;
  campaign_type?: string | null;
  country?: string | null;
  state?: string | null;
}

// Use shared cities from constants

const PLACEMENT_INFO: Record<PlacementType, { name: string; description: string; baseRate: number; icon: any; reach: string }> = {
  city_view: {
    name: 'City View Background',
    description: 'Your property appears as the full-screen background on the City View discovery page',
    baseRate: 50,
    icon: Building2,
    reach: '~10,000 impressions/day'
  },
  sidebar: {
    name: 'Desktop Sidebar',
    description: 'Your property is featured as a "Featured Tonight" card in the desktop home feed sidebar — always visible, no scrolling required',
    baseRate: 40,
    icon: TrendingUp,
    reach: '~8,000 impressions/day'
  },
  public_post: {
    name: 'Public Post Background',
    description: 'Your property appears as the background when users view public posts',
    baseRate: 30,
    icon: Users,
    reach: '~5,000 impressions/day'
  },
  driver_signup: {
    name: 'Driver Signup Spotlight (Maps)',
    description: 'Your vehicle ad appears on the Maps page to people signing up to drive in this location — perfect for selling/leasing cars to rideshare drivers',
    baseRate: 30,
    icon: Car,
    reach: '~3,000 driver signups/day'
  }
};

export default function CampaignBooking() {
  const { t } = useTranslation('common');
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [placementType, setPlacementType] = useState<PlacementType>('city_view');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(addDays(new Date(), 7));
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedSuburbs, setSelectedSuburbs] = useState<string[]>([]);
  const [bidAmount, setBidAmount] = useState<number>(0);
  // Real-estate campaigns can target whole cities OR specific suburbs (like driver-signup ads)
  const [targetMode, setTargetMode] = useState<'cities' | 'suburbs'>('cities');

  const isAuto = campaign?.campaign_type === 'auto';
  const useSuburbs = isAuto || targetMode === 'suburbs';

  useEffect(() => {
    if (searchParams.get('cancelled') === 'true') {
      toast.error('Payment was cancelled');
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchCampaign = async () => {
      if (!campaignId) return;
      
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('id, headline, property_address, city, property_type, campaign_type, auto_details')
        .eq('id', campaignId)
        .single();

      if (error || !data) {
        toast.error('Campaign not found');
        navigate('/advertiser/campaigns');
        return;
      }

      const c: Campaign = {
        id: data.id,
        headline: data.headline,
        property_address: data.property_address || '',
        city: data.city,
        property_type: data.property_type || '',
        campaign_type: (data as any).campaign_type,
        country: (data as any).auto_details?.country || null,
        state: null,
      };
      setCampaign(c);
      setSelectedCities([data.city]);
      if ((data as any).campaign_type === 'auto') {
        setPlacementType('driver_signup');
      }
      setLoading(false);
    };

    fetchCampaign();
  }, [campaignId, navigate]);

  const toggleCity = (city: string) => {
    setSelectedCities(prev => 
      prev.includes(city) 
        ? prev.filter(c => c !== city)
        : [...prev, city]
    );
  };

  const days = startDate && endDate 
    ? differenceInDays(endDate, startDate) + 1 
    : 0;
  
  const placementInfo = PLACEMENT_INFO[placementType];
  // Per-suburb pricing when suburb mode is active (auto ads always; real-estate when toggled)
  const targetUnits = useSuburbs ? selectedSuburbs.length : selectedCities.length;
  const basePrice = placementInfo.baseRate * days * targetUnits;
  const totalPrice = basePrice + bidAmount;

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (useSuburbs && selectedSuburbs.length === 0) {
      toast.error('Please add at least one suburb');
      return;
    }
    if (!useSuburbs && selectedCities.length === 0) {
      toast.error('Please select at least one city');
      return;
    }

    if (endDate < startDate) {
      toast.error('End date must be after start date');
      return;
    }

    setSubmitting(true);
    try {
      // For real-estate suburb mode, gather selected cities (or campaign city as fallback)
      const suburbCities = !isAuto && useSuburbs
        ? (selectedCities.length > 0 ? selectedCities : (campaign ? [campaign.city] : []))
        : null;

      const targetLocations = useSuburbs && campaign
        ? {
            country: (campaign.country || '').trim() || null,
            state: (campaign.state || '').trim() || null,
            city: campaign.city,
            cities: suburbCities ?? undefined,
            suburbs: selectedSuburbs,
          }
        : undefined;

      // For suburb-targeted campaigns, send a city payload so existing
      // city-based discovery hooks keep working; the real targeting unit
      // is the suburbs list.
      const targetCitiesPayload = useSuburbs
        ? (suburbCities && suburbCities.length > 0
            ? suburbCities
            : (campaign ? [campaign.city] : []))
        : selectedCities;

      const { data, error } = await supabase.functions.invoke('create-ad-booking', {
        body: {
          campaignId,
          placementType,
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          targetCities: targetCitiesPayload,
          targetSuburbs: useSuburbs ? selectedSuburbs : undefined,
          targetLocations,
          bidAmount,
          origin: window.location.origin,
        }
      });

      if (error || !data?.url) throw new Error(error?.message || 'Failed to create checkout session');

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error: any) {
      console.error('Booking error:', error);
      toast.error(error.message || 'Failed to create booking');
      setSubmitting(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/advertiser/campaigns')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Book Ad Placement</h1>
          <p className="text-muted-foreground">{campaign?.headline}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Placement Selection */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Select Placement</CardTitle>
            <CardDescription>Choose where your ad will appear</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {((campaign?.campaign_type === 'auto'
                ? ['driver_signup']
                : ['city_view', 'sidebar', 'public_post']) as PlacementType[]).map((type) => {
                const info = PLACEMENT_INFO[type];
                const Icon = info.icon;
                const isSelected = placementType === type;
                
                return (
                  <button
                    key={type}
                    onClick={() => setPlacementType(type)}
                    className={cn(
                      "p-4 rounded-lg border-2 text-left transition-all",
                      isSelected 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{info.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary">${info.baseRate}/day/city</Badge>
                          <span className="text-xs text-muted-foreground">{info.reach}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Pricing Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Price Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Placement</span>
                <span>{placementInfo.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span>{days} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{useSuburbs ? 'Suburbs' : 'Cities'}</span>
                <span>{targetUnits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Rate</span>
                <span>${placementInfo.baseRate}/day/{useSuburbs ? 'suburb' : 'city'}</span>
              </div>
              <hr className="border-border" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Price</span>
                <span>${basePrice.toFixed(2)}</span>
              </div>
              <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                ${placementInfo.baseRate} × {days} days × {targetUnits} {useSuburbs ? (targetUnits === 1 ? 'suburb' : 'suburbs') : (targetUnits === 1 ? 'city' : 'cities')} = ${basePrice.toFixed(2)}
              </div>
              {bidAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Priority Bid</span>
                  <span>+${bidAmount.toFixed(2)}</span>
                </div>
              )}
              <hr className="border-border" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
            </div>

            <Button 
              className="w-full" 
              size="lg"
              onClick={handleSubmit}
              disabled={submitting || days <= 0 || targetUnits === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>Proceed to Payment</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Date Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Campaign Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal text-foreground">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="advertiser-calendar-popover">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={(date) => {
                        const d = new Date(date); d.setHours(0,0,0,0);
                        const t = new Date(); t.setHours(0,0,0,0);
                        return d < t;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal text-foreground">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="advertiser-calendar-popover">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => {
                        const d = new Date(date); d.setHours(0,0,0,0);
                        const min = new Date(startDate || new Date()); min.setHours(0,0,0,0);
                        return d < min;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Each day runs 8 AM → 8 AM local time. Pay today and your ad goes live at the next 8 AM cutover (or instantly if it's still before 8 AM today).
            </p>
          </CardContent>
        </Card>

        {/* City / Suburb Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {useSuburbs ? `Target Suburbs${campaign?.city ? ` in ${campaign.city}` : ''}` : 'Target Cities'}
            </CardTitle>
            <CardDescription>
              {isAuto
                ? 'Driver-signup ads are hyper-local. Search & add suburbs you want to target — each adds to your daily cost.'
                : useSuburbs
                  ? 'Hyper-local targeting. Search & add suburbs you want to target — each adds to your daily cost.'
                  : 'Select cities where your ad will appear'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Real-estate campaigns: switch between whole-city and suburb targeting */}
            {!isAuto && (
              <div className="mb-4 inline-flex rounded-lg border border-border p-1 bg-muted/30">
                <button
                  type="button"
                  onClick={() => setTargetMode('cities')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    targetMode === 'cities' ? "bg-background text-foreground shadow-sm" : "text-white/70 hover:text-foreground"
                  )}
                >
                  Whole cities
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('suburbs')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    targetMode === 'suburbs' ? "bg-background text-foreground shadow-sm" : "text-white/70 hover:text-foreground"
                  )}
                >
                  Specific suburbs
                </button>
              </div>
            )}

            {useSuburbs ? (
              <SuburbMapboxSelector
                city={campaign?.city || ''}
                country={campaign?.country || null}
                selected={selectedSuburbs}
                onChange={setSelectedSuburbs}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {APP_CITIES.map((city) => (
                    <div key={city} className="flex items-center space-x-2">
                      <Checkbox
                        id={city}
                        checked={selectedCities.includes(city)}
                        onCheckedChange={() => toggleCity(city)}
                      />
                      <label
                        htmlFor={city}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {city}
                      </label>
                    </div>
                  ))}
                </div>
                {selectedCities.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedCities.map((city) => (
                      <Badge key={city} variant="secondary">
                        {city}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Priority Bidding */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Priority Bidding
            </CardTitle>
            <CardDescription>
              Add a bid to increase your ad's priority when multiple ads compete for the same slot
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bid">Additional Bid Amount (USD)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="bid"
                    type="text"
                    inputMode="numeric"
                    value={bidAmount === 0 ? "" : bidAmount.toString()}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setBidAmount(val === '' ? 0 : parseInt(val, 10));
                    }}
                    className="pl-9"
                    placeholder="0"
                  />
                </div>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-xs">
                <p className="font-medium text-foreground">How Bidding Works:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Higher bids get priority placement when multiple ads target the same city and dates</li>
                  <li>All bids are anonymous - advertisers cannot see other bids</li>
                  <li>If your bid wins, you pay your bid amount on top of the base price</li>
                  <li>If another advertiser outbids you, your payment is not charged</li>
                  <li>Payment is only processed after successful checkout</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

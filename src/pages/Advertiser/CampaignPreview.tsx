import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Loader2, 
  Home, 
  Building, 
  Key,
  Bed,
  Bath,
  Car,
  MapPin,
  ExternalLink,
  Monitor,
  Smartphone
} from 'lucide-react';
import AdOverlay from '@/components/Ads/AdOverlay';
import AdBanner from '@/components/Ads/AdBanner';
import { useTranslation } from 'react-i18next';

interface Campaign {
  id: string;
  headline: string;
  description: string | null;
  property_address: string;
  city: string;
  property_type: string;
  property_price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  cta_text: string | null;
  cta_url: string | null;
  status: string;
  campaign_type?: string | null;
  auto_details?: any;
}

interface Media {
  id: string;
  media_url: string;
  is_primary: boolean;
}

export default function CampaignPreview() {
  const { t } = useTranslation('common');
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');

  useEffect(() => {
    const fetchCampaign = async () => {
      if (!campaignId) return;

      const { data: campaignData, error: campaignError } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError) {
        console.error('Error fetching campaign:', campaignError);
        setLoading(false);
        return;
      }

      setCampaign(campaignData);

      const { data: mediaData } = await supabase
        .from('ad_media')
        .select('id, media_url, is_primary')
        .eq('campaign_id', campaignId)
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true });

      setMedia(mediaData || []);
      setLoading(false);
    };

    fetchCampaign();
  }, [campaignId]);

  const getPropertyTypeIcon = (type: string) => {
    switch (type) {
      case 'for_sale': return <Home className="w-4 h-4" />;
      case 'for_lease': return <Building className="w-4 h-4" />;
      case 'for_rent': return <Key className="w-4 h-4" />;
      default: return <Home className="w-4 h-4" />;
    }
  };

  const getPropertyTypeLabel = (type: string) => {
    switch (type) {
      case 'for_sale': return 'For Sale';
      case 'for_lease': return 'For Lease';
      case 'for_rent': return 'For Rent';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Campaign not found</p>
        <Button onClick={() => navigate('/advertiser/campaigns')} className="mt-4">
          Back to Campaigns
        </Button>
      </div>
    );
  }

  const primaryMedia = media.find(m => m.is_primary) || media[0];
  const backgroundUrl = primaryMedia?.media_url || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=80';

  const noop = () => {
    if (campaign.cta_url) {
      window.open(campaign.cta_url, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/advertiser/campaigns')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Campaign Preview</h1>
          <p className="text-muted-foreground">See exactly how your ad appears to users</p>
        </div>
        {/* Preview mode toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={previewMode === 'mobile' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setPreviewMode('mobile')}
            className="gap-1.5"
          >
            <Smartphone className="w-4 h-4" />
            Mobile
          </Button>
          <Button
            variant={previewMode === 'desktop' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setPreviewMode('desktop')}
            className="gap-1.5"
          >
            <Monitor className="w-4 h-4" />
            Desktop
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Live Preview - takes 2 cols */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden border-2 border-dashed border-primary/30">
            <CardHeader className="pb-2 bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Live Preview — {previewMode === 'mobile' ? 'City View (Mobile)' : 'City View (Desktop)'}
                </CardTitle>
                <Badge variant="outline" className="text-xs">How users see your ad</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Phone / Desktop frame */}
              <div className={`mx-auto ${previewMode === 'mobile' ? 'max-w-[375px]' : 'w-full'}`}>
                <div 
                  className={`relative bg-black overflow-hidden ${
                    previewMode === 'mobile' 
                      ? 'aspect-[9/16] rounded-[2rem] border-[6px] border-zinc-800 shadow-2xl' 
                      : 'aspect-[16/9] rounded-lg'
                  }`}
                >
                  {/* Background Image */}
                  <div 
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${backgroundUrl})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/80" />
                  </div>

                  {/* City Name */}
                  <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none z-10">
                    <h2 
                      className={`font-black text-white tracking-wider drop-shadow-2xl ${
                        previewMode === 'mobile' ? 'text-3xl' : 'text-5xl'
                      }`} 
                      style={{ textShadow: '4px 4px 8px rgba(0,0,0,0.5)' }}
                    >
                      {campaign.city.toUpperCase()}
                    </h2>
                  </div>

                  {/* Mock user cards - subtle background detail */}
                  {previewMode === 'mobile' && (
                    <div className="absolute bottom-44 left-0 right-0 px-3 flex gap-2 overflow-hidden pointer-events-none opacity-40">
                      {[1,2,3].map(i => (
                        <div key={i} className="flex-shrink-0 w-28 h-36 rounded-xl bg-black/50 backdrop-blur-sm border border-white/10" />
                      ))}
                    </div>
                  )}

                  {/* Ad Overlay - exactly as it appears */}
                  <AdOverlay
                    headline={campaign.headline}
                    description={campaign.description}
                    propertyPrice={campaign.property_price ?? campaign.auto_details?.price ?? null}
                    propertyType={campaign.property_type}
                    propertyAddress={campaign.campaign_type === 'auto'
                      ? `${campaign.city}${campaign.auto_details?.country ? `, ${campaign.auto_details.country}` : ''}`
                      : campaign.property_address}
                    ctaText={campaign.cta_text}
                    ctaUrl={campaign.cta_url}
                    onCtaClick={noop}
                    variant={campaign.campaign_type === 'auto' ? 'auto' : 'real_estate'}
                    autoDetails={campaign.auto_details}
                    position={campaign.campaign_type === 'auto' ? 'top-right' : 'bottom-left'}
                  />

                  {/* Desktop banner preview */}
                  {previewMode === 'desktop' && (
                    <div className="absolute bottom-0 left-0 right-0">
                      <AdBanner
                        headline={campaign.headline}
                        description={campaign.description}
                        propertyPrice={campaign.property_price ?? campaign.auto_details?.price ?? null}
                        propertyType={campaign.property_type}
                        propertyAddress={campaign.campaign_type === 'auto'
                          ? `${campaign.city}${campaign.auto_details?.country ? `, ${campaign.auto_details.country}` : ''}`
                          : campaign.property_address}
                        ctaText={campaign.cta_text}
                        ctaUrl={campaign.cta_url}
                        onCtaClick={noop}
                        variant={campaign.campaign_type === 'auto' ? 'auto' : 'real_estate'}
                        autoDetails={campaign.auto_details}
                      />
                    </div>
                  )}

                  {/* Mobile notch */}
                  {previewMode === 'mobile' && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-zinc-800 rounded-b-2xl z-20" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Campaign Details sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{campaign.campaign_type === 'auto' ? 'Vehicle Details' : 'Property Details'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                {campaign.campaign_type === 'auto' ? (
                  <Badge variant="outline" className="gap-1">
                    <Car className="w-4 h-4" />
                    {campaign.auto_details?.listing_type === 'rent' ? 'For Rent' : campaign.auto_details?.listing_type === 'lease' ? 'For Lease' : 'For Sale'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    {getPropertyTypeIcon(campaign.property_type)}
                    {getPropertyTypeLabel(campaign.property_type)}
                  </Badge>
                )}
                <Badge variant="secondary">{campaign.status}</Badge>
              </div>

              <div>
                <h3 className="font-semibold text-lg">{campaign.headline}</h3>
                {campaign.campaign_type === 'auto' ? (
                  <p className="text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="w-4 h-4" />
                    {campaign.city}
                  </p>
                ) : (
                  <p className="text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="w-4 h-4" />
                    {campaign.property_address}, {campaign.city}
                  </p>
                )}
              </div>

              {(() => {
                const auto = campaign.auto_details;
                const isAutoLease = auto && auto.listing_type && auto.listing_type !== "for_sale";
                if (isAutoLease && auto?.price_weekly) {
                  return (
                    <p className="text-2xl font-bold text-primary">
                      ${Number(auto.price_weekly).toLocaleString()}/wk
                    </p>
                  );
                }
                const sale = campaign.property_price ?? auto?.price ?? null;
                if (sale) {
                  return (
                    <p className="text-2xl font-bold text-primary">
                      ${Number(sale).toLocaleString()}
                    </p>
                  );
                }
                return null;
              })()}

              {campaign.description && (
                <p className="text-muted-foreground">{campaign.description}</p>
              )}

              {campaign.campaign_type === 'auto' ? (
                <div className="grid grid-cols-2 gap-3 pt-4 border-t text-sm">
                  {campaign.auto_details?.year && <div><span className="text-muted-foreground">Year: </span>{campaign.auto_details.year}</div>}
                  {campaign.auto_details?.make && <div><span className="text-muted-foreground">Make: </span>{campaign.auto_details.make}</div>}
                  {campaign.auto_details?.model && <div><span className="text-muted-foreground">Model: </span>{campaign.auto_details.model}</div>}
                  {campaign.auto_details?.km && <div><span className="text-muted-foreground">KM: </span>{campaign.auto_details.km}</div>}
                  {campaign.auto_details?.transmission && <div><span className="text-muted-foreground">Transmission: </span>{campaign.auto_details.transmission}</div>}
                  {campaign.auto_details?.fuel && <div><span className="text-muted-foreground">Fuel: </span>{campaign.auto_details.fuel}</div>}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  {campaign.bedrooms && (
                    <div className="flex items-center gap-2">
                      <Bed className="w-4 h-4 text-muted-foreground" />
                      <span>{campaign.bedrooms} Beds</span>
                    </div>
                  )}
                  {campaign.bathrooms && (
                    <div className="flex items-center gap-2">
                      <Bath className="w-4 h-4 text-muted-foreground" />
                      <span>{campaign.bathrooms} Baths</span>
                    </div>
                  )}
                  {campaign.parking && (
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-muted-foreground" />
                      <span>{campaign.parking} Cars</span>
                    </div>
                  )}
                </div>
              )}

              {campaign.cta_url && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={campaign.cta_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {campaign.cta_text || (campaign.campaign_type === 'auto' ? 'View Listing' : 'View Property')}
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Media Gallery */}
          {media.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Media Gallery ({media.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {media.map((m, index) => (
                    <div
                      key={m.id}
                      className={`aspect-square rounded-lg overflow-hidden border-2 ${
                        m.is_primary ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      <img
                        src={m.media_url}
                        alt={`Property ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

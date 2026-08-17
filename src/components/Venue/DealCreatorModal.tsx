import { useState, useEffect } from "react";
import { updateVenueScoreCounter } from "@/hooks/useVenueTier";
import { useVenueDealsLibrary } from "@/hooks/useVenueDealsLibrary";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Image as ImageIcon, Video, Percent, Calendar, MapPin,
  Eye, ChevronLeft, ChevronRight, Upload, Sparkles, Loader2, Zap,
  ShoppingCart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import "./deal-creator-modal.css";

const QUICK_TEMPLATES = [
  { emoji: '🍹', label: 'Happy Hour', headline: 'Happy Hour is ON!', discount: '50% off drinks', cta: 'CLAIM NOW' },
  { emoji: '📅', label: 'Fill Seats', headline: 'Special Deal This Week', discount: 'Book 2 get 1 free', cta: 'BOOK NOW' },
  { emoji: '⚡', label: 'Flash Sale', headline: 'Flash Sale — Tonight Only!', discount: 'Up to 40% off', cta: 'REDEEM' },
];

export const DEAL_DRAFT_STORAGE_KEY = 'push_deal_draft';

export interface DealPrefillData {
  headline: string;
  discount: string;
  description: string;
}

interface DealCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableCredits?: number;
  venueId?: string;
  prefillData?: DealPrefillData | null;
  menuItemImageUrl?: string;
  /** When set, links the created deal back to this vibe (convert-to-deal flow) */
  linkedVibeId?: string;
  /** Called when user wants to buy push credits (no credits available) */
  onBuyCredits?: () => void;
}

type AdFormat = 'image' | 'video' | 'carousel';
type PreviewPlatform = 'feed' | 'stories' | 'search';

export default function DealCreatorModal({
  isOpen,
  onClose,
  availableCredits = 0,
  venueId,
  prefillData,
  menuItemImageUrl,
  linkedVibeId,
  onBuyCredits,
}: DealCreatorModalProps) {
  const [step, setStep] = useState<'format' | 'creative' | 'details' | 'preview'>('format');
  const [adFormat, setAdFormat] = useState<AdFormat>('image');
  const [previewPlatform, setPreviewPlatform] = useState<PreviewPlatform>('feed');
  const [publishing, setPublishing] = useState(false);
  const [quickLaunch, setQuickLaunch] = useState(true);

  const [adData, setAdData] = useState({
    headline: '',
    description: '',
    callToAction: 'REDEEM',
    discount: '',
    validUntil: '',
    mediaUrl: '',
    terms: '',
  });

  const [uploadedMedia, setUploadedMedia] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  // Real deal library hook — reads credits and provides createDeal / publishDeal
  const { createDeal, publishDeal, credits } = useVenueDealsLibrary(venueId || null);

  // Use live credits from DB across ALL tiers; fall back to prop while loading
  const totalCreditsAcrossTiers = Object.values(credits).reduce((sum, n) => sum + n, 0);
  const realCredits = totalCreditsAcrossTiers > 0 ? totalCreditsAcrossTiers : availableCredits;
  const hasNoCredits = realCredits <= 0;

  // Save current draft to sessionStorage so it can be restored after purchase
  const saveDraft = () => {
    try {
      const draft: DealPrefillData & { callToAction?: string; validUntil?: string; terms?: string } = {
        headline: adData.headline,
        discount: adData.discount,
        description: adData.description,
        callToAction: adData.callToAction,
        validUntil: adData.validUntil,
        terms: adData.terms,
      };
      sessionStorage.setItem(DEAL_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // sessionStorage unavailable — ignore
    }
  };

  const handleBuyCredits = () => {
    saveDraft();
    onBuyCredits?.();
  };

  // When prefillData is provided, jump to creative step with pre-filled data
  useEffect(() => {
    if (isOpen && prefillData) {
      setAdFormat('image');
      setStep('creative');
      setAdData(prev => ({
        ...prev,
        headline: prefillData.headline || prev.headline,
        discount: prefillData.discount || prev.discount,
        description: prefillData.description || prev.description,
      }));
    }
  }, [isOpen, prefillData]);

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setStep('format');
      setAdData({
        headline: '',
        description: '',
        callToAction: 'REDEEM',
        discount: '',
        validUntil: '',
        mediaUrl: '',
        terms: '',
      });
      setUploadedMedia(null);
      setMediaFile(null);
      setPublishing(false);
    }
  }, [isOpen]);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      setUploadedMedia(URL.createObjectURL(file));
    }
  };

  const handlePublish = async () => {
    if (!adData.headline || !adData.description) {
      toast.error("Please fill in a headline and description");
      return;
    }

    setPublishing(true);
    try {
      // Attempt media upload if a file was selected
      let mediaUrl: string | null = null;
      if (mediaFile && venueId) {
        const ext = mediaFile.name.split('.').pop() || 'jpg';
        const path = `${venueId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('deal-media')
          .upload(path, mediaFile);
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('deal-media')
            .getPublicUrl(path);
          mediaUrl = publicUrl;
        }
        // If bucket doesn't exist or upload fails, proceed without media
        // DealCard falls back to venue image — deal still fully works
      }

      // Create deal row (starts as 'draft')
      const deal = await createDeal({
        headline: adData.headline,
        description: adData.description,
        discount_text: adData.discount || null,
        media_url: mediaUrl,
        media_type: mediaFile ? 'image' : null,
        placement_types: ['feed', 'city', 'for_you', 'following', 'venue_profile'],
        reach_tier: 'local',
        expires_at: adData.validUntil || null,
        linked_vibe_id: linkedVibeId || null,
      });

      if (!deal) throw new Error('Deal creation returned null');

      // Publish: deducts 1 credit from venue_push_credits and sets status='published'
      await publishDeal(deal.id, 'local');

      // If this deal came from a vibe conversion, record the link on the vibe
      if (linkedVibeId) {
        await supabase
          .from('venue_vibes')
          .update({ converted_to_deal_id: deal.id })
          .eq('id', linkedVibeId);
      }

      // Clear saved draft on successful publish
      try { sessionStorage.removeItem(DEAL_DRAFT_STORAGE_KEY); } catch {}

      toast.success("Deal is live! Customers can see it in their feeds.");
      if (venueId) updateVenueScoreCounter(venueId, "deal_created");
      onClose();
    } catch (err: any) {
      console.error('[DealCreatorModal] publish error:', err);
      if (err.message?.includes('No credits')) {
        toast.error("No push credits available. Buy credits to launch your deal.");
      } else {
        toast.error(err.message || "Failed to publish deal. Please try again.");
      }
    } finally {
      setPublishing(false);
    }
  };

  // Reusable insufficient-credits inline gate
  const InsufficientCreditsGate = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="venue-deal-modal__credit-gate"
    >
      <span className="venue-deal-modal__credit-gate-icon"><Zap aria-hidden="true" /></span>
      <div>
        <p className="text-base font-bold text-white">You need push credits to launch this deal</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
          Push credits blast your deal to customers' live feeds nearby. One credit = one deal push.
        </p>
      </div>
      {onBuyCredits ? (
        <Button
          className="venue-deal-modal__primary-action venue-deal-modal__wide-action"
          onClick={handleBuyCredits}
        >
          <ShoppingCart className="w-5 h-5 mr-2" />
          Buy Push Credits — from $17
        </Button>
      ) : (
        <p className="text-sm text-amber-400 font-medium">
          Go to Wallet → Push Deals → Buy to add credits first.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Secure checkout via Stripe. Credits appear instantly after payment.</p>
    </motion.div>
  );

  const renderFormatStep = () => (
    <div className="venue-deal-modal__format">
      <div>
        <h3 className="venue-deal-modal__section-title">Choose a deal format</h3>
        <p className="venue-deal-modal__section-copy">
          Select how you'd like to structure your deal post
        </p>
      </div>

      <div className="venue-deal-modal__format-list">
        {[
          { type: 'image' as AdFormat, icon: ImageIcon, label: 'Single Image or Video', desc: 'One image or video, or a slideshow with multiple images' },
          { type: 'carousel' as AdFormat, icon: Video, label: 'Multiple Photos', desc: '2 or more scrollable images or videos' },
          { type: 'video' as AdFormat, icon: Sparkles, label: 'Product Grid', desc: 'Group of items that opens into a fullscreen mobile experience' },
        ].map((format) => (
          <Card
            key={format.type}
            className={`venue-deal-modal__format-card${adFormat === format.type ? ' is-selected' : ''}`}
            onClick={() => setAdFormat(format.type)}
          >
            <CardContent className="venue-deal-modal__format-card-content">
              <div>
                <format.icon aria-hidden="true" />
              </div>
              <h4>{format.label}</h4>
              <p>{format.desc}</p>
              {adFormat === format.type && (
                <Badge className="venue-deal-modal__selected-badge">Selected</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="venue-deal-modal__info-note">
        <div>
          <Sparkles aria-hidden="true" />
          <span>Reach more customers</span>
        </div>
        <p>
          Your deal is shown to customers nearby whose interests match your venue's vibe.
        </p>
      </div>
    </div>
  );

  const renderCreativeStep = () => (
    <div className="venue-deal-modal__creative">
      <div className="venue-deal-modal__creative-form">
        <div>
          <h3 className="venue-deal-modal__section-title">Deal creative</h3>
          <p className="venue-deal-modal__section-copy">
            {prefillData ? "Your vibe draft has been loaded — edit and add a photo to finalise." : "Add a photo and write your deal text."}
          </p>
        </div>

        <div className="venue-deal-modal__media-field">
          <Label>
            <ImageIcon aria-hidden="true" /> Photo (optional)
          </Label>
          <div
            className="venue-deal-modal__media-upload"
            onClick={() => document.getElementById('media-upload')?.click()}
          >
            {uploadedMedia ? (
              <div className="relative">
                <img src={uploadedMedia} alt="Preview" className="venue-deal-modal__media-preview" />
                <Button
                  variant="outline"
                  size="sm"
                  className="venue-deal-modal__secondary-action"
                  onClick={(e) => { e.stopPropagation(); setUploadedMedia(null); setMediaFile(null); }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <>
                <Upload aria-hidden="true" />
                <p>Click to upload a photo</p>
                <small>PNG, JPG, GIF, or MP4</small>
              </>
            )}
          </div>
          <input
            id="media-upload"
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleMediaUpload}
          />
          {menuItemImageUrl && !uploadedMedia && (
            <Button
              variant="outline"
              size="sm"
              className="venue-deal-modal__secondary-action venue-deal-modal__wide-action"
              onClick={() => setUploadedMedia(menuItemImageUrl)}
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              Use menu item photo
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Headline *</Label>
            <Input
              placeholder="e.g., 50% OFF All Drinks Tonight!"
              value={adData.headline}
              onChange={(e) => setAdData({ ...adData, headline: e.target.value })}
              maxLength={40}
            />
            <p className="text-xs text-muted-foreground text-right">{adData.headline.length}/40</p>
          </div>

          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              placeholder="Describe your deal..."
              value={adData.description}
              onChange={(e) => setAdData({ ...adData, description: e.target.value })}
              maxLength={125}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">{adData.description.length}/125</p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Percent className="w-4 h-4" /> Discount (e.g. 50% OFF)
            </Label>
            <Input
              placeholder="e.g., 50% OFF"
              value={adData.discount}
              onChange={(e) => setAdData({ ...adData, discount: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Button text</Label>
            <Input
              placeholder="e.g., REDEEM, GET DEAL, CLAIM NOW"
              value={adData.callToAction}
              onChange={(e) => setAdData({ ...adData, callToAction: e.target.value.toUpperCase().slice(0, 15) })}
              maxLength={15}
            />
            <p className="text-xs text-muted-foreground text-right">{adData.callToAction.length}/15</p>
          </div>

          <div className="space-y-2">
            <Label>Terms & Conditions</Label>
            <Textarea
              placeholder="Optional: Add redemption terms..."
              value={adData.terms}
              onChange={(e) => setAdData({ ...adData, terms: e.target.value })}
              rows={2}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mt-2 pt-2">
          <h3 className="text-lg font-semibold">Preview</h3>
          <div className="flex gap-2">
            {(['feed', 'stories', 'search'] as PreviewPlatform[]).map((platform) => (
              <Button
                key={platform}
                variant={previewPlatform === platform ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewPlatform(platform)}
              >
                {platform === 'feed' && 'Profile feed'}
                {platform === 'stories' && 'Stories'}
                {platform === 'search' && 'Search'}
              </Button>
            ))}
          </div>
        </div>

        <div className="venue-deal-modal__device">
          <div className="venue-deal-modal__device-screen">
            <div className="venue-deal-modal__device-status">
              <span>9:41</span>
              <div className="venue-deal-modal__device-battery">
                <div>
                  <div />
                </div>
              </div>
            </div>

            <div className="venue-deal-modal__device-post">
              <div className="venue-deal-modal__device-author">
                <div className="venue-deal-modal__device-avatar">
                  VN
                </div>
                <div className="venue-deal-modal__device-author-copy">
                  <p>Your Venue</p>
                  <p className="text-xs text-gray-400">Sponsored • <MapPin className="w-3 h-3 inline" /> Nearby</p>
                </div>
              </div>

              <div className="venue-deal-modal__device-media">
                {uploadedMedia ? (
                  <img src={uploadedMedia} alt="Preview" />
                ) : (
                  <div className="venue-deal-modal__device-placeholder">
                    <ImageIcon aria-hidden="true" />
                    <p>Your photo here</p>
                  </div>
                )}
                {adData.discount && (
                  <div className="venue-deal-modal__device-discount">
                    {adData.discount}
                  </div>
                )}
              </div>

              <div className="venue-deal-modal__device-copy">
                <p>
                  {adData.headline || 'Your headline here'}
                </p>
                <p>
                  {adData.description || 'Your description will appear here...'}
                </p>
                <Button className="venue-deal-modal__device-cta">
                  {adData.callToAction}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Preview is approximate. Actual appearance may vary by device.
        </p>
      </div>
    </div>
  );

  const renderDetailsStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Deal Details</h3>
        <p className="text-sm text-muted-foreground">
          Set reach and expiry for your deal
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardContent className="p-6">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              How far to send?
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              Your deal reaches nearby customers who match your venue's vibe.
            </p>
            <div className="p-4 bg-secondary/30 rounded-lg">
              <p className="font-medium">Push credits: <span className={hasNoCredits ? 'text-amber-400 font-bold' : 'text-primary'}>{realCredits}</span></p>
              <p className="text-xs text-muted-foreground mt-1">Each deal push costs 1 credit</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Valid until (optional)
            </h4>
            <div className="space-y-4">
              <Input
                type="date"
                value={adData.validUntil}
                onChange={(e) => setAdData({ ...adData, validUntil: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for no expiry.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {hasNoCredits && <InsufficientCreditsGate />}
    </div>
  );

  const renderQuickLaunchStep = () => (
    <div className="venue-deal-modal__quick">
      {/* Goal templates */}
      <div>
        <h3 className="venue-deal-modal__section-title">Choose a promotion goal</h3>
        <div className="venue-deal-modal__goal-list">
          {QUICK_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => setAdData(prev => ({ ...prev, headline: t.headline, discount: t.discount, callToAction: t.cta }))}
              className={`venue-deal-modal__goal${adData.headline === t.headline ? ' is-selected' : ''}`}
            >
              <span className="text-2xl">{t.emoji}</span>
              <p className="text-sm font-medium mt-1">{t.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Core fields */}
      <div className="venue-deal-modal__fields">
        <div className="venue-deal-modal__field">
          <Label htmlFor="ql-headline">What's the deal?</Label>
          <Input
            id="ql-headline"
            placeholder="e.g. Happy Hour is ON!"
            value={adData.headline}
            onChange={(e) => setAdData({ ...adData, headline: e.target.value })}
            className="venue-deal-modal__input"
          />
        </div>
        <div className="venue-deal-modal__field">
          <Label htmlFor="ql-discount">Offer details</Label>
          <Input
            id="ql-discount"
            placeholder="e.g. 50% off drinks"
            value={adData.discount}
            onChange={(e) => setAdData({ ...adData, discount: e.target.value })}
            className="venue-deal-modal__input"
          />
        </div>
        <div className="venue-deal-modal__field">
          <Label htmlFor="ql-desc">Short description</Label>
          <Textarea
            id="ql-desc"
            placeholder="Add a sentence to help customers understand the offer…"
            value={adData.description}
            onChange={(e) => setAdData({ ...adData, description: e.target.value })}
            className="venue-deal-modal__textarea"
            rows={2}
          />
        </div>
        <div className="venue-deal-modal__field">
          <Label htmlFor="ql-expires">Valid until (optional)</Label>
          <Input
            id="ql-expires"
            type="date"
            value={adData.validUntil}
            onChange={(e) => setAdData({ ...adData, validUntil: e.target.value })}
            min={new Date().toISOString().split('T')[0]}
            className="venue-deal-modal__input"
          />
        </div>
        <div className="venue-deal-modal__field">
          <Label>Photo (optional)</Label>
          <div className="venue-deal-modal__upload-inline">
            <label htmlFor="ql-media" className="venue-deal-modal__upload-trigger">
              <Upload className="w-4 h-4" />
              {uploadedMedia ? 'Change photo' : 'Upload photo'}
            </label>
            <input id="ql-media" type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaUpload} />
            {uploadedMedia && (
              <img src={uploadedMedia} alt="preview" className="venue-deal-modal__upload-preview" />
            )}
          </div>
        </div>
      </div>

      {/* Credits status / insufficient gate */}
      {hasNoCredits ? (
        <InsufficientCreditsGate />
      ) : (
        <div className="venue-deal-modal__credit-status">
          <span>{realCredits} credit{realCredits !== 1 ? 's' : ''} available</span>
          <span>1 credit will be used to launch this deal</span>
        </div>
      )}
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-6 text-center">
      <div className="w-20 h-20 rounded-full bg-green-500/20 mx-auto flex items-center justify-center">
        <Eye className="w-10 h-10 text-green-500" />
      </div>
      <h3 className="text-2xl font-bold">Ready to Publish!</h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        Your deal will appear in customer feeds nearby. Customers redeem it by showing the code to your staff.
      </p>

      <Card className="max-w-md mx-auto border-primary/50">
        <CardContent className="p-6 text-left space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Headline</span>
            <span className="font-medium">{adData.headline || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-medium">{adData.discount || 'None'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Button</span>
            <span className="font-medium">{adData.callToAction || 'REDEEM'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Valid until</span>
            <span className="font-medium">{adData.validUntil || 'No expiry'}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 mt-2">
            <span className="text-muted-foreground">Credits used</span>
            <span className="font-medium text-primary">1</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Credits remaining after</span>
            <span className={`font-medium ${hasNoCredits ? 'text-amber-400' : ''}`}>{Math.max(0, realCredits - 1)}</span>
          </div>
        </CardContent>
      </Card>

      {hasNoCredits && <InsufficientCreditsGate />}
    </div>
  );

  const steps = ['format', 'creative', 'details', 'preview'] as const;
  const currentStepIndex = steps.indexOf(step);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="venue-deal-modal__backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !publishing) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="venue-deal-modal__frame"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className={`venue-deal-modal${quickLaunch && !prefillData ? ' venue-deal-modal--compact' : ''}`}>
              <CardHeader className="venue-deal-modal__header">
                <div className="venue-deal-modal__header-copy">
                  <div className="venue-deal-modal__title-row">
                    <CardTitle className="venue-deal-modal__title">
                      {prefillData ? 'Finalise Your Deal' : 'Create Deal'}
                    </CardTitle>
                    {!prefillData && (
                      <div className="venue-deal-modal__launch-toggle">
                        <Zap aria-hidden="true" />
                        <span>Quick launch</span>
                        <Switch
                          checked={quickLaunch}
                          onCheckedChange={setQuickLaunch}
                          disabled={publishing}
                        />
                      </div>
                    )}
                  </div>
                  {!quickLaunch && (
                    <div className="venue-deal-modal__progress">
                      {steps.map((s, i) => (
                          <div key={s} className="venue-deal-modal__progress-step">
                          <div className={i <= currentStepIndex ? 'is-active' : undefined}>
                            {i + 1}
                          </div>
                          {i < steps.length - 1 && (
                            <span className={i < currentStepIndex ? 'is-active' : undefined} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="venue-deal-modal__close" onClick={onClose} disabled={publishing} aria-label="Close create deal dialog">
                  <X aria-hidden="true" />
                </Button>
              </CardHeader>

              <CardContent className="venue-deal-modal__content">
                {quickLaunch && !prefillData ? (
                  renderQuickLaunchStep()
                ) : (
                  <>
                    {step === 'format' && renderFormatStep()}
                    {step === 'creative' && renderCreativeStep()}
                    {step === 'details' && renderDetailsStep()}
                    {step === 'preview' && renderPreviewStep()}
                  </>
                )}
              </CardContent>

              <div className="venue-deal-modal__footer">
                {quickLaunch && !prefillData ? (
                  <>
                    <Button variant="outline" onClick={onClose} disabled={publishing}>
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    {hasNoCredits && onBuyCredits ? (
                      <Button
                        className="bg-amber-500 hover:bg-amber-400 text-black font-bold"
                        onClick={handleBuyCredits}
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Buy Push Credits
                      </Button>
                    ) : (
                      <Button
                        className="bg-cyan-500 hover:bg-cyan-600 text-black"
                        onClick={handlePublish}
                        disabled={publishing || hasNoCredits}
                      >
                        {publishing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Publishing...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Publish Deal
                          </>
                        )}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={publishing}
                      onClick={() => {
                        if (currentStepIndex > 0) {
                          setStep(steps[currentStepIndex - 1]);
                        } else {
                          onClose();
                        }
                      }}
                    >
                      <ChevronLeft className="w-4 h-4 mr-2" />
                      {currentStepIndex === 0 ? 'Cancel' : 'Back'}
                    </Button>

                    {step === 'preview' ? (
                      hasNoCredits && onBuyCredits ? (
                        <Button
                          className="bg-amber-500 hover:bg-amber-400 text-black font-bold"
                          onClick={handleBuyCredits}
                        >
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Buy Push Credits
                        </Button>
                      ) : (
                        <Button
                          className="bg-cyan-500 hover:bg-cyan-600 text-black"
                          onClick={handlePublish}
                          disabled={publishing || hasNoCredits}
                        >
                          {publishing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Publishing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Publish Deal
                            </>
                          )}
                        </Button>
                      )
                    ) : (
                      <Button onClick={() => setStep(steps[currentStepIndex + 1])}>
                        Next
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

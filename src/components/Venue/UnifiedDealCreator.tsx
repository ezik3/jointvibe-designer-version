import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Flame, UtensilsCrossed, TrendingDown, Zap, Radar, Target, Sparkles,
  Loader2, Pencil, Megaphone, Clock, Upload, Image as ImageIcon, RotateCcw,
  ChevronDown, ChevronUp
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import CreditTierDisplay from "@/components/Venue/CreditTierDisplay";
import PlacementSelector from "@/components/Venue/PlacementSelector";
import { useVenueDealsLibrary } from "@/hooks/useVenueDealsLibrary";
import { useVenueVibeCredits } from "@/hooks/useVenueVibeCredits";
import { updateVenueScoreCounter } from "@/hooks/useVenueTier";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLocationActivityScore } from "@/hooks/useLocationActivityScore";
import { useTranslation } from 'react-i18next';

// ─── Types ────────────────────────────────────────────────────────────────────

type CreatorStep = "intent" | "generating" | "preview" | "vibe_inline";

interface DealContent {
  headline: string;
  offerType: string;
  discountText: string;
  description: string;
  cta: string;
  suggestedExpiry: string;
  suggestedReachTier: string;
  suggestedPlacements: string[];
  confidenceScore: number;
  reasoning: string;
}

interface UnifiedDealCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  venueId?: string;
  defaultIntent?: string;
  /** Called when user needs to buy credits */
  onBuyCredits?: () => void;
  /** If coming from vibe conversion */
  linkedVibeId?: string;
}

const INTENTS = [
  { key: "bring_people_in", label: "Bring people in right now", icon: Flame, color: "venue-dialog-icon--orange" },
  { key: "promote_item", label: "Promote a specific item", icon: UtensilsCrossed, color: "venue-dialog-icon--green" },
  { key: "boost_slow_period", label: "Boost a slow period", icon: TrendingDown, color: "venue-dialog-icon--blue" },
  { key: "flash_offer", label: "Run a flash offer", icon: Zap, color: "venue-dialog-icon--gold" },
  { key: "test_demand", label: "Test demand first", icon: Radar, color: "venue-dialog-icon--cyan" },
  { key: "target_regulars", label: "Target my regulars", icon: Target, color: "venue-dialog-icon--cyan" },
  { key: "ai_decide", label: "Let AI decide for me", icon: Sparkles, color: "venue-dialog-icon--blue" },
];

const OFFER_TYPES = [
  { key: "percent_off", label: "% Off" },
  { key: "two_for_one", label: "2-for-1" },
  { key: "buy_x_get_y", label: "Buy X Get Y" },
  { key: "bundle", label: "Bundle" },
  { key: "fixed_price", label: "Fixed Price" },
  { key: "free_add_on", label: "Free Add-on" },
];
/** Small informational component showing estimated deal reach time */
function EstimatedReachTime() {
  const { maxDelayForLowestTier, loading } = useLocationActivityScore();
  if (loading) return null;
  const mins = Math.ceil(maxDelayForLowestTier / 60);
  if (mins <= 1) return (
    <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
      <Clock className="w-3 h-3" /> Estimated reach: near-instant for all users
    </p>
  );
  return (
    <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
      <Clock className="w-3 h-3" /> Estimated time to reach all users: ~{mins} min
    </p>
  );
}

export default function UnifiedDealCreator({
  isOpen,
  onClose,
  venueId,
  defaultIntent,
  onBuyCredits,
  linkedVibeId,
}: UnifiedDealCreatorProps) {
  const { t } = useTranslation('venue');
  const [step, setStep] = useState<CreatorStep>("intent");
  const [selectedIntent, setSelectedIntent] = useState<string>("");
  const [dealContent, setDealContent] = useState<DealContent | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [editExpanded, setEditExpanded] = useState(false);
  const [aiUsageThisMonth, setAiUsageThisMonth] = useState(0);

  // Deal fields (editable overrides)
  const [headline, setHeadline] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [description, setDescription] = useState("");
  const [cta, setCta] = useState("REDEEM");
  const [expiryDate, setExpiryDate] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<string | null>(null);

  // Reach & placement
  const [selectedTier, setSelectedTier] = useState("local");
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>(["feed", "city_view", "explore"]);

  // Vibe inline state
  const [vibeMessage, setVibeMessage] = useState("");
  const [vibeReach, setVibeReach] = useState<string>("local");
  const [vibeDuration, setVibeDuration] = useState(60);
  const [vibeSending, setVibeSending] = useState(false);

  // Venue context
  const [venueType, setVenueType] = useState("restaurant");
  const [venueName, setVenueName] = useState("");
  const [menuItems, setMenuItems] = useState<any[]>([]);

  // Hooks
  const { createDeal, publishDeal, credits, fetchCredits } = useVenueDealsLibrary(venueId || null);
  const vibeCreditsHook = useVenueVibeCredits(venueId || null);

  const totalDealCredits = Object.values(credits).reduce((s, v) => s + v, 0);
  const AI_MONTHLY_LIMIT = 20;

  // Fetch venue context on open
  useEffect(() => {
    if (!isOpen || !venueId) return;
    fetchCredits();

    const fetchContext = async () => {
      const [venueRes, menuRes, usageRes] = await Promise.all([
        supabase.from("venues").select("venue_type, name").eq("id", venueId).maybeSingle(),
        supabase.from("venue_menu_items").select("name, base_price, description, image_url").eq("venue_id", venueId).eq("available", true).limit(10),
        (supabase as any).from("venue_ai_usage").select("id").eq("venue_id", venueId).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);
      if (venueRes.data) {
        setVenueType(venueRes.data.venue_type || "restaurant");
        setVenueName(venueRes.data.name || "");
      }
      if (menuRes.data) setMenuItems(menuRes.data);
      if (usageRes.data) setAiUsageThisMonth(usageRes.data.length);
    };
    fetchContext();
  }, [isOpen, venueId]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep("intent");
      setSelectedIntent("");
      setDealContent(null);
      setEditExpanded(false);
      setHeadline("");
      setDiscountText("");
      setDescription("");
      setCta("REDEEM");
      setExpiryDate("");
      setMediaFile(null);
      setUploadedMedia(null);
      setSelectedTier("local");
      setSelectedPlacements(["feed", "city_view", "explore"]);
      setVibeMessage("");
      setPublishing(false);
    }
  }, [isOpen]);

  // Auto-trigger if defaultIntent is set
  useEffect(() => {
    if (isOpen && defaultIntent) {
      if (defaultIntent === "test_demand") {
        setStep("vibe_inline");
      } else {
        handleIntentSelect(defaultIntent);
      }
    }
  }, [isOpen, defaultIntent]);

  // ─── AI Generation ─────────────────────────────────────────────────────────

  const generateDeal = useCallback(async (intent: string, offerCategory?: string) => {
    if (!venueId) return;
    setStep("generating");

    try {
      // Track AI usage
      await (supabase as any).from("venue_ai_usage").insert({
        venue_id: venueId,
        usage_type: offerCategory ? "offer_rewrite" : "deal_generation",
      });
      setAiUsageThisMonth((p) => p + 1);

      const { data, error } = await supabase.functions.invoke("generate-deal-content", {
        body: {
          intent,
          venueType,
          venueName,
          menuItems: menuItems.slice(0, 5),
          timeOfDay: new Date().getHours(),
          reachTier: selectedTier,
          offerCategory,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const content = data as DealContent;
      setDealContent(content);
      setHeadline(content.headline);
      setDiscountText(content.discountText);
      setDescription(content.description);
      setCta(content.cta);
      setSelectedTier(content.suggestedReachTier || "local");
      setSelectedPlacements(content.suggestedPlacements?.length ? content.suggestedPlacements : ["feed", "city_view", "explore"]);
      setVibeMessage(content.headline + " — " + content.discountText + ". Interested?");
      setStep("preview");
    } catch (err: any) {
      console.error("AI generation error:", err);
      toast.error(err.message || "Failed to generate deal. Try again.");
      setStep("intent");
    }
  }, [venueId, venueType, venueName, menuItems, selectedTier]);

  const handleIntentSelect = (intent: string) => {
    setSelectedIntent(intent);
    if (intent === "test_demand") {
      setStep("vibe_inline");
      return;
    }
    generateDeal(intent);
  };

  const handleOfferTypeSwitch = (offerKey: string) => {
    generateDeal(selectedIntent || "bring_people_in", offerKey);
  };

  // ─── Publish ───────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!venueId || !headline) {
      toast.error("Headline is required");
      return;
    }
    if ((credits[selectedTier] || 0) <= 0 && totalDealCredits <= 0) {
      toast.error("No credits available for this tier");
      onBuyCredits?.();
      return;
    }

    setPublishing(true);
    try {
      let mediaUrl: string | null = null;
      if (mediaFile) {
        const ext = mediaFile.name.split(".").pop() || "jpg";
        const path = `${venueId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("deal-media").upload(path, mediaFile);
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from("deal-media").getPublicUrl(path);
          mediaUrl = publicUrl;
        }
      }

      const deal = await createDeal({
        headline,
        description,
        discount_text: discountText || null,
        media_url: mediaUrl,
        media_type: mediaFile ? "image" : null,
        placement_types: selectedPlacements,
        reach_tier: selectedTier,
        expires_at: expiryDate || null,
        linked_vibe_id: linkedVibeId || null,
      });

      if (!deal) throw new Error("Deal creation failed");
      await publishDeal(deal.id, selectedTier);

      if (linkedVibeId) {
        await supabase.from("venue_vibes").update({ converted_to_deal_id: deal.id }).eq("id", linkedVibeId);
      }

      updateVenueScoreCounter(venueId, "deal_created");
      toast.success("Deal is live! Customers can see it in their feeds.");
      onClose();
    } catch (err: any) {
      console.error("Publish error:", err);
      if (err.message?.includes("No credits")) {
        toast.error("No push credits available.");
        onBuyCredits?.();
      } else {
        toast.error(err.message || "Failed to publish");
      }
    } finally {
      setPublishing(false);
    }
  };

  // ─── Vibe Send ─────────────────────────────────────────────────────────────

  const handleSendVibe = async () => {
    if (!venueId || !vibeMessage.trim()) return;
    setVibeSending(true);
    try {
      const spent = await vibeCreditsHook.spendVibeCredit(vibeReach);
      if (!spent) throw new Error("No vibe credits available");

      const expiresAt = new Date(Date.now() + vibeDuration * 60 * 1000).toISOString();
      await supabase.from("venue_vibes").insert({
        venue_id: venueId,
        message: vibeMessage,
        reach_type: vibeReach,
        status: "collecting",
        expires_at: expiresAt,
      });

      toast.success("Vibe sent! Collecting responses...");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to send vibe");
    } finally {
      setVibeSending(false);
    }
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      setUploadedMedia(URL.createObjectURL(file));
    }
  };

  const confidenceLabel = (score: number) => {
    if (score >= 80) return { text: "🔥 High demand expected", color: "text-green-400" };
    if (score >= 60) return { text: "⚡ Good performance expected", color: "text-cyan-400" };
    if (score >= 40) return { text: "📈 Moderate reach expected", color: "text-yellow-400" };
    return { text: "💡 Try it out", color: "text-muted-foreground" };
  };

  const aiRemaining = Math.max(0, AI_MONTHLY_LIMIT - aiUsageThisMonth);

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="venue-dialog-surface max-w-2xl p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="venue-dialog-icon--cyan w-8 h-8 rounded-full flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {step === "intent" && "What do you want to do?"}
              {step === "generating" && "Generating your deal..."}
              {step === "preview" && "Your deal is ready"}
              {step === "vibe_inline" && "Test demand first"}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <ScrollArea className="flex-1 max-h-[calc(92vh-70px)]">
          <div className="p-5">
            <AnimatePresence mode="wait">
              {/* ─── STEP: Intent ──────────────────────────────────────────── */}
              {step === "intent" && (
                <motion.div
                  key="intent"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="space-y-3"
                >
                  <p className="text-xs text-center text-muted-foreground pb-1">
                    {aiRemaining} AI generations remaining this month
                  </p>
                  {INTENTS.map((intent) => (
                    <button
                      key={intent.key}
                      onClick={() => handleIntentSelect(intent.key)}
                      className="w-full flex items-center gap-4 p-4 rounded-lg border border-[#2a323a] hover:border-[#717c86] bg-[#171d23] hover:bg-[#202830] transition-all group"
                    >
                      <div className={`w-12 h-12 rounded-lg ${intent.color} flex items-center justify-center flex-shrink-0`}>
                        <intent.icon className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-base font-medium text-white group-hover:text-cyan-300 transition-colors text-left">
                        {intent.label}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}

              {/* ─── STEP: Generating ─────────────────────────────────────── */}
              {step === "generating" && (
                <motion.div
                  key="generating"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center justify-center py-16 space-y-6"
                >
                  <motion.div
                    className="venue-dialog-icon--cyan w-20 h-20 rounded-lg flex items-center justify-center"
                    animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="w-10 h-10 text-white" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-white">Generating your deal...</p>
                    <p className="text-sm text-muted-foreground mt-1">AI is crafting the perfect offer for your venue</p>
                  </div>
                  <div className="w-48 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </motion.div>
              )}

              {/* ─── STEP: Preview ────────────────────────────────────────── */}
              {step === "preview" && dealContent && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="space-y-5"
                >
                  {/* AI Confidence Signal */}
                  {dealContent.confidenceScore > 0 && (
                    <div className={`text-sm font-medium ${confidenceLabel(dealContent.confidenceScore).color}`}>
                      {confidenceLabel(dealContent.confidenceScore).text}
                    </div>
                  )}

                  {/* Live Preview Card */}
                  <Card className="bg-[#171d23] border-[#2a323a] overflow-hidden">
                    <div className="bg-[#12363b] p-1">
                      <p className="text-[10px] text-center text-cyan-400 font-medium">LIVE PREVIEW</p>
                    </div>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="venue-dialog-icon--cyan w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {venueName?.charAt(0) || "V"}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm">{venueName || "Your Venue"}</p>
                          <p className="text-xs text-slate-400">Sponsored · Nearby</p>
                        </div>
                      </div>
                      {uploadedMedia && (
                        <img src={uploadedMedia} alt="Deal" className="w-full rounded-lg max-h-40 object-cover" />
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-white">{headline}</h3>
                        {discountText && (
                          <Badge className="mt-1 bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                            {discountText}
                          </Badge>
                        )}
                        <p className="text-sm text-slate-300 mt-2">{description}</p>
                      </div>
                      <Button size="sm" className="w-full bg-primary hover:bg-primary/90 font-bold">
                        {cta}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Offer Type Quick Switch */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Change offer style</p>
                    <div className="flex flex-wrap gap-1.5">
                      {OFFER_TYPES.map((o) => (
                        <button
                          key={o.key}
                          onClick={() => handleOfferTypeSwitch(o.key)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            dealContent.offerType === o.key
                              ? "bg-primary/20 border-primary/50 text-primary"
                              : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Switching uses 1 AI credit · {aiRemaining} remaining</p>
                  </div>

                  {/* 3 Primary Actions */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      onClick={handlePublish}
                      disabled={publishing || totalDealCredits === 0}
                      className="venue-dialog-primary-action col-span-1 h-12 font-bold text-sm"
                    >
                      {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4 mr-1" /> Launch</>}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setStep("vibe_inline")}
                      className="venue-dialog-secondary-action col-span-1 h-12 text-sm"
                    >
                      <Radar className="w-4 h-4 mr-1" /> Test First
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditExpanded(!editExpanded)}
                      className="venue-dialog-secondary-action col-span-1 h-12 text-sm"
                    >
                      <Pencil className="w-4 h-4 mr-1" /> Edit
                      {editExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                    </Button>
                  </div>

                  {/* Reach Tier Selector */}
                  <CreditTierDisplay
                    credits={credits}
                    selectedTier={selectedTier}
                    onSelectTier={setSelectedTier}
                    type="deal"
                  />

                  {/* Estimated reach time (informational) */}
                  <EstimatedReachTime />
                  <PlacementSelector
                    selected={selectedPlacements}
                    onChange={setSelectedPlacements}
                    suggestedPlacements={dealContent.suggestedPlacements}
                  />

                  {/* Expandable Edit Panel */}
                  <AnimatePresence>
                    {editExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        <div className="space-y-3 p-4 rounded-lg border border-[#2a323a] bg-[#171d23]">
                          <div className="space-y-1.5">
                            <Label className="text-slate-300 text-sm">Headline</Label>
                            <Input
                              value={headline}
                              onChange={(e) => setHeadline(e.target.value)}
                              maxLength={40}
                              className="bg-slate-800 border-slate-700 text-white"
                            />
                            <span className="text-[10px] text-muted-foreground">{headline.length}/40</span>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-slate-300 text-sm">Discount text</Label>
                            <Input
                              value={discountText}
                              onChange={(e) => setDiscountText(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-slate-300 text-sm">Description</Label>
                            <Textarea
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              maxLength={125}
                              rows={2}
                              className="bg-slate-800 border-slate-700 text-white resize-none"
                            />
                            <span className="text-[10px] text-muted-foreground">{description.length}/125</span>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-slate-300 text-sm">CTA Button Text</Label>
                            <Input
                              value={cta}
                              onChange={(e) => setCta(e.target.value.toUpperCase().slice(0, 15))}
                              maxLength={15}
                              className="bg-slate-800 border-slate-700 text-white"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-slate-300 text-sm">Valid Until (optional)</Label>
                            <Input
                              type="datetime-local"
                              value={expiryDate}
                              onChange={(e) => setExpiryDate(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-slate-300 text-sm flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5" /> Photo (optional)
                            </Label>
                            <div
                              className="border-2 border-dashed border-slate-700 rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
                              onClick={() => document.getElementById("unified-media-upload")?.click()}
                            >
                              {uploadedMedia ? (
                                <div>
                                  <img src={uploadedMedia} alt="Deal media" className="max-h-32 mx-auto rounded-lg" />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 text-slate-400"
                                    onClick={(e) => { e.stopPropagation(); setUploadedMedia(null); setMediaFile(null); }}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ) : (
                                <div className="text-slate-500">
                                  <Upload className="w-8 h-8 mx-auto mb-1" />
                                  <p className="text-xs">Click to upload</p>
                                </div>
                              )}
                            </div>
                            <input
                              id="unified-media-upload"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleMediaUpload}
                            />
                          </div>

                          {/* Regenerate */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateDeal(selectedIntent || "bring_people_in")}
                            className="w-full border-slate-600 text-slate-300"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                            Regenerate · uses 1 AI credit
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* No credits gate */}
                  {totalDealCredits === 0 && (
                    <Card className="border-amber-500/40 bg-amber-500/5">
                      <CardContent className="p-4 text-center space-y-3">
                        <p className="text-sm font-semibold text-amber-400">No push credits available</p>
                        <p className="text-xs text-muted-foreground">Buy credits to launch your deal</p>
                        {onBuyCredits && (
                          <Button onClick={onBuyCredits} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
                            Buy Push Credits
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              )}

              {/* ─── STEP: Vibe Inline ────────────────────────────────────── */}
              {step === "vibe_inline" && (
                <motion.div
                  key="vibe"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="space-y-5"
                >
                  {/* Context: show generated deal if available */}
                  {dealContent && (
                    <Card className="bg-cyan-500/5 border-cyan-500/20">
                      <CardContent className="p-3">
                        <p className="text-xs text-cyan-400 font-medium mb-1">Your deal is ready — test demand first</p>
                        <p className="text-sm text-white font-semibold">{headline}</p>
                        <p className="text-xs text-slate-400">{discountText}</p>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="bg-cyan-500/10 border-cyan-500/30">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Radar className="w-5 h-5 text-cyan-400" />
                        <span className="text-sm text-white font-medium">Vibe Credits</span>
                      </div>
                      <span className="text-2xl font-bold text-white">{vibeCreditsHook.totalVibeCredits}</span>
                    </CardContent>
                  </Card>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Vibe Message</Label>
                    <Textarea
                      value={vibeMessage}
                      onChange={(e) => setVibeMessage(e.target.value)}
                      placeholder="e.g., Thinking about 20% off pizza tonight. Interested?"
                      maxLength={150}
                      className="bg-slate-800/50 border-slate-700 text-white resize-none min-h-[80px]"
                    />
                    <p className="text-xs text-right text-muted-foreground">{vibeMessage.length}/150</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Who should see this?</Label>
                    <CreditTierDisplay
                      credits={Object.fromEntries(
                        ["suburb", "local", "regional", "city", "national", "international"].map((t) => [
                          t,
                          t === "local" ? vibeCreditsHook.freeLocalCredits + vibeCreditsHook.paidCreditsByTier("local") : vibeCreditsHook.paidCreditsByTier(t),
                        ])
                      )}
                      selectedTier={vibeReach}
                      onSelectTier={setVibeReach}
                      type="vibe"
                      compact
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Collection Window
                    </Label>
                    <Select value={vibeDuration.toString()} onValueChange={(v) => setVibeDuration(parseInt(v))}>
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                        <SelectItem value="240">4 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleSendVibe}
                      disabled={!vibeMessage.trim() || vibeCreditsHook.totalVibeCredits <= 0 || vibeSending}
                      className="venue-dialog-primary-action flex-1 h-12 font-bold"
                    >
                      {vibeSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Radar className="w-4 h-4 mr-2" /> Send Vibe</>}
                    </Button>
                    {dealContent && (
                      <Button
                        variant="outline"
                        onClick={() => setStep("preview")}
                        className="venue-dialog-secondary-action"
                      >
                        Back to Deal
                      </Button>
                    )}
                  </div>

                  {!dealContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep("intent")}
                      className="w-full text-slate-500"
                    >
                      ← Back to intent selection
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

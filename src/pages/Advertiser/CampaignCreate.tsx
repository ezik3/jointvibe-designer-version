import { useState, useRef } from "react";
import "./advertiser-popups.css";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { APP_CITIES } from "@/constants/cities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  ArrowRight, 
  Upload, 
  X, 
  Home, 
  Building, 
  Key,
  Check,
  Loader2,
  Image as ImageIcon,
  Globe
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PropertyAddressAutocomplete } from "@/components/Ads/PropertyAddressAutocomplete";
import CityCountryMapboxPicker from "@/components/Advertiser/CityCountryMapboxPicker";
import { useTranslation } from 'react-i18next';

type Step = "property" | "content" | "media" | "preview";

interface AutoDetails {
  year: string;
  make: string;
  model: string;
  km: string;
  transmission: "automatic" | "manual" | "";
  fuel: "petrol" | "diesel" | "hybrid" | "electric" | "";
  condition: "new" | "used" | "demo" | "";
  listing_type: "for_sale" | "for_lease" | "rent_to_own";
  price: string;
  price_weekly: string;
  driver_tags: string[];
}

interface CampaignData {
  // Real-estate
  property_address: string;
  country: string;
  city: string;
  property_type: "for_sale" | "for_lease" | "for_rent";
  property_price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  // Shared
  headline: string;
  description: string;
  cta_text: string;
  cta_url: string;
  // Auto
  auto: AutoDetails;
}

interface MediaFile {
  file: File;
  preview: string;
  isPrimary: boolean;
}

const STEPS: { id: Step; label: string; description: string }[] = [
  { id: "property", label: "Listing Details", description: "Basic listing information" },
  { id: "content", label: "Campaign Content", description: "Headlines and descriptions" },
  { id: "media", label: "Media Upload", description: "Upload images" },
  { id: "preview", label: "Review & Submit", description: "Preview and submit" },
];

const DRIVER_TAGS = [
  { id: "fuel_efficient", label: "Fuel efficient" },
  { id: "low_maintenance", label: "Low maintenance" },
  { id: "good_for_rideshare", label: "Good for rideshare" },
  { id: "electric", label: "Electric" },
];

export default function CampaignCreate() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { advertiser } = useOutletContext<{ advertiser: any }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAuto = advertiser?.advertiser_type === "auto";

  const [currentStep, setCurrentStep] = useState<Step>("property");
  const [loading, setLoading] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);

  const [formData, setFormData] = useState<CampaignData>({
    property_address: "",
    country: "",
    city: "",
    property_type: "for_sale",
    property_price: null,
    bedrooms: null,
    bathrooms: null,
    parking: null,
    headline: "",
    description: "",
    cta_text: isAuto ? "View Listing" : "View Property",
    cta_url: "",
    auto: {
      year: "", make: "", model: "", km: "", transmission: "",
      fuel: "", condition: "", listing_type: "for_sale",
      price: "", price_weekly: "", driver_tags: [],
    },
  });

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const updateFormData = (field: keyof CampaignData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newMediaFiles: MediaFile[] = files.map((file, index) => ({
      file,
      preview: URL.createObjectURL(file),
      isPrimary: mediaFiles.length === 0 && index === 0,
    }));
    setMediaFiles((prev) => [...prev, ...newMediaFiles]);
  };

  const removeMedia = (index: number) => {
    setMediaFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      // If we removed the primary, make the first one primary
      if (prev[index].isPrimary && updated.length > 0) {
        updated[0].isPrimary = true;
      }
      return updated;
    });
  };

  const setPrimaryMedia = (index: number) => {
    setMediaFiles((prev) =>
      prev.map((m, i) => ({ ...m, isPrimary: i === index }))
    );
  };

  const validateStep = (step: Step): boolean => {
    switch (step) {
      case "property":
        if (isAuto) {
          if (!formData.auto.make || !formData.auto.model || !formData.country || !formData.city) {
            toast.error("Please fill in make, model, country and city");
            return false;
          }
          const isSale = formData.auto.listing_type === "for_sale";
          if (isSale && !formData.auto.price) {
            toast.error("Please enter the sale price");
            return false;
          }
          if (!isSale && !formData.auto.price_weekly) {
            toast.error("Please enter the weekly price");
            return false;
          }
          return true;
        }
        if (!formData.property_address || !formData.country || !formData.city || !formData.property_type) {
          toast.error("Please fill in all required property details");
          return false;
        }
        return true;
      case "content":
        if (!formData.headline) {
          toast.error("Please enter a headline");
          return false;
        }
        return true;
      case "media":
        if (mediaFiles.length === 0) {
          toast.error(isAuto ? "Please upload at least one photo or video" : "Please upload at least one image");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const goToNextStep = () => {
    if (!validateStep(currentStep)) return;
    
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const goToPrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const uploadMedia = async (campaignId: string): Promise<void> => {
    for (let i = 0; i < mediaFiles.length; i++) {
      const media = mediaFiles[i];
      const fileExt = media.file.name.split(".").pop();
      const filePath = `${advertiser.id}/${campaignId}/${i}.${fileExt}`;
      const mediaType = media.file.type.startsWith("video/") ? "video" : "image";

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("ad-media")
        .upload(filePath, media.file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        // Never persist blob: URLs — they break on refresh / other browsers.
        throw new Error(
          `Failed to upload media: ${uploadError.message}. Please try again.`
        );
      } else {
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from("ad-media")
          .getPublicUrl(filePath);

        await supabase.from("ad_media").insert({
          campaign_id: campaignId,
          media_url: publicUrl,
          media_type: mediaType,
          is_primary: media.isPrimary,
          sort_order: i,
        });
      }
    }
  };

  const handleSubmit = async (asDraft: boolean = false) => {
    if (!asDraft && !validateStep("media")) return;
    
    setLoading(true);
    try {
      // Create campaign
      const autoDetailsPayload = isAuto ? {
        year: formData.auto.year || null,
        make: formData.auto.make,
        model: formData.auto.model,
        km: formData.auto.km ? Number(formData.auto.km) : null,
        transmission: formData.auto.transmission || null,
        fuel: formData.auto.fuel || null,
        condition: formData.auto.condition || null,
        listing_type: formData.auto.listing_type,
        price: formData.auto.price ? Number(formData.auto.price) : null,
        price_weekly: formData.auto.price_weekly ? Number(formData.auto.price_weekly) : null,
        driver_tags: formData.auto.driver_tags,
        country: formData.country || null,
      } : null;

      const { data: campaign, error: campaignError } = await supabase
        .from("ad_campaigns")
        .insert({
          advertiser_id: advertiser.id,
          campaign_type: isAuto ? "auto" : "real_estate",
          auto_details: autoDetailsPayload,
          property_address: isAuto ? null : formData.property_address,
          city: formData.city,
          property_type: isAuto ? null : formData.property_type,
          property_price: isAuto ? (autoDetailsPayload?.price ?? null) : formData.property_price,
          bedrooms: isAuto ? null : formData.bedrooms,
          bathrooms: isAuto ? null : formData.bathrooms,
          parking: isAuto ? null : formData.parking,
          headline: formData.headline,
          description: formData.description,
          cta_text: formData.cta_text || (isAuto ? "View Listing" : "View Property"),
          cta_url: formData.cta_url,
          status: asDraft ? "draft" : "pending",
        } as any)
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Upload media if not draft
      if (!asDraft && mediaFiles.length > 0) {
        await uploadMedia(campaign.id);
      }

      toast.success(asDraft ? "Campaign saved as draft" : "Campaign submitted for review");
      navigate("/advertiser/campaigns");
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      toast.error(error.message || "Failed to create campaign");
    } finally {
      setLoading(false);
    }
  };

  const getPropertyTypeLabel = (type: string) => {
    switch (type) {
      case "for_sale": return "For Sale";
      case "for_lease": return "For Lease";
      case "for_rent": return "For Rent";
      default: return type;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/advertiser/campaigns")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create Campaign</h1>
          <p className="text-muted-foreground">
            {isAuto
              ? "Set up your vehicle ad — shown on the maps page to people signing up to drive"
              : "Set up your property advertisement"}
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  index < currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : index === currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {index < currentStepIndex ? (
                  <Check className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              <span className="text-xs mt-1 text-muted-foreground hidden sm:block">
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-12 sm:w-24 h-1 mx-2",
                  index < currentStepIndex ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStepIndex].label}</CardTitle>
          <CardDescription>{STEPS[currentStepIndex].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Property / Vehicle Details Step */}
          {currentStep === "property" && !isAuto && (
            <>
              <div className="space-y-2">
                <Label htmlFor="address">Property Address *</Label>
                <PropertyAddressAutocomplete
                  value={formData.property_address}
                  onChange={(address) => updateFormData("property_address", address)}
                  onAddressParsed={(parts) => {
                    if (parts.country) updateFormData("country", parts.country);
                    if (parts.city) updateFormData("city", parts.city);
                  }}
                  placeholder="Start typing the property address..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Country *</Label>
                  <Input
                    placeholder="e.g. Australia"
                    value={formData.country}
                    onChange={(e) => updateFormData("country", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>City *</Label>
                  <Input
                    placeholder="e.g. Brisbane"
                    value={formData.city}
                    onChange={(e) => updateFormData("city", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Property Type *</Label>
                  <Select
                    value={formData.property_type}
                    onValueChange={(v) => updateFormData("property_type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="advertiser-select-popover">
                      <SelectItem value="for_sale">
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4" />
                          For Sale
                        </div>
                      </SelectItem>
                      <SelectItem value="for_lease">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4" />
                          For Lease
                        </div>
                      </SelectItem>
                      <SelectItem value="for_rent">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4" />
                          For Rent
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="500000"
                  value={formData.property_price || ""}
                  onChange={(e) => updateFormData("property_price", e.target.value ? Number(e.target.value) : null)}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bedrooms">Bedrooms</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    min="0"
                    placeholder="3"
                    value={formData.bedrooms || ""}
                    onChange={(e) => updateFormData("bedrooms", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bathrooms">Bathrooms</Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    min="0"
                    placeholder="2"
                    value={formData.bathrooms || ""}
                    onChange={(e) => updateFormData("bathrooms", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parking">Parking</Label>
                  <Input
                    id="parking"
                    type="number"
                    min="0"
                    placeholder="2"
                    value={formData.parking || ""}
                    onChange={(e) => updateFormData("parking", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Auto / Vehicle Details Step */}
          {currentStep === "property" && isAuto && (
            <>
              <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-3 text-xs text-muted-foreground">
                Vehicle ads appear on the maps page when people are signing up to become a JV driver. Upload a clear photo or a short looping video clip (recommended).
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input
                    placeholder="e.g. 2022"
                    value={formData.auto.year}
                    onChange={(e) => updateFormData("auto", { ...formData.auto, year: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Make *</Label>
                  <Input
                    placeholder="e.g. Toyota"
                    value={formData.auto.make}
                    onChange={(e) => updateFormData("auto", { ...formData.auto, make: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Model *</Label>
                  <Input
                    placeholder="e.g. Corolla"
                    value={formData.auto.model}
                    onChange={(e) => updateFormData("auto", { ...formData.auto, model: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Location *</Label>
                <CityCountryMapboxPicker
                  city={formData.city}
                  country={formData.country}
                  onChange={({ city, country }) => {
                    setFormData((prev) => ({ ...prev, city, country }));
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Listing Type</Label>
                  <Select
                    value={formData.auto.listing_type}
                    onValueChange={(v: any) => updateFormData("auto", {
                      ...formData.auto,
                      listing_type: v,
                      // Clear the irrelevant price so we never save stale data.
                      price: v === "for_sale" ? formData.auto.price : "",
                      price_weekly: v === "for_sale" ? "" : formData.auto.price_weekly,
                    })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="advertiser-select-popover">
                      <SelectItem value="for_sale">For Sale</SelectItem>
                      <SelectItem value="for_lease">For Lease</SelectItem>
                      <SelectItem value="rent_to_own">Rent to Own</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select
                    value={formData.auto.condition}
                    onValueChange={(v: any) => updateFormData("auto", { ...formData.auto, condition: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent className="advertiser-select-popover">
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="used">Used</SelectItem>
                      <SelectItem value="demo">Demo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Kilometres</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 45000"
                    value={formData.auto.km}
                    onChange={(e) => updateFormData("auto", { ...formData.auto, km: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Transmission</Label>
                  <Select
                    value={formData.auto.transmission}
                    onValueChange={(v: any) => updateFormData("auto", { ...formData.auto, transmission: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent className="advertiser-select-popover">
                      <SelectItem value="automatic">Automatic</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fuel</Label>
                  <Select
                    value={formData.auto.fuel}
                    onValueChange={(v: any) => updateFormData("auto", { ...formData.auto, fuel: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent className="advertiser-select-popover">
                      <SelectItem value="petrol">Petrol</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.auto.listing_type === "for_sale" ? (
                <div className="space-y-2">
                  <Label>Sale Price *</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 25000"
                    value={formData.auto.price}
                    onChange={(e) => updateFormData("auto", { ...formData.auto, price: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    The total price end-users will see on the ad.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Weekly Price *</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 220"
                    value={formData.auto.price_weekly}
                    onChange={(e) => updateFormData("auto", { ...formData.auto, price_weekly: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown as “${formData.auto.price_weekly || "220"}/wk” on the ad
                    {formData.auto.listing_type === "rent_to_own" ? " (rent-to-own)." : " (lease)."}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Driver Tags (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {DRIVER_TAGS.map((tag) => {
                    const active = formData.auto.driver_tags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          const next = active
                            ? formData.auto.driver_tags.filter((t) => t !== tag.id)
                            : [...formData.auto.driver_tags, tag.id];
                          updateFormData("auto", { ...formData.auto, driver_tags: next });
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs border transition",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Content Step */}
          {currentStep === "content" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="headline">Headline *</Label>
                <Input
                  id="headline"
                  placeholder={isAuto ? "Low-km, one-owner — drive away today" : "Stunning Waterfront Home with Ocean Views"}
                  value={formData.headline}
                  onChange={(e) => updateFormData("headline", e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.headline.length}/100 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder={isAuto ? "Describe the vehicle, features, finance options, and what makes it ideal for rideshare drivers..." : "Describe the property features, location benefits, and unique selling points..."}
                  value={formData.description}
                  onChange={(e) => updateFormData("description", e.target.value)}
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.description.length}/500 characters
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cta_text">Button Text</Label>
                  <Input
                    id="cta_text"
                    placeholder={isAuto ? "View Listing" : "View Property"}
                    value={formData.cta_text}
                    onChange={(e) => updateFormData("cta_text", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cta_url">Button Link (URL)</Label>
                  <Input
                    id="cta_url"
                    type="url"
                    placeholder="https://example.com/property"
                    value={formData.cta_url}
                    onChange={(e) => updateFormData("cta_url", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Media Step */}
          {currentStep === "media" && (
            <>
              <div
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-foreground font-medium">
                  {isAuto ? "Click to upload a photo or short video clip" : "Click to upload images"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isAuto
                    ? "PNG, JPG, or MP4/WebM up to 10MB. Short looping clips work best."
                    : "PNG, JPG up to 10MB each"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={isAuto ? "image/*,video/mp4,video/webm" : "image/*"}
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {mediaFiles.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {mediaFiles.map((media, index) => (
                    <div
                      key={index}
                      className={cn(
                        "relative aspect-video rounded-lg overflow-hidden border-2",
                        media.isPrimary ? "border-primary" : "border-transparent"
                      )}
                    >
                      {media.file.type.startsWith("video/") ? (
                        <video
                          src={media.preview}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          autoPlay
                          playsInline
                        />
                      ) : (
                        <img
                          src={media.preview}
                          alt={`Upload ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {!media.isPrimary && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPrimaryMedia(index)}
                          >
                            Set Primary
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() => removeMedia(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      {media.isPrimary && (
                        <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                          Primary
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Preview Step */}
          {currentStep === "preview" && (
            <div className="space-y-6">
              {/* Preview Image */}
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                {(() => {
                  const primary = mediaFiles.find((m) => m.isPrimary);
                  if (!primary) {
                    return (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-16 h-16 text-muted-foreground" />
                      </div>
                    );
                  }
                  return primary.file.type.startsWith("video/") ? (
                    <video src={primary.preview} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                  ) : (
                    <img src={primary.preview} alt="Preview" className="w-full h-full object-cover" />
                  );
                })()}

                {/* Ad Overlay Preview */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <div className="text-xs uppercase tracking-wider opacity-75 mb-2">
                    Sponsored • {isAuto
                      ? `${formData.auto.year ? formData.auto.year + " " : ""}${formData.auto.make} ${formData.auto.model}`.trim()
                      : getPropertyTypeLabel(formData.property_type)}
                  </div>
                  <h3 className="text-2xl font-bold mb-1">{formData.headline || "Your Headline"}</h3>
                  <p className="text-sm opacity-90 mb-2">
                    {isAuto
                      ? [formData.city, formData.country].filter(Boolean).join(", ")
                      : `${formData.property_address}, ${formData.city}`}
                  </p>
                  {isAuto
                    ? (formData.auto.listing_type === "for_sale"
                        ? formData.auto.price && (
                            <p className="text-xl font-bold mb-4">${Number(formData.auto.price).toLocaleString()}</p>
                          )
                        : formData.auto.price_weekly && (
                            <p className="text-xl font-bold mb-4">${Number(formData.auto.price_weekly).toLocaleString()}/wk</p>
                          ))
                    : formData.property_price && (
                        <p className="text-xl font-bold mb-4">${formData.property_price.toLocaleString()}</p>
                      )}
                  <Button size="sm" className="bg-white text-black hover:bg-white/90">
                    {formData.cta_text || (isAuto ? "View Listing" : "View Property")}
                  </Button>
                </div>
              </div>

              {/* Summary */}
              {!isAuto ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  {formData.bedrooms && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{formData.bedrooms}</p>
                      <p className="text-sm text-muted-foreground">Bedrooms</p>
                    </div>
                  )}
                  {formData.bathrooms && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{formData.bathrooms}</p>
                      <p className="text-sm text-muted-foreground">Bathrooms</p>
                    </div>
                  )}
                  {formData.parking && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{formData.parking}</p>
                      <p className="text-sm text-muted-foreground">Parking</p>
                    </div>
                  )}
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{mediaFiles.length}</p>
                    <p className="text-sm text-muted-foreground">Images</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  {formData.auto.km && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{Number(formData.auto.km).toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">Kilometres</p>
                    </div>
                  )}
                  {formData.auto.transmission && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-foreground capitalize">{formData.auto.transmission}</p>
                      <p className="text-sm text-muted-foreground">Transmission</p>
                    </div>
                  )}
                  {formData.auto.fuel && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-foreground capitalize">{formData.auto.fuel}</p>
                      <p className="text-sm text-muted-foreground">Fuel</p>
                    </div>
                  )}
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{mediaFiles.length}</p>
                    <p className="text-sm text-muted-foreground">Media</p>
                  </div>
                </div>
              )}

              {formData.description && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">{formData.description}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={goToPrevStep}
          disabled={currentStepIndex === 0}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>

        <div className="flex items-center gap-2">
          {currentStep === "preview" ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleSubmit(true)}
                disabled={loading}
              >
                Save as Draft
              </Button>
              <Button onClick={() => handleSubmit(false)} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit for Review"
                )}
              </Button>
            </>
          ) : (
            <Button onClick={goToNextStep}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coffee,
  Loader2,
  Lock,
  MapPin,
  Navigation,
  Settings2,
  Store,
  Truck,
  Zap,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import VenueOperatingHoursEditor from "@/components/Venue/VenueOperatingHoursEditor";
import {
  createDefaultVenueOperatingHours,
  normalizeVenueOperatingHours,
  type VenueOperatingHour,
} from "@/lib/venueOperatingHours";
import { venueTypes, staffSizeOptions } from "@/utils/countryToCurrency";
import { getCountryByCode, getCountryByName, isCountryEnabled } from "@/config/countries";
import { VenuePreset, venuePresets, suggestPreset } from "@/config/venueModules";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import "./venue-essentials.css";

type EntryControlPolicy = "open_entry" | "security_required" | "hybrid_entry";
type SecurityOperationMode = "always_active" | "scheduled" | "event_based";

function getDefaultMinimumEntryAge(countryCode: string, venueTypeId: string): number {
  const noRestrictionTypes = new Set(["restaurant", "cafe", "food_truck"]);
  if (noRestrictionTypes.has(venueTypeId)) return 0;
  if (countryCode === "US") return 21;
  if (countryCode) return 18;
  return 18;
}

const presetIcons = {
  quick_sell: Zap,
  counter_service: Coffee,
  full_suite: Building2,
};

const presetFeatures: Record<VenuePreset, string[]> = {
  quick_sell: ["Orders", "POS", "Wallet", "Push Deals"],
  counter_service: ["Kitchen", "Staff", "Quick Sell"],
  full_suite: ["Tables", "Reservations", "Deliveries", "All Features"],
};

export default function VenueEssentials() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReferencePresentation = searchParams.get("source") === "reference";
  const [loading, setLoading] = useState(false);

  const [venueType, setVenueType] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [staffSize, setStaffSize] = useState("");
  const [minimumEntryAge, setMinimumEntryAge] = useState<number>(18);
  const [hasManualAgePolicy, setHasManualAgePolicy] = useState(false);
  const [entryControlPolicy, setEntryControlPolicy] = useState<EntryControlPolicy>("open_entry");
  const [securityOperationMode, setSecurityOperationMode] = useState<SecurityOperationMode>("always_active");
  const [selectedPreset, setSelectedPreset] = useState<VenuePreset>("full_suite");

  const [locationDetected, setLocationDetected] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [detectedCountry, setDetectedCountry] = useState("");
  const [detectedCountryCode, setDetectedCountryCode] = useState("");
  const [detectedState, setDetectedState] = useState("");
  const [detectedCity, setDetectedCity] = useState("");
  const [detectedSuburb, setDetectedSuburb] = useState("");
  const [detectedLat, setDetectedLat] = useState<number | null>(null);
  const [detectedLng, setDetectedLng] = useState<number | null>(null);

  const [hasDelivery, setHasDelivery] = useState(false);
  const [hasReservations, setHasReservations] = useState(false);
  const [suggestedPreset, setSuggestedPreset] = useState<VenuePreset>("quick_sell");

  const [operatingHours, setOperatingHours] = useState<VenueOperatingHour[]>(createDefaultVenueOperatingHours);

  useEffect(() => {
    const venueDataStr = localStorage.getItem("jv_venue_data");
    if (!venueDataStr) return;

    try {
      const venueData = JSON.parse(venueDataStr);
      if (venueData.venueType) setVenueType(venueData.venueType);
      if (venueData.address) setAddress(venueData.address);
      if (venueData.capacity !== undefined && venueData.capacity !== null) setCapacity(String(venueData.capacity));
      if (venueData.description) setDescription(venueData.description);
      if (venueData.staffSize) setStaffSize(venueData.staffSize);
      if (typeof venueData.minimumEntryAge === "number") {
        setMinimumEntryAge(venueData.minimumEntryAge);
        setHasManualAgePolicy(true);
      }
      if (venueData.entryControlPolicy) setEntryControlPolicy(venueData.entryControlPolicy);
      if (venueData.securityOperationMode) setSecurityOperationMode(venueData.securityOperationMode);
      if (venueData.venuePreset) setSelectedPreset(venueData.venuePreset);
      if (venueData.hasDelivery !== undefined) setHasDelivery(venueData.hasDelivery);
      if (venueData.hasReservations !== undefined) setHasReservations(venueData.hasReservations);
      if (venueData.operatingHours) setOperatingHours(normalizeVenueOperatingHours(venueData.operatingHours));
      if (typeof venueData.latitude === "number" && typeof venueData.longitude === "number") {
        setDetectedLat(venueData.latitude);
        setDetectedLng(venueData.longitude);
        if (venueData.detectedCountry) setDetectedCountry(venueData.detectedCountry);
        if (venueData.detectedCountryCode) setDetectedCountryCode(venueData.detectedCountryCode);
        if (venueData.detectedState) setDetectedState(venueData.detectedState);
        if (venueData.detectedCity) setDetectedCity(venueData.detectedCity);
        if (venueData.detectedSuburb) setDetectedSuburb(venueData.detectedSuburb);
        setLocationDetected(true);
      }
    } catch (error) {
      console.error("Error parsing venue data:", error);
    }
  }, []);

  useEffect(() => {
    setSuggestedPreset(suggestPreset(hasDelivery, hasReservations));
  }, [hasDelivery, hasReservations]);

  useEffect(() => {
    if (!detectedCountryCode || !venueType || hasManualAgePolicy) return;
    setMinimumEntryAge(getDefaultMinimumEntryAge(detectedCountryCode, venueType));
  }, [detectedCountryCode, venueType, hasManualAgePolicy]);

  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setDetectingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }),
      );

      const { latitude, longitude } = position.coords;
      setDetectedLat(latitude);
      setDetectedLng(longitude);

      const { data, error } = await supabase.functions.invoke("geocode-address", {
        body: { address: `${latitude},${longitude}` },
      });

      if (error || !data?.success) {
        toast.error("Could not determine your location. Please try again.");
        return;
      }

      setDetectedCountry(data.country || "");
      setDetectedState(data.state || "");
      setDetectedCity(data.city || "");
      setDetectedSuburb(data.suburb || "");

      const resolvedCode = data.countryCode || getCountryByName(data.country || "")?.code || "";

      if (resolvedCode && !isCountryEnabled(resolvedCode)) {
        const countryName = getCountryByCode(resolvedCode)?.name || data.country || resolvedCode;
        toast.error(`${countryName} is not yet available on the platform. We're working on expanding to more regions soon!`);
        return;
      }

      setDetectedCountryCode(resolvedCode);
      setLocationDetected(true);
      toast.success("Location detected successfully!");
    } catch (error) {
      const errorCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number"
        ? error.code
        : undefined;

      if (errorCode === 1) {
        toast.error("Location access denied. Please enable location services to continue.");
      } else if (errorCode === 2) {
        toast.error("Location unavailable. Please try again.");
      } else if (errorCode === 3) {
        toast.error("Location request timed out. Please try again.");
      } else {
        toast.error("Failed to detect location. Please try again.");
      }
    } finally {
      setDetectingLocation(false);
    }
  };

  const upsertVenueStep = async (step: string, venueData: Record<string, unknown>): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const venueName = localStorage.getItem("jv_venue_name") || "My Venue";
      const basicVenueUpdates = {
        venue_type: typeof venueData.venueType === "string" ? venueData.venueType : null,
        address: typeof venueData.address === "string" && venueData.address.trim() ? venueData.address.trim() : null,
        capacity: typeof venueData.capacity === "number" ? venueData.capacity : null,
        description: typeof venueData.description === "string" && venueData.description.trim() ? venueData.description.trim() : null,
      };
      const venueUpdates = {
        name: venueName,
        ...basicVenueUpdates,
        country: typeof venueData.country === "string" ? venueData.country || null : null,
        country_code: typeof venueData.country_code === "string" ? venueData.country_code || null : null,
        city: typeof venueData.city === "string" ? venueData.city || null : null,
        latitude: typeof venueData.latitude === "number" ? venueData.latitude : null,
        longitude: typeof venueData.longitude === "number" ? venueData.longitude : null,
        currency: typeof venueData.defaultCurrency === "string" ? venueData.defaultCurrency : "USD",
        staff_size: typeof venueData.staffSize === "string" ? venueData.staffSize || null : null,
        delivery_enabled: venueData.hasDelivery === true,
        reservations_enabled: venueData.hasReservations === true,
        registration_step: step,
      };

      const { data: existing } = await supabase
        .from("venues")
        .select("id, registration_step")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      const { data: savedVenue, error: venueError } = existing
        ? await supabase
          .from("venues")
          .update(
            isReferencePresentation
              ? {
                ...basicVenueUpdates,
                ...(existing.registration_step === null ? { registration_step: step } : {}),
              }
              : venueUpdates,
          )
          .eq("id", existing.id)
          .select("id")
          .single()
        : await supabase
          .from("venues")
          .insert(
            isReferencePresentation
              ? {
                ...basicVenueUpdates,
                name: venueName,
                owner_user_id: user.id,
                approval_status: "approved",
                venue_setup_type: venueData.venueType === "food_truck" ? "mobile" : "permanent",
                registration_step: step,
              }
              : {
                ...venueUpdates,
                owner_user_id: user.id,
                approval_status: "approved",
                venue_setup_type: venueData.venueType === "food_truck" ? "mobile" : "permanent",
              },
          )
          .select("id")
          .single();

      if (venueError) throw venueError;
      if (!savedVenue) return null;

      localStorage.setItem("jv_current_venue_id", savedVenue.id);
      localStorage.setItem("jv_venue_data", JSON.stringify({ ...venueData, id: savedVenue.id }));

      if (!isReferencePresentation) {
        const hours = normalizeVenueOperatingHours(
          Array.isArray(venueData.operatingHours) ? venueData.operatingHours as Partial<VenueOperatingHour>[] : undefined,
        );
        const { error: hoursError } = await supabase
          .from("venue_operating_hours")
          .upsert(
            hours.map((hour) => ({
              venue_id: savedVenue.id,
              day_of_week: hour.day,
              open_time: hour.openTime,
              close_time: hour.closeTime,
              is_closed: hour.isClosed,
            })),
            { onConflict: "venue_id,day_of_week" },
          );

        if (hoursError) throw hoursError;
      }
      return savedVenue.id;
    } catch (error) {
      console.warn("[VenueEssentials] venue data sync failed (progress remains saved locally):", error);
      return null;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!venueType || !address.trim()) {
      toast.error("Enter your venue type and address to continue");
      return;
    }

    const parsedCapacity = capacity.trim() ? Number.parseInt(capacity, 10) : null;
    if (capacity.trim() && (!Number.isFinite(parsedCapacity) || parsedCapacity < 1)) {
      toast.error("Guest capacity must be a positive number");
      return;
    }

    setLoading(true);

    const existingData = localStorage.getItem("jv_venue_data");
    const venueData = existingData ? JSON.parse(existingData) : {};
    const defaultCurrency = getCountryByCode(detectedCountryCode)?.currency || "USD";

    const updatedData = isReferencePresentation
      ? {
        ...venueData,
        venueType,
        address,
        capacity: parsedCapacity,
        description,
      }
      : {
        ...venueData,
        venueType,
        address,
        capacity: parsedCapacity,
        description,
        country: detectedCountry,
        country_code: detectedCountryCode,
        city: detectedCity,
        state: detectedState,
        suburb: detectedSuburb,
        latitude: detectedLat,
        longitude: detectedLng,
        detectedCountry,
        detectedCountryCode,
        detectedState,
        detectedCity,
        detectedSuburb,
        defaultCurrency,
        staffSize,
        minimumEntryAge,
        entryControlPolicy,
        securityOperationMode: entryControlPolicy === "open_entry" ? null : securityOperationMode,
        venuePreset: selectedPreset,
        hasDelivery,
        hasReservations,
        operatingHours,
      };

    localStorage.setItem("jv_venue_data", JSON.stringify(updatedData));
    try {
      await upsertVenueStep("essentials", updatedData);
      navigate(isReferencePresentation ? "/venue/verification?source=reference" : "/venue/verification");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    const existingData = localStorage.getItem("jv_venue_data");
    const venueData = existingData ? JSON.parse(existingData) : {};
    const updatedData = {
      ...venueData,
      venueType,
      address,
      capacity: capacity.trim() ? Number.parseInt(capacity, 10) : null,
      description,
      country: detectedCountry,
      country_code: detectedCountryCode,
      city: detectedCity,
      latitude: detectedLat,
      longitude: detectedLng,
      defaultCurrency: getCountryByCode(detectedCountryCode)?.currency || "USD",
      venuePreset: selectedPreset,
      hasDelivery,
      hasReservations,
      minimumEntryAge,
      entryControlPolicy,
      securityOperationMode: entryControlPolicy === "open_entry" ? null : securityOperationMode,
      operatingHours,
    };

    localStorage.setItem("jv_venue_data", JSON.stringify(updatedData));
    await upsertVenueStep("essentials", updatedData);
    navigate(isReferencePresentation ? "/venue/verification?source=reference" : "/venue/verification");
  };

  if (isReferencePresentation) {
    return (
      <VenueOnboardingShell step={4} backTo="/venue/verify-phone?source=reference" wide>
        <section className="venue-onboarding-card venue-essentials-card venue-essentials-card--reference">
          <div className="venue-onboarding-card__heading">
            <div className="venue-onboarding-card__icon">
              <Store aria-hidden="true" />
            </div>
            <h1>Tell us about your venue</h1>
            <p>This information helps guests discover the right experience.</p>
          </div>

          <form className="venue-essentials-reference-form" onSubmit={handleSubmit}>
            <div className="venue-onboarding-field">
              <label htmlFor="venue-type">Venue type</label>
              <Select value={venueType} onValueChange={setVenueType}>
                <SelectTrigger id="venue-type" className="venue-essentials-select">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="venue-essentials-select-content">
                  {venueTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.icon} {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="venue-onboarding-field">
              <label htmlFor="venue-capacity">Guest capacity</label>
              <input
                id="venue-capacity"
                className="venue-essentials-input"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="120"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </div>

            <div className="venue-onboarding-field venue-essentials-field--wide">
              <label htmlFor="venue-address">Address</label>
              <textarea
                id="venue-address"
                className="venue-essentials-textarea"
                placeholder="123 Main Street, Austin, TX 78701"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                required
              />
            </div>

            <div className="venue-onboarding-field venue-essentials-field--wide">
              <label htmlFor="venue-description">Short description</label>
              <textarea
                id="venue-description"
                className="venue-essentials-textarea"
                placeholder="Tell guests what makes your venue special."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <button
              className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
              type="submit"
              disabled={loading || !venueType || !address.trim()}
            >
              {loading ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : null}
              <span>{loading ? "Saving..." : "Continue"}</span>
              {!loading && <ArrowRight aria-hidden="true" />}
            </button>
          </form>
        </section>
      </VenueOnboardingShell>
    );
  }

  return (
    <VenueOnboardingShell step={4} backTo="/venue/verify-phone" wide>
      <section className="venue-onboarding-card venue-essentials-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            <Store aria-hidden="true" />
          </div>
          <h1>Tell us about your venue</h1>
          <p>This information helps guests discover the right experience.</p>
        </div>

        <form className="venue-onboarding-form venue-essentials-form" onSubmit={handleSubmit}>
          <section className="venue-essentials-section" aria-labelledby="venue-location-heading">
            <div className="venue-essentials-section__heading">
              <MapPin aria-hidden="true" />
              <div>
                <h2 id="venue-location-heading">Location &amp; type</h2>
                <p>Confirm where your venue operates and how your team works.</p>
              </div>
            </div>

            <div className="venue-essentials-fields">
              <div className="venue-onboarding-field">
                <label htmlFor="venue-type">Venue type</label>
                <Select value={venueType} onValueChange={setVenueType}>
                  <SelectTrigger id="venue-type" className="venue-essentials-select">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="venue-essentials-select-content">
                    {venueTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.icon} {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="venue-onboarding-field">
                <label htmlFor="venue-capacity">Guest capacity</label>
                <input
                  id="venue-capacity"
                  className="venue-essentials-input"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="120"
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                />
              </div>

              <div className="venue-onboarding-field venue-essentials-field--wide">
                <label htmlFor="venue-address">Address</label>
                <textarea
                  id="venue-address"
                  className="venue-essentials-textarea"
                  placeholder="123 Main Street, Austin, TX 78701"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  required
                />
                <div className="venue-essentials-location-prompt">
                  <button
                    className="venue-essentials-link-button"
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={detectingLocation}
                  >
                    {detectingLocation ? <Loader2 className="venue-essentials-spin" aria-hidden="true" /> : <Navigation aria-hidden="true" />}
                    <span>{detectingLocation ? "Detecting your location..." : "Use my current location (optional)"}</span>
                  </button>
                  <small>You can continue with the address you entered. Location lookup is optional.</small>
                </div>

                {locationDetected && (
                  <div className="venue-essentials-location-summary">
                    <div className="venue-essentials-location-summary__status">
                      <CheckCircle2 aria-hidden="true" />
                      <span>Location found</span>
                    </div>
                    <dl>
                      {detectedCountry && <div><dt>Country</dt><dd><Lock aria-hidden="true" />{detectedCountry}</dd></div>}
                      {detectedState && <div><dt>State</dt><dd><Lock aria-hidden="true" />{detectedState}</dd></div>}
                      {detectedCity && <div><dt>City</dt><dd><Lock aria-hidden="true" />{detectedCity}</dd></div>}
                      {detectedSuburb && <div><dt>Suburb / town</dt><dd><Lock aria-hidden="true" />{detectedSuburb}</dd></div>}
                    </dl>
                    {!detectedSuburb && !detectedCity && detectedState && (
                      <p>Suburb or city was not detected. Your venue will appear under its state.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="venue-onboarding-field venue-essentials-field--wide">
                <label htmlFor="venue-description">Short description</label>
                <textarea
                  id="venue-description"
                  className="venue-essentials-textarea"
                  placeholder="Tell guests what makes your venue special."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              <div className="venue-onboarding-field">
                <label htmlFor="venue-staff-size">Team size</label>
                <Select value={staffSize} onValueChange={setStaffSize}>
                  <SelectTrigger id="venue-staff-size" className="venue-essentials-select">
                    <SelectValue placeholder="How many staff?" />
                  </SelectTrigger>
                  <SelectContent className="venue-essentials-select-content">
                    {staffSizeOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="venue-essentials-section" aria-labelledby="entry-policy-heading">
            <div className="venue-essentials-section__heading">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <h2 id="entry-policy-heading">Entry policy</h2>
                <p>These settings define venue policy only and do not change check-in behavior here.</p>
              </div>
            </div>

            <div className="venue-essentials-fields">
              <div className="venue-onboarding-field">
                <label htmlFor="venue-minimum-entry-age">Minimum entry age</label>
                <Select
                  value={String(minimumEntryAge)}
                  onValueChange={(value) => {
                    setMinimumEntryAge(Number(value));
                    setHasManualAgePolicy(true);
                  }}
                >
                  <SelectTrigger id="venue-minimum-entry-age" className="venue-essentials-select">
                    <SelectValue placeholder="Select minimum age" />
                  </SelectTrigger>
                  <SelectContent className="venue-essentials-select-content">
                    <SelectItem value="0">None / all ages</SelectItem>
                    <SelectItem value="16">16+</SelectItem>
                    <SelectItem value="18">18+</SelectItem>
                    <SelectItem value="21">21+</SelectItem>
                  </SelectContent>
                </Select>
                <small>Auto-suggested from country and venue type. You can override it.</small>
              </div>

              <div className="venue-onboarding-field">
                <label htmlFor="venue-entry-control">Entry control</label>
                <Select value={entryControlPolicy} onValueChange={(value: EntryControlPolicy) => setEntryControlPolicy(value)}>
                  <SelectTrigger id="venue-entry-control" className="venue-essentials-select">
                    <SelectValue placeholder="Select entry control policy" />
                  </SelectTrigger>
                  <SelectContent className="venue-essentials-select-content">
                    <SelectItem value="open_entry">No security required</SelectItem>
                    <SelectItem value="security_required">Yes, security required</SelectItem>
                    <SelectItem value="hybrid_entry">Sometimes / hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {entryControlPolicy !== "open_entry" && (
                <div className="venue-onboarding-field venue-essentials-field--wide">
                  <label htmlFor="venue-security-operation">When is security active?</label>
                  <Select value={securityOperationMode} onValueChange={(value: SecurityOperationMode) => setSecurityOperationMode(value)}>
                    <SelectTrigger id="venue-security-operation" className="venue-essentials-select">
                      <SelectValue placeholder="Select security operation mode" />
                    </SelectTrigger>
                    <SelectContent className="venue-essentials-select-content">
                      <SelectItem value="always_active">Always</SelectItem>
                      <SelectItem value="scheduled">Only certain times</SelectItem>
                      <SelectItem value="event_based">Event based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

          <section className="venue-essentials-section" aria-labelledby="venue-operations-heading">
            <div className="venue-essentials-section__heading">
              <Settings2 aria-hidden="true" />
              <div>
                <h2 id="venue-operations-heading">Tell us about your operations</h2>
                <p>These answers help us suggest the best setup for your venue.</p>
              </div>
            </div>

            <div className="venue-essentials-toggles">
              <label className="venue-essentials-toggle-row" htmlFor="venue-delivery">
                <span className="venue-essentials-toggle-row__icon"><Truck aria-hidden="true" /></span>
                <span>
                  <strong>Do you offer delivery?</strong>
                  <small>Food delivery to customers</small>
                </span>
                <Switch id="venue-delivery" className="venue-essentials-switch" checked={hasDelivery} onCheckedChange={setHasDelivery} />
              </label>

              <label className="venue-essentials-toggle-row" htmlFor="venue-reservations">
                <span className="venue-essentials-toggle-row__icon"><CalendarDays aria-hidden="true" /></span>
                <span>
                  <strong>Do you take table reservations?</strong>
                  <small>Advance booking for tables</small>
                </span>
                <Switch id="venue-reservations" className="venue-essentials-switch" checked={hasReservations} onCheckedChange={setHasReservations} />
              </label>
            </div>
          </section>

          <section className="venue-essentials-section" aria-labelledby="venue-plan-heading">
            <div className="venue-essentials-section__heading">
              <Zap aria-hidden="true" />
              <div>
                <h2 id="venue-plan-heading">Choose your plan</h2>
                <p>Pick what works for your venue. You can change this at any time in Settings.</p>
              </div>
            </div>

            <div className="venue-essentials-presets" role="radiogroup" aria-label="Venue plan">
              {(Object.entries(venuePresets) as [VenuePreset, typeof venuePresets.quick_sell][]).map(([preset, config]) => {
                const Icon = presetIcons[preset];
                const isSelected = selectedPreset === preset;
                const isSuggested = suggestedPreset === preset;

                return (
                  <button
                    key={preset}
                    className={`venue-essentials-preset${isSelected ? " is-selected" : ""}`}
                    data-preset={preset}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedPreset(preset)}
                  >
                    <span className="venue-essentials-preset__icon"><Icon aria-hidden="true" /></span>
                    <span className="venue-essentials-preset__body">
                      <span className="venue-essentials-preset__topline">
                        <strong>{config.name}</strong>
                        {isSuggested && !isSelected && <em>Recommended</em>}
                        {isSelected && <CheckCircle2 aria-label="Selected" />}
                      </span>
                      <small>{config.description}</small>
                      <span className="venue-essentials-preset__features">
                        {presetFeatures[preset].map((feature) => (
                          <span key={feature}>{feature === "Wallet" ? t("common:navigation.wallet") : feature}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="venue-essentials-section" aria-labelledby="venue-hours-heading">
            <div className="venue-essentials-section__heading">
              <Clock aria-hidden="true" />
              <div>
                <h2 id="venue-hours-heading">Operating hours</h2>
                <p>Set regular hours for reservations and the guest-facing open-now status.</p>
              </div>
            </div>

            <VenueOperatingHoursEditor
              className="venue-essentials-hours"
              idPrefix="venue-hours"
              value={operatingHours}
              onChange={setOperatingHours}
            />
          </section>

          <button
            className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
            type="submit"
            disabled={loading || !venueType || !address.trim()}
          >
            {loading ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : null}
            <span>{loading ? "Saving..." : "Continue"}</span>
            {!loading && <ArrowRight aria-hidden="true" />}
          </button>

          <div className="venue-onboarding-actions">
            <button type="button" onClick={() => void handleSkip()} disabled={loading}>Skip for now</button>
          </div>
        </form>
      </section>
    </VenueOnboardingShell>
  );
}

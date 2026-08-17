import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleCheck, ImageUp, Loader2, Mail, MapPin, Phone, Save } from "lucide-react";
import VenueOperatingHoursEditor from "@/components/Venue/VenueOperatingHoursEditor";
import {
  createDefaultVenueOperatingHours,
  normalizeVenueOperatingHours,
  type VenueOperatingHour,
} from "@/lib/venueOperatingHours";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "./venue-account.css";

interface VenueData {
  id: string;
  name: string;
  venue_type: string | null;
  business_email: string | null;
  phone: string | null;
  address: string | null;
  capacity: number | null;
  image_url: string | null;
}

interface AccountFormData {
  name: string;
  venue_type: string;
  business_email: string;
  phone: string;
  address: string;
  capacity: string;
}

const venueTypeOptions = ["Restaurant", "Bar", "Club", "Cafe", "Event venue"];

function createFormData(venue: VenueData | null): AccountFormData {
  return {
    name: venue?.name || "",
    venue_type: venue?.venue_type || "",
    business_email: venue?.business_email || "",
    phone: venue?.phone || "",
    address: venue?.address || "",
    capacity: venue?.capacity?.toString() || "",
  };
}

function getInitials(name: string) {
  return name.split(" ").map((word) => word[0]).join("").toUpperCase().slice(0, 2) || "JV";
}

function formatReferenceTime(value: string) {
  const [rawHour, rawMinute] = value.slice(0, 5).split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;

  const meridiem = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function formatReferenceOperatingHours(hours: VenueOperatingHour[]) {
  const firstOpenDay = hours.find((hour) => !hour.isClosed) ?? hours[0];
  if (!firstOpenDay) return "";

  return `${formatReferenceTime(firstOpenDay.openTime)} - ${formatReferenceTime(firstOpenDay.closeTime)}`;
}

function parseReferenceTime(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toUpperCase();

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  let normalizedHour = hour;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    normalizedHour = hour % 12 + (meridiem === "PM" ? 12 : 0);
  } else if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }

  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseReferenceOperatingHours(value: string, existingHours: VenueOperatingHour[]) {
  const range = value.trim().split(/\s*[-\u2013\u2014]\s*/);
  if (range.length !== 2) return null;

  const openTime = parseReferenceTime(range[0]);
  const closeTime = parseReferenceTime(range[1]);
  if (!openTime || !closeTime) return null;

  return existingHours.map((hour) => ({ ...hour, openTime, closeTime }));
}

export default function VenueAccount() {
  const [searchParams] = useSearchParams();
  const isReferencePresentation = searchParams.get("source") === "reference";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(() => createFormData(null));
  const [operatingHours, setOperatingHours] = useState<VenueOperatingHour[]>(createDefaultVenueOperatingHours);
  const [savedOperatingHours, setSavedOperatingHours] = useState<VenueOperatingHour[]>(createDefaultVenueOperatingHours);
  const [referenceOperatingHours, setReferenceOperatingHours] = useState("");
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadVenueData = async () => {
      const storedVenueId = localStorage.getItem("jv_current_venue_id");
      if (!storedVenueId) {
        setLoading(false);
        return;
      }

      try {
        const [{ data, error }, { data: hoursData, error: hoursError }] = await Promise.all([
          supabase
            .from("venues")
            .select("id, name, venue_type, business_email, phone, address, capacity, image_url")
            .eq("id", storedVenueId)
            .single(),
          supabase
            .from("venue_operating_hours")
            .select("day_of_week, open_time, close_time, is_closed")
            .eq("venue_id", storedVenueId)
            .order("day_of_week"),
        ]);

        if (error) throw error;
        if (hoursError) throw hoursError;

        if (data) {
          setVenue(data);
          setFormData(createFormData(data));
        }

        const normalizedHours = normalizeVenueOperatingHours(
          hoursData?.map((hour) => ({
            day: hour.day_of_week,
            openTime: hour.open_time,
            closeTime: hour.close_time,
            isClosed: hour.is_closed ?? false,
          })),
        );
        setOperatingHours(normalizedHours);
        setSavedOperatingHours(normalizedHours);
        setReferenceOperatingHours(formatReferenceOperatingHours(normalizedHours));
      } catch (error) {
        console.error("Error loading venue data:", error);
        toast.error("Failed to load venue data");
      } finally {
        setLoading(false);
      }
    };

    void loadVenueData();
  }, []);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [logoPreviewUrl, venue?.image_url]);

  useEffect(() => () => {
    if (logoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl);
  }, [logoPreviewUrl]);

  const handleInputChange = (field: keyof AccountFormData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo image must be less than 5MB");
      return;
    }

    setSelectedLogo(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setFeedback("Logo ready to save.");
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!venue?.id) {
      toast.error("No venue selected");
      return;
    }

    const capacity = formData.capacity ? Number.parseInt(formData.capacity, 10) : null;
    if (formData.capacity && (!Number.isFinite(capacity) || capacity < 1)) {
      toast.error("Guest capacity must be a positive number");
      return;
    }

    const hoursToSave = isReferencePresentation
      ? parseReferenceOperatingHours(referenceOperatingHours, operatingHours)
      : operatingHours;

    if (!hoursToSave) {
      toast.error("Enter operating hours as a time range, for example 6:00 PM - 2:00 AM.");
      return;
    }

    setSaving(true);
    try {
      let imageUrl = venue.image_url;

      if (selectedLogo) {
        const sanitizedName = selectedLogo.name.replace(/[^a-z0-9.]/gi, "-") || "logo";
        const filePath = `venue-logos/${venue.id}/${Date.now()}-${sanitizedName}`;
        const { error: uploadError } = await supabase.storage
          .from("venue-assets")
          .upload(filePath, selectedLogo, { contentType: selectedLogo.type });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("venue-assets")
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      }

      const updates = {
        name: formData.name.trim(),
        venue_type: formData.venue_type.trim() || null,
        business_email: formData.business_email.trim() || null,
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        capacity,
        image_url: imageUrl,
      };

      const { error } = await supabase
        .from("venues")
        .update(updates)
        .eq("id", venue.id);

      if (error) throw error;

      const { error: hoursError } = await supabase
        .from("venue_operating_hours")
        .upsert(
          normalizeVenueOperatingHours(hoursToSave).map((hour) => ({
            venue_id: venue.id,
            day_of_week: hour.day,
            open_time: hour.openTime,
            close_time: hour.closeTime,
            is_closed: hour.isClosed,
          })),
          { onConflict: "venue_id,day_of_week" },
        );

      if (hoursError) throw hoursError;

      setVenue((current) => current ? { ...current, ...updates } : null);
      const normalizedSavedHours = normalizeVenueOperatingHours(hoursToSave);
      setOperatingHours(normalizedSavedHours);
      setSavedOperatingHours(normalizedSavedHours);
      setReferenceOperatingHours(formatReferenceOperatingHours(normalizedSavedHours));
      setSelectedLogo(null);
      setLogoPreviewUrl(null);
      setFeedback("Venue details saved.");
      toast.success("Account details updated!");
    } catch (error) {
      console.error("Save error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFormData(createFormData(venue));
    setSelectedLogo(null);
    setLogoPreviewUrl(null);
    setOperatingHours(savedOperatingHours);
    setReferenceOperatingHours(formatReferenceOperatingHours(savedOperatingHours));
    setFeedback("");
  };

  if (loading) {
    return (
      <div className="venue-account-page venue-account-page--loading">
        <Loader2 aria-hidden="true" />
      </div>
    );
  }

  const avatarUrl = logoPreviewUrl || venue?.image_url || null;
  const profileName = venue?.name || formData.name || "Venue";
  const accountTypeOptions = formData.venue_type && !venueTypeOptions.includes(formData.venue_type)
    ? [formData.venue_type, ...venueTypeOptions]
    : venueTypeOptions;

  return (
    <main className="venue-account-page">
      <header className="venue-account-heading">
        <div>
          <h1>Account</h1>
          <p>Manage the public details for your venue and its account contact information.</p>
        </div>
        <span className="venue-account-status">
          <CircleCheck aria-hidden="true" />
          Profile active
        </span>
      </header>

      <section className="venue-account-card venue-account-overview" aria-labelledby="venue-account-profile-title">
        <div className="venue-account-overview__identity">
          <div className="venue-account-avatar" aria-hidden="true">
            {avatarUrl && !imageLoadFailed ? (
              <img src={avatarUrl} alt="" onError={() => setImageLoadFailed(true)} />
            ) : (
              getInitials(profileName)
            )}
          </div>
          <div>
            <p className="venue-account-overview__label">VENUE PROFILE</p>
            <h2 id="venue-account-profile-title">{profileName}</h2>
            <span>Venue owner</span>
          </div>
          <button
            className="venue-account-button venue-account-button--secondary venue-account-button--compact"
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={saving}
          >
            <ImageUp aria-hidden="true" />
            <span>Change logo</span>
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handleLogoChange} />
        </div>

        <dl className="venue-account-overview__details">
          <div>
            <dt><Mail aria-hidden="true" />Account email</dt>
            <dd>{venue?.business_email || "Not set"}</dd>
          </div>
          <div>
            <dt><Phone aria-hidden="true" />Phone</dt>
            <dd>{venue?.phone || "Not set"}</dd>
          </div>
          <div>
            <dt><MapPin aria-hidden="true" />Venue location</dt>
            <dd>{venue?.address || "Not set"}</dd>
          </div>
        </dl>
      </section>

      <section className="venue-account-card venue-account-details" aria-labelledby="venue-account-details-title">
        <header className="venue-account-details__header">
          <p className="venue-account-overview__label">PUBLIC PROFILE</p>
          <h2 id="venue-account-details-title">Venue details</h2>
          <p>Keep guest-facing information accurate across JointVibe.</p>
        </header>

        <form className="venue-account-form" onSubmit={handleSave}>
          <label className="venue-account-field" htmlFor="venue-account-name">
            <span>Venue name</span>
            <input
              id="venue-account-name"
              value={formData.name}
              onChange={(event) => handleInputChange("name", event.target.value)}
              required
            />
          </label>

          <label className="venue-account-field" htmlFor="venue-account-type">
            <span>Venue type</span>
            <select
              id="venue-account-type"
              value={formData.venue_type}
              onChange={(event) => handleInputChange("venue_type", event.target.value)}
            >
              <option value="">Select venue type</option>
              {accountTypeOptions.map((venueType) => <option key={venueType} value={venueType}>{venueType}</option>)}
            </select>
          </label>

          <label className="venue-account-field" htmlFor="venue-account-email">
            <span>Public email</span>
            <input
              id="venue-account-email"
              type="email"
              value={formData.business_email}
              onChange={(event) => handleInputChange("business_email", event.target.value)}
            />
          </label>

          <label className="venue-account-field" htmlFor="venue-account-phone">
            <span>Phone number</span>
            <input
              id="venue-account-phone"
              type="tel"
              value={formData.phone}
              onChange={(event) => handleInputChange("phone", event.target.value)}
            />
          </label>

          <label className="venue-account-field venue-account-field--wide" htmlFor="venue-account-address">
            <span>Address</span>
            <textarea
              id="venue-account-address"
              rows={3}
              value={formData.address}
              onChange={(event) => handleInputChange("address", event.target.value)}
            />
          </label>

          <label className="venue-account-field" htmlFor="venue-account-capacity">
            <span>Guest capacity</span>
            <input
              id="venue-account-capacity"
              type="number"
              min={1}
              value={formData.capacity}
              onChange={(event) => handleInputChange("capacity", event.target.value)}
            />
          </label>

          {isReferencePresentation ? (
            <label className="venue-account-field" htmlFor="venue-account-hours">
              <span>Operating hours</span>
              <input
                id="venue-account-hours"
                value={referenceOperatingHours}
                onChange={(event) => setReferenceOperatingHours(event.target.value)}
                placeholder="6:00 PM - 2:00 AM"
              />
            </label>
          ) : (
            <section className="venue-account-hours venue-account-field--wide" aria-labelledby="venue-account-hours-title">
              <div className="venue-account-hours__heading">
                <span id="venue-account-hours-title">Operating hours</span>
                <small>Set the regular schedule guests use to plan visits and reservations.</small>
              </div>
              <VenueOperatingHoursEditor
                idPrefix="venue-account-hours"
                value={operatingHours}
                onChange={setOperatingHours}
              />
            </section>
          )}

          <footer className="venue-account-form__footer">
            <p className="venue-account-feedback" role="status" aria-live="polite">{feedback}</p>
            <div>
              <button className="venue-account-button venue-account-button--secondary" type="button" onClick={handleReset} disabled={saving}>
                Reset
              </button>
              <button className="venue-account-button venue-account-button--primary" type="submit" disabled={saving}>
                {saving ? <Loader2 className="venue-account-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                <span>Save changes</span>
              </button>
            </div>
          </footer>
        </form>
      </section>
    </main>
  );
}

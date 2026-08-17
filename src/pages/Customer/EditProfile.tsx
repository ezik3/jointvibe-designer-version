import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, User, MapPin, Globe, Image as ImageIcon, Upload, Lock, ShieldCheck, ShieldAlert, Languages, Monitor, Smartphone } from "lucide-react";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cacheUserProfile } from "@/hooks/useGlobalPrefetch";
import CameraCapture from "@/components/Camera/CameraCapture";
import { LocationChangeDialog } from "@/components/shared/LocationChangeDialog";
import { getCountryByCode } from "@/config/countries";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/i18n";
import { useUserLanguage } from "@/hooks/useUserLanguage";
import { useMobileNavVisibility } from "@/contexts/MobileNavVisibilityContext";
import "./edit-profile.css";

const EditProfile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("common");
  const [saving, setSaving] = useState(false);
  const [selectedLang, setSelectedLang] = useState(
    () => i18n.resolvedLanguage || localStorage.getItem("jv_language") || "en"
  );
  const [showCamera, setShowCamera] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [walletBalanceUsd, setWalletBalanceUsd] = useState(0);
  const { isVerified } = useVerificationStatus();
  const { updateUserLanguage } = useUserLanguage();
  const { setMobileNavsVisible } = useMobileNavVisibility();

  useEffect(() => {
    setMobileNavsVisible(false);
    return () => setMobileNavsVisible(true);
  }, [setMobileNavsVisible]);

  async function handleLanguageChange(lang: string) {
    console.log("[i18n] User selected language:", lang);
    setSelectedLang(lang);
    const result = await updateUserLanguage(lang as LanguageCode);
    if (!result.success) {
      console.error("[i18n] Failed to persist language to DB:", result.error);
      toast.error(t('edit_profile_toasts.lang_save_failed'));
    } else {
      console.log("[i18n] Language persisted to DB. i18n.language is now:", i18n.resolvedLanguage);
    }
  }

  const [form, setForm] = useState({
    display_name: "",
    bio: "",
    location: "",
    avatar_url: "",
    nationality: "",
    background_url: "",
    background_mobile: "",
    background_desktop: "",
    country_code: "",
    currency: "",
    state: "",
    suburb: "",
    city: "",
    latitude: 0,
    longitude: 0,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const verifiedName = localStorage.getItem("jv_verified_name");
      const profilePicture = localStorage.getItem("jv_profile_picture");

      setForm({
        display_name: data?.display_name || verifiedName || user.email?.split("@")[0] || "",
        bio: data?.bio || "",
        location: data?.location || "",
        avatar_url: data?.avatar_url || profilePicture || "",
        nationality: "",
        background_url: data?.selected_background || "",
        background_mobile: (data as any)?.background_mobile || "",
        background_desktop: (data as any)?.background_desktop || "",
        country_code: data?.country_code || localStorage.getItem("jv_user_country_code") || "",
        currency: data?.currency || localStorage.getItem("jv_display_currency") || "USD",
        state: data?.state || "",
        suburb: data?.suburb || "",
        city: data?.city || "",
        latitude: data?.latitude || 0,
        longitude: data?.longitude || 0,
      });

      // Fetch wallet balance for currency conversion preview
      const { data: wallet } = await supabase
        .from("wallets" as any)
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      if (wallet && (wallet as any).balance) {
        setWalletBalanceUsd(Number((wallet as any).balance) || 0);
      }
    };
    load();
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Optimistic preview
    const previewUrl = URL.createObjectURL(file);
    const previousUrl = form.avatar_url;
    setForm((f) => ({ ...f, avatar_url: previewUrl }));

    const ext = file.name.split(".").pop();
    const path = `avatars/${user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    URL.revokeObjectURL(previewUrl);

    if (uploadError) {
      setForm((f) => ({ ...f, avatar_url: previousUrl }));
      toast.error(t('edit_profile_toasts.upload_failed'));
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();
    setForm((f) => ({ ...f, avatar_url: url }));
    localStorage.setItem("jv_profile_picture", url);
    toast.success(t('edit_profile_toasts.photo_uploaded'));
  };

  const handleCameraCapture = async (imageData: string) => {
    setShowCamera(false);
    if (!user) return;

    // Optimistic preview with the base64 data
    const previousUrl = form.avatar_url;
    setForm((f) => ({ ...f, avatar_url: imageData }));

    try {
      // Convert base64 to blob
      const res = await fetch(imageData);
      const blob = await res.blob();
      const path = `avatars/${user.id}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) {
        setForm((f) => ({ ...f, avatar_url: previousUrl }));
        toast.error(t('edit_profile_toasts.upload_photo_failed'));
        return;
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = urlData.publicUrl + "?t=" + Date.now();
      setForm((f) => ({ ...f, avatar_url: url }));
      localStorage.setItem("jv_profile_picture", url);
      toast.success(t('edit_profile_toasts.photo_uploaded'));
    } catch {
      setForm((f) => ({ ...f, avatar_url: previousUrl }));
      toast.error(t('edit_profile_toasts.process_photo_failed'));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("customer_profiles")
      .upsert({
        user_id: user.id,
        bio: form.bio,
        location: form.location,
        avatar_url: form.avatar_url,
        selected_background: form.background_mobile || form.background_desktop || form.background_url,
        background_mobile: form.background_mobile || undefined,
        background_desktop: form.background_desktop || undefined,
        country_code: form.country_code || undefined,
        currency: form.currency || undefined,
        state: form.state || undefined,
        suburb: form.suburb || undefined,
        city: form.city || undefined,
        latitude: form.latitude || undefined,
        longitude: form.longitude || undefined,
      } as any, { onConflict: "user_id" });

    if (error) {
      toast.error(t('edit_profile_toasts.save_failed'));
    } else {
      // Sync localStorage for currency & location
      if (form.country_code) {
        const countryConfig = getCountryByCode(form.country_code);
        localStorage.setItem("jv_user_country_code", form.country_code);
        localStorage.setItem("jv_user_country", countryConfig?.name || form.country_code);
        if (form.currency) {
          localStorage.setItem("jv_display_currency", form.currency);
          localStorage.setItem("jv_user_currency", form.currency);
        }
        if (form.location) {
          const parts = form.location.split(",");
          if (parts.length >= 1) {
            localStorage.setItem("jv_user_city", parts[0].trim());
          }
        }
      }

      cacheUserProfile(user.id, {
        display_name: form.display_name,
        bio: form.bio,
        location: form.location,
        avatar_url: form.avatar_url,
        followers: 0,
        following: 0,
        posts: 0,
      });
      toast.success(t('edit_profile_toasts.saved'));
      navigate("/app/profile");
    }
    setSaving(false);
  };

  const checkVideoDuration = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if (video.duration > 30) {
          toast.error(t('edit_profile_toasts.video_too_long'));
          resolve(false);
        } else {
          resolve(true);
        }
      };
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(true); // allow if we can't check
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const handleBackgroundChange = async (e: React.ChangeEvent<HTMLInputElement>, variant: 'mobile' | 'desktop') => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const isVideo = file.type.startsWith("video/");
    if (isVideo) {
      const ok = await checkVideoDuration(file);
      if (!ok) return;
    }

    const field = variant === 'mobile' ? 'background_mobile' : 'background_desktop';
    const previewUrl = URL.createObjectURL(file);
    const previousUrl = form[field];
    setForm((f) => ({ ...f, [field]: previewUrl }));

    const ext = file.name.split(".").pop();
    const path = `backgrounds/${user.id}-${variant}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("backgrounds")
      .upload(path, file, { upsert: true });

    URL.revokeObjectURL(previewUrl);

    if (uploadError) {
      setForm((f) => ({ ...f, [field]: previousUrl }));
      toast.error(t('edit_profile_toasts.bg_upload_failed'));
      return;
    }

    const { data: urlData } = supabase.storage.from("backgrounds").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();
    setForm((f) => ({ ...f, [field]: url }));
    toast.success(variant === 'mobile' ? t('edit_profile_toasts.mobile_bg_uploaded') : t('edit_profile_toasts.desktop_bg_uploaded'));
  };

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
        title={t('edit_profile_toasts.profile_photo')}
        instruction={t('edit_profile_toasts.position_in_frame')}
        facingMode="user"
        overlay="face"
      />
    );
  }

  return (
    <div className="customer-edit-profile-page">
      <header className="customer-edit-profile-page__header">
        <button onClick={() => navigate("/app/profile")} className="customer-edit-profile-page__back" type="button" aria-label="Back to profile">
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1>{t("profile.editProfile")}</h1>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="customer-edit-profile-page__save"
        >
          {saving ? t("status.loading") : t("app.save")}
        </Button>
      </header>

      <div className="customer-edit-profile-page__content">
        {/* Profile Photo */}
        <div className="customer-edit-profile-page__photo">
          <div className="customer-edit-profile-page__avatar-wrap">
            <div className="customer-edit-profile-page__avatar">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="Profile" />
                ) : (
                  <User aria-hidden="true" />
                )}
            </div>
            <label className="customer-edit-profile-page__avatar-upload" aria-label="Upload profile photo">
              <Camera aria-hidden="true" />
              <input type="file" accept="image/*" onChange={handleAvatarChange} />
            </label>
          </div>
          <div className="customer-edit-profile-page__photo-actions">
            <span>{t("profile.changePhotoHint")}</span>
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="customer-edit-profile-page__take-photo"
            >
              {t("profile.takePhoto")}
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="customer-edit-profile-page__fields">
          {/* Display Name — Locked */}
          <div className="customer-edit-profile-page__field">
            <label>
              <Lock aria-hidden="true" /> {t("profile.displayName")}
            </label>
            <div className="customer-edit-profile-page__input-wrap">
              <Input
                value={form.display_name}
                disabled
                className="customer-edit-profile-page__input"
              />
              <Lock aria-hidden="true" />
            </div>
            {isVerified ? (
              <div className="customer-edit-profile-page__verified">
                <ShieldCheck aria-hidden="true" />
                <span>{t("profile.identityVerified")}</span>
              </div>
            ) : (
              <div className="customer-edit-profile-page__verification">
                <div className="customer-edit-profile-page__verification-title">
                  <ShieldAlert aria-hidden="true" />
                  <span>{t("profile.notVerified")}</span>
                </div>
                <p>
                  {t("profile.verifyIdentityPrompt")}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/user/id-verification")}
                  className="customer-edit-profile-page__verification-button"
                >
                  {t("profile.verifyIdentity")}
                </Button>
              </div>
            )}
          </div>

          <div className="customer-edit-profile-page__field">
            <label>{t("profile.bio")}</label>
            <Textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="customer-edit-profile-page__textarea"
              placeholder={t("profile.bioPlaceholder")}
              rows={3}
              maxLength={200}
            />
          </div>

          <div className="customer-edit-profile-page__field">
            <label>
              <MapPin aria-hidden="true" /> {t("profile.location")}
            </label>
            <button
              type="button"
              onClick={() => setShowLocationDialog(true)}
              className="customer-edit-profile-page__location"
            >
              <span>
                {form.location || t("profile.locationPlaceholder")}
              </span>
              <MapPin aria-hidden="true" />
            </button>
          </div>

          <div className="customer-edit-profile-page__field">
            <label>
              <Globe aria-hidden="true" /> {t("profile.nationality")}
            </label>
            <Input
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
              className="customer-edit-profile-page__input"
              placeholder={t("profile.nationalityPlaceholder")}
              maxLength={50}
            />
          </div>

          {/* Language Selector */}
          <div className="customer-edit-profile-page__field">
            <label>
              <Languages aria-hidden="true" /> {t("profile.language")}
            </label>
            <p className="customer-edit-profile-page__hint">{t("profile.languageHint")}</p>
            <Select value={selectedLang} onValueChange={handleLanguageChange}>
              <SelectTrigger className="customer-edit-profile-page__select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <section className="customer-edit-profile-page__background" aria-label="Profile backgrounds">
          <div className="customer-edit-profile-page__background-heading">
            <label>
              <ImageIcon aria-hidden="true" /> {t("profile.profileBackground")} <span>{t("profile.backgroundOptional")}</span>
            </label>
            <p>{t("profile.backgroundHint")}</p>
          </div>

          <div className="customer-edit-profile-page__uploads">
            {/* Mobile */}
            <div className="customer-edit-profile-page__upload">
              <span className="customer-edit-profile-page__upload-label"><Smartphone aria-hidden="true" /> {t("profile.mobileLabel")}</span>
              <small>1080 x 600 px</small>
              <label className="customer-edit-profile-page__upload-input">
                <div className="customer-edit-profile-page__upload-preview customer-edit-profile-page__upload-preview--mobile">
                  {form.background_mobile ? (
                    <>
                      {form.background_mobile.match(/\.(mp4|webm|mov)/) ? (
                        <video src={form.background_mobile} autoPlay loop muted playsInline />
                      ) : (
                        <img src={form.background_mobile} alt="Mobile background" />
                      )}
                      <div className="customer-edit-profile-page__upload-overlay">
                        <Camera aria-hidden="true" />
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload aria-hidden="true" />
                      <span>{t("actions.upload")}</span>
                    </>
                  )}
                </div>
                <input type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => handleBackgroundChange(e, 'mobile')} />
              </label>
            </div>

            {/* Desktop */}
            <div className="customer-edit-profile-page__upload">
              <span className="customer-edit-profile-page__upload-label"><Monitor aria-hidden="true" /> {t("profile.desktopLabel")}</span>
              <small>1920 x 480 px</small>
              <label className="customer-edit-profile-page__upload-input">
                <div className="customer-edit-profile-page__upload-preview customer-edit-profile-page__upload-preview--desktop">
                  {form.background_desktop ? (
                    <>
                      {form.background_desktop.match(/\.(mp4|webm|mov)/) ? (
                        <video src={form.background_desktop} autoPlay loop muted playsInline />
                      ) : (
                        <img src={form.background_desktop} alt="Desktop background" />
                      )}
                      <div className="customer-edit-profile-page__upload-overlay">
                        <Camera aria-hidden="true" />
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload aria-hidden="true" />
                      <span>{t("actions.upload")}</span>
                    </>
                  )}
                </div>
                <input type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => handleBackgroundChange(e, 'desktop')} />
              </label>
            </div>
          </div>
        </section>
      </div>
      <LocationChangeDialog
        open={showLocationDialog}
        onOpenChange={setShowLocationDialog}
        currentCountryCode={form.country_code}
        currentCity={form.location?.split(",")[0]?.trim() || ""}
        walletBalanceUsd={walletBalanceUsd}
        onSave={({ countryCode, city, state, suburb, location, currency, latitude, longitude }) => {
          setForm((f) => ({
            ...f,
            location,
            country_code: countryCode,
            currency,
            state,
            suburb,
            city,
            latitude,
            longitude,
          }));
        }}
      />
    </div>
  );
};

export default EditProfile;

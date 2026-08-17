import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BellRing,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Code2,
  CreditCard,
  DollarSign,
  ExternalLink,
  FlaskConical,
  Globe2,
  Landmark,
  LayoutDashboard,
  Loader2,
  Lock,
  MapPin,
  Megaphone,
  MessageSquare,
  Navigation,
  Package,
  Palette,
  Save,
  ScanFace,
  Search,
  Share2,
  Shield,
  ShieldCheck,
  Table2,
  ToggleRight,
  Truck,
  Users,
  UsersRound,
  Wallet,
  WalletCards,
  Waypoints,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TestUserManager from "@/components/Venue/TestUserManager";
import CameraCapture from "@/components/Camera/CameraCapture";
import VenueNotificationPreferencesPanel from "@/components/Venue/VenueNotificationPreferencesPanel";
import VenueSettingsToggle from "@/components/Venue/VenueSettingsToggle";
import { useVenueStatus } from "@/hooks/useVenueStatus";
import { useDeliverySoundEnabled, useDeliverySoundVolume } from "@/hooks/useDeliverySoundSetting";
import { useVenueModulesOptional } from "@/hooks/useVenueModules";
import { venuePresets } from "@/config/venueModules";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  defaultVenueNotificationPreferences,
  getVenueNotificationPreferences,
  saveVenueSettingsPreferences,
  VENUE_SETTINGS_PREFERENCES_KEY,
  type VenueNotificationPreferences,
} from "@/lib/venueNotificationPreferences";
import "./venue-settings.css";

type SettingsView =
  | "quick-actions"
  | "test-users"
  | "locations"
  | "notifications"
  | "security"
  | "payments"
  | "withdrawal"
  | "payout"
  | "features"
  | "interoperability";

type EntryControlPolicy = "open_entry" | "security_required" | "hybrid_entry";
type SecurityOperationMode = "always_active" | "scheduled" | "event_based";

interface WithdrawalSecurity {
  pin_hash: string | null;
  face_reference_key: string | null;
  require_face_for_withdrawal: boolean | null;
  withdrawal_daily_limit: number | null;
  withdrawal_per_tx_limit: number | null;
  face_threshold_amount: number | null;
}

interface StripeConnectStatus {
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
}

interface LocalSettings extends VenueNotificationPreferences {
  twoFactorAuthentication: boolean;
  sessionTimeout: boolean;
  acceptJvCoin: boolean;
  acceptCards: boolean;
  autoWithdrawals: boolean;
}

interface SettingsNavItem {
  id: SettingsView;
  label: string;
  icon: LucideIcon;
}

interface SettingsViewHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}

const defaultLocalSettings: LocalSettings = {
  ...defaultVenueNotificationPreferences,
  twoFactorAuthentication: true,
  sessionTimeout: false,
  acceptJvCoin: true,
  acceptCards: true,
  autoWithdrawals: false,
};

function getNotificationPreferences(
  settings: LocalSettings,
  soundAlerts: boolean,
  notificationVolume: number,
): VenueNotificationPreferences {
  return {
    notificationsEnabled: settings.notificationsEnabled,
    soundAlerts,
    notificationVolume,
    newOrderAlerts: settings.newOrderAlerts,
    orderUpdatesAlerts: settings.orderUpdatesAlerts,
    customerMessageAlerts: settings.customerMessageAlerts,
    salesMilestoneAlerts: settings.salesMilestoneAlerts,
    staffCheckInAlerts: settings.staffCheckInAlerts,
    lowStockWarnings: settings.lowStockWarnings,
    customerCheckInAlerts: settings.customerCheckInAlerts,
    aiWaiterAlerts: settings.aiWaiterAlerts,
    autoApproveOrders: settings.autoApproveOrders,
  };
}

const settingsNavigation: SettingsNavItem[] = [
  { id: "quick-actions", label: "Quick actions", icon: Zap },
  { id: "test-users", label: "Test users", icon: FlaskConical },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "withdrawal", label: "Withdrawal", icon: Landmark },
  { id: "payout", label: "Payout", icon: WalletCards },
  { id: "features", label: "Features", icon: ToggleRight },
  { id: "interoperability", label: "Interoperability", icon: Waypoints },
];

const legacySettingsHashAliases: Record<string, SettingsView> = {
  "security-notifications": "notifications",
};

const featureModules = [
  { key: "orders", label: "Orders", icon: Zap, description: "Accept and manage orders", alwaysOn: true },
  { key: "pos", label: "Point of Sale", icon: CreditCard, description: "POS terminal for taking payments", alwaysOn: true },
  { key: "menu", label: "Menu Management", icon: Globe2, description: "Manage your menu items", alwaysOn: true },
  { key: "kitchen", label: "Kitchen Display", icon: ChefHat, description: "Kitchen order management screen" },
  { key: "deliveries", label: "Deliveries", icon: Truck, description: "Delivery order management", warning: "Adds complexity" },
  { key: "reservations", label: "Reservations", icon: CalendarDays, description: "Table booking system" },
  { key: "tables", label: "Tables", icon: Table2, description: "Table management and check-ins" },
  { key: "floorplan", label: "Floorplan Editor", icon: LayoutDashboard, description: "Visual floor plan designer" },
  { key: "inventory", label: "Inventory", icon: Package, description: "Stock tracking and alerts" },
  { key: "staff", label: "Staff Management", icon: Users, description: "Employee schedules and permissions" },
  { key: "wallet", label: "Wallet", icon: Wallet, description: "JV Coin balance and transactions", alwaysOn: true },
  { key: "messaging", label: "Messages", icon: MessageSquare, description: "Customer messaging" },
  { key: "ai_assistant", label: "AI Assistant", icon: Bot, description: "AI-powered help and automation" },
  { key: "push_deals", label: "Push Deals", icon: Megaphone, description: "Send promotions to nearby customers", alwaysOn: true },
];

function getInitialSettingsView(): SettingsView {
  const hash = window.location.hash.slice(1);
  const normalizedHash = legacySettingsHashAliases[hash] ?? hash;
  return settingsNavigation.some((item) => item.id === normalizedHash)
    ? normalizedHash as SettingsView
    : "quick-actions";
}

function getStoredLocalSettings(): LocalSettings {
  try {
    const stored = window.localStorage.getItem(VENUE_SETTINGS_PREFERENCES_KEY);
    return stored
      ? { ...defaultLocalSettings, ...getVenueNotificationPreferences(), ...JSON.parse(stored) }
      : { ...defaultLocalSettings, ...getVenueNotificationPreferences() };
  } catch {
    return defaultLocalSettings;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isEntryControlPolicy(value: string | null): value is EntryControlPolicy {
  return value === "open_entry" || value === "security_required" || value === "hybrid_entry";
}

function isSecurityOperationMode(value: string | null): value is SecurityOperationMode {
  return value === "always_active" || value === "scheduled" || value === "event_based";
}

function SettingsViewHeader({ eyebrow, title, description, action }: SettingsViewHeaderProps) {
  return (
    <header className="venue-settings-view__header">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export default function VenueSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { enabled: deliverySoundEnabled, setEnabled: setDeliverySoundEnabled } = useDeliverySoundEnabled();
  const { volume: deliverySoundVolume, setVolume: setDeliverySoundVolume } = useDeliverySoundVolume();
  const [activeView, setActiveView] = useState<SettingsView>(getInitialSettingsView);
  const [localSettings, setLocalSettings] = useState<LocalSettings>(getStoredLocalSettings);
  const [notificationDraft, setNotificationDraft] = useState<VenueNotificationPreferences>(() =>
    getNotificationPreferences(getStoredLocalSettings(), deliverySoundEnabled, deliverySoundVolume),
  );
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [minimumEntryAge, setMinimumEntryAge] = useState("0");
  const [entryControlPolicy, setEntryControlPolicy] = useState<EntryControlPolicy>("open_entry");
  const [securityOperationMode, setSecurityOperationMode] = useState<SecurityOperationMode>("always_active");
  const [withdrawalSecurity, setWithdrawalSecurity] = useState<WithdrawalSecurity | null>(null);
  const [withdrawalSecurityLoading, setWithdrawalSecurityLoading] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [dailyLimit, setDailyLimit] = useState("10000");
  const [perTxLimit, setPerTxLimit] = useState("5000");
  const [faceThreshold, setFaceThreshold] = useState("100");
  const [connectStatus, setConnectStatus] = useState<StripeConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const modulesContext = useVenueModulesOptional();
  const venueStatus = useVenueStatus(venueId);
  const { user } = useAuth();

  useEffect(() => {
    saveVenueSettingsPreferences(localSettings);
  }, [localSettings]);

  useEffect(() => {
    const syncFromHash = () => setActiveView(getInitialSettingsView());
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const selectView = (view: SettingsView) => {
    setActiveView(view);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${view}`);
  };

  const updateLocalSetting = <Key extends keyof LocalSettings>(key: Key, value: LocalSettings[Key]) => {
    setLocalSettings((current) => ({ ...current, [key]: value }));
  };

  const resetNotificationDraft = useCallback(() => {
    setNotificationDraft(getNotificationPreferences(localSettings, deliverySoundEnabled, deliverySoundVolume));
  }, [deliverySoundEnabled, deliverySoundVolume, localSettings]);

  useEffect(() => {
    if (activeView === "notifications") resetNotificationDraft();
  }, [activeView, resetNotificationDraft]);

  const handleSaveNotificationPreferences = () => {
    const { soundAlerts, notificationVolume, ...preferences } = notificationDraft;
    setLocalSettings((current) => ({ ...current, ...preferences, soundAlerts, notificationVolume }));
    setDeliverySoundEnabled(soundAlerts);
    setDeliverySoundVolume(notificationVolume);
    toast.success("Notification settings saved.");
  };

  const loadWithdrawalSecurity = useCallback(async () => {
    if (!venueId || !user?.id) return;
    const { data } = await supabase
      .from("venue_owner_security")
      .select("*")
      .eq("venue_id", venueId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (data) {
      setWithdrawalSecurity(data);
      setDailyLimit(String(data.withdrawal_daily_limit || 10000));
      setPerTxLimit(String(data.withdrawal_per_tx_limit || 5000));
      setFaceThreshold(String(data.face_threshold_amount || 100));
    }
  }, [user?.id, venueId]);

  const loadConnectStatus = useCallback(async () => {
    if (!venueId) return;
    const { data } = await supabase
      .from("venues")
      .select("stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled")
      .eq("id", venueId)
      .single();
    if (data) setConnectStatus(data);
  }, [venueId]);

  useEffect(() => {
    void loadWithdrawalSecurity();
    void loadConnectStatus();
  }, [loadConnectStatus, loadWithdrawalSecurity]);

  const handleSetupWithdrawalPin = async () => {
    if (!venueId || !user?.id) return;
    if (newPin.length !== 6 || newPin !== confirmPin) {
      toast.error(newPin.length !== 6 ? "PIN must be 6 digits" : "PINs do not match");
      return;
    }

    setWithdrawalSecurityLoading(true);
    try {
      const { error } = await supabase.functions.invoke("verify-owner-withdrawal", {
        body: { action: "setup_pin", venue_id: venueId, pin: newPin },
      });
      if (error) throw error;
      toast.success("Withdrawal PIN set");
      setShowPinSetup(false);
      setNewPin("");
      setConfirmPin("");
      await loadWithdrawalSecurity();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to set PIN"));
    } finally {
      setWithdrawalSecurityLoading(false);
    }
  };

  const handleSaveWithdrawalLimits = async () => {
    if (!venueId || !user?.id) return;
    setWithdrawalSecurityLoading(true);
    try {
      const { error } = await supabase.from("venue_owner_security").upsert({
        venue_id: venueId,
        owner_id: user.id,
        withdrawal_daily_limit: parseFloat(dailyLimit) || 10000,
        withdrawal_per_tx_limit: parseFloat(perTxLimit) || 5000,
        face_threshold_amount: parseFloat(faceThreshold) || 100,
        updated_at: new Date().toISOString(),
      }, { onConflict: "venue_id,owner_id" });
      if (error) throw error;
      toast.success("Withdrawal limits updated");
      await loadWithdrawalSecurity();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save withdrawal limits"));
    } finally {
      setWithdrawalSecurityLoading(false);
    }
  };

  const handleToggleFaceWithdrawal = async (checked: boolean) => {
    if (!venueId || !user?.id) return;
    setWithdrawalSecurityLoading(true);
    try {
      const { error } = await supabase.from("venue_owner_security").upsert({
        venue_id: venueId,
        owner_id: user.id,
        require_face_for_withdrawal: checked,
        updated_at: new Date().toISOString(),
      }, { onConflict: "venue_id,owner_id" });
      if (error) throw error;
      setWithdrawalSecurity((current) => ({
        pin_hash: current?.pin_hash ?? null,
        face_reference_key: current?.face_reference_key ?? null,
        withdrawal_daily_limit: current?.withdrawal_daily_limit ?? null,
        withdrawal_per_tx_limit: current?.withdrawal_per_tx_limit ?? null,
        face_threshold_amount: current?.face_threshold_amount ?? null,
        require_face_for_withdrawal: checked,
      }));
      toast.success(checked ? "Face ID enabled for large withdrawals" : "Face ID disabled for withdrawals");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update withdrawal security"));
    } finally {
      setWithdrawalSecurityLoading(false);
    }
  };

  const handleFaceEnrollCapture = async (imageData: string) => {
    if (!venueId || !user?.id) return;
    setShowFaceEnroll(false);
    setWithdrawalSecurityLoading(true);
    try {
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
      const { error } = await supabase.functions.invoke("verify-owner-withdrawal", {
        body: { action: "enroll_face", venue_id: venueId, face_image_base64: base64 },
      });
      if (error) throw error;
      toast.success("Face enrolled for withdrawal verification");
      await loadWithdrawalSecurity();
    } catch (error) {
      toast.error(getErrorMessage(error, "Face enrollment failed"));
    } finally {
      setWithdrawalSecurityLoading(false);
    }
  };

  const handleConnectOnboard = async () => {
    if (!venueId) return;
    setConnectLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("connect-onboard", {
        body: { venue_id: venueId, account_type: "venue" },
      });
      if (error) throw error;
      if (data?.onboarding_url) window.location.assign(data.onboarding_url);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to start payout onboarding"));
    } finally {
      setConnectLoading(false);
    }
  };

  const handleConnectRefresh = useCallback(async () => {
    if (!venueId) return;
    setConnectLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("connect-refresh", {
        body: { action: "status", venue_id: venueId, account_type: "venue" },
      });
      if (error) throw error;
      setConnectStatus((current) => ({
        stripe_account_id: current?.stripe_account_id ?? null,
        stripe_onboarding_complete: data?.details_submitted ?? false,
        stripe_charges_enabled: data?.charges_enabled ?? false,
        stripe_payouts_enabled: data?.payouts_enabled ?? false,
      }));
      toast.success("Payout status refreshed");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to refresh payout status"));
    } finally {
      setConnectLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    const stripeState = searchParams.get("stripe");
    if (!stripeState || !venueId) return;

    void handleConnectRefresh();
    if (stripeState === "complete") toast.success("Stripe onboarding completed. Status updated.");
    if (stripeState === "refresh") toast.info("Continue Stripe onboarding to enable payouts.");

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("stripe");
      return next;
    }, { replace: true });
  }, [handleConnectRefresh, searchParams, setSearchParams, venueId]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        setLatitude(lat.toString());
        setLongitude(lng.toString());

        try {
          const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
          if (mapboxToken) {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&limit=1`,
            );
            const data = await response.json();
            if (data.features?.[0]?.place_name) setAddress(data.features[0].place_name);
          }
          toast.success("Location detected");
        } catch (error) {
          console.error("Reverse geocoding error:", error);
          toast.success("Coordinates set");
        } finally {
          setGettingLocation(false);
        }
      },
      (error) => {
        setGettingLocation(false);
        console.error("Geolocation error:", error);
        toast.error("Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    const storedVenueId = localStorage.getItem("jv_current_venue_id");
    if (!storedVenueId) return;

    setVenueId(storedVenueId);
    supabase
      .from("venues")
      .select("address, latitude, longitude, minimum_entry_age, entry_control_policy, security_operation_mode")
      .eq("id", storedVenueId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setAddress(data.address || "");
        setLatitude(data.latitude?.toString() || "");
        setLongitude(data.longitude?.toString() || "");
        setMinimumEntryAge(String(data.minimum_entry_age ?? 0));
        if (isEntryControlPolicy(data.entry_control_policy)) setEntryControlPolicy(data.entry_control_policy);
        if (isSecurityOperationMode(data.security_operation_mode)) setSecurityOperationMode(data.security_operation_mode);
      });
  }, []);

  const handleGeocode = async () => {
    if (!address.trim()) {
      toast.error("Please enter an address");
      return;
    }

    setGeocoding(true);
    try {
      const { data, error } = await supabase.functions.invoke("geocode-address", { body: { address: address.trim() } });
      if (error) throw error;
      if (data?.latitude && data?.longitude) {
        setLatitude(data.latitude.toString());
        setLongitude(data.longitude.toString());
        toast.success("Location found");
      } else {
        toast.error("Could not find coordinates for this address");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast.error("Failed to geocode address");
    } finally {
      setGeocoding(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!venueId) {
      toast.error("No venue selected");
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Please enter valid coordinates");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("venues")
        .update({ address: address.trim() || null, latitude: lat, longitude: lng })
        .eq("id", venueId)
        .select("address, latitude, longitude")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Update failed - you may not have permission to edit this venue");

      setAddress(data.address || "");
      setLatitude(data.latitude?.toString() || "");
      setLongitude(data.longitude?.toString() || "");
      toast.success("Location updated successfully");
      setLocationDialogOpen(false);
    } catch (error) {
      console.error("Save location error:", error);
      toast.error(getErrorMessage(error, "Failed to save location"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEntryPolicy = async () => {
    if (!venueId) {
      toast.error("No venue selected");
      return;
    }

    const parsedAge = parseInt(minimumEntryAge, 10);
    if (Number.isNaN(parsedAge) || parsedAge < 0 || parsedAge > 30) {
      toast.error("Minimum entry age must be between 0 and 30");
      return;
    }

    setPolicySaving(true);
    try {
      const updateData = {
        minimum_entry_age: parsedAge,
        entry_control_policy: entryControlPolicy,
        security_operation_mode: entryControlPolicy === "open_entry" ? null : securityOperationMode,
      };
      const { error } = await supabase.from("venues").update(updateData).eq("id", venueId);
      if (error) throw error;
      toast.success("Entry policy updated");
    } catch (error) {
      console.error("Failed to save entry policy:", error);
      toast.error(getErrorMessage(error, "Failed to save entry policy"));
    } finally {
      setPolicySaving(false);
    }
  };

  const activeNavigationItem = useMemo(
    () => settingsNavigation.find((item) => item.id === activeView),
    [activeView],
  );

  if (showFaceEnroll) {
    return <CameraCapture onCapture={handleFaceEnrollCapture} onClose={() => setShowFaceEnroll(false)} title="Enroll Face for Withdrawals" instruction="Look straight at the camera with good lighting" facingMode="user" overlay="face" />;
  }

  return (
    <div className="venue-settings-page" id="test-users">
      <header className="venue-settings-heading">
        <div>
          <h1>Settings</h1>
          <p>Manage venue preferences, access, payments, and workspace tools.</p>
        </div>
      </header>

      <div className="venue-settings-layout">
        <aside className="venue-settings-sidebar" aria-label="Settings navigation">
          <p>VENUE SETTINGS</p>
          <nav>
            {settingsNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeView;
              return (
                <button
                  key={item.id}
                  className={`venue-settings-nav__item${isActive ? " venue-settings-nav__item--active" : ""}`}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => selectView(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.id === "test-users" && !venueStatus.loading && <b>{venueStatus.testUserCount}</b>}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="venue-settings-content" aria-live="polite" aria-label={`${activeNavigationItem?.label || "Settings"} settings`}>
          {activeView === "quick-actions" && (
            <section className="venue-settings-view">
              <SettingsViewHeader eyebrow="WORKSPACE" title="Quick actions" description="Shortcuts for the venue tasks you use most." />
              <div className="venue-settings-quick-actions">
                <button type="button" onClick={() => navigate("/venue/assign")}><UsersRound aria-hidden="true" /><span>Manage staff</span><small>Invite and update team access</small></button>
                <button type="button" disabled><Palette aria-hidden="true" /><span>Customize theme</span><small>Adjust your venue appearance</small></button>
                <button type="button" disabled><Globe2 aria-hidden="true" /><span>Public profile</span><small>Preview guest-facing details</small></button>
                <button type="button" onClick={() => selectView("payout")}><CreditCard aria-hidden="true" /><span>Billing</span><small>Manage payout details</small></button>
              </div>
            </section>
          )}

          {activeView === "test-users" && (
            <section className="venue-settings-view">
              <SettingsViewHeader
                eyebrow="TESTING MODE"
                title="Test users"
                description="Invite up to 10 people to test your venue. Each tester receives $2,500 in sandbox funds."
                action={<span className="venue-settings-count">{venueStatus.testUserCount} of {venueStatus.maxTestUsers}</span>}
              />
              {venueId ? <div className="venue-settings-test-users"><TestUserManager venueId={venueId} /></div> : <p className="venue-settings-empty">Venue context is unavailable for test users.</p>}
            </section>
          )}

          {activeView === "locations" && (
            <section className="venue-settings-view">
              <SettingsViewHeader eyebrow="VENUE DETAILS" title="Locations" description="Keep your venue address and service area accurate for guests and delivery partners." />
              <div className="venue-settings-location-summary">
                <span><MapPin aria-hidden="true" /></span>
                <div><strong>{address || "Venue location not set"}</strong><small>{latitude && longitude ? `${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}` : "Customers will not be able to check in until coordinates are set."}</small></div>
                <button className="venue-settings-button venue-settings-button--secondary" type="button" onClick={() => setLocationDialogOpen(true)}>Set location</button>
              </div>
            </section>
          )}

          {activeView === "notifications" && (
            <section className="venue-settings-view">
              <SettingsViewHeader eyebrow="ALERT PREFERENCES" title="Notifications" description="Choose the operational alerts your venue team should receive." />
              <VenueNotificationPreferencesPanel
                value={notificationDraft}
                onChange={setNotificationDraft}
                onSave={handleSaveNotificationPreferences}
                onCancel={resetNotificationDraft}
              />
            </section>
          )}

          {activeView === "security" && (
            <section className="venue-settings-view">
              <SettingsViewHeader eyebrow="ACCOUNT PROTECTION" title="Security" description="Protect staff access and control entry policies for your venue." />
              <div className="venue-settings-list">
                <VenueSettingsToggle label="Two-factor authentication" description="Add an extra layer of security" checked={localSettings.twoFactorAuthentication} onCheckedChange={(value) => updateLocalSetting("twoFactorAuthentication", value)} icon={Shield} />
                <VenueSettingsToggle label="Session timeout" description="Automatically sign out after 30 minutes of inactivity" checked={localSettings.sessionTimeout} onCheckedChange={(value) => updateLocalSetting("sessionTimeout", value)} icon={Lock} />
              </div>
              <div className="venue-settings-subsection">
                <h3>Entry policy</h3>
                <p>Configure age and entry-control policy for your venue.</p>
                <div className="venue-settings-form venue-settings-form--two-column">
                  <label><span>Minimum entry age</span><select value={minimumEntryAge} onChange={(event) => setMinimumEntryAge(event.target.value)}><option value="0">None / All Ages</option><option value="16">16+</option><option value="18">18+</option><option value="21">21+</option></select></label>
                  <label><span>Entry control policy</span><select value={entryControlPolicy} onChange={(event) => setEntryControlPolicy(event.target.value as EntryControlPolicy)}><option value="open_entry">No security required</option><option value="security_required">Security required</option><option value="hybrid_entry">Sometimes / hybrid</option></select></label>
                  {entryControlPolicy !== "open_entry" && <label><span>When is security active?</span><select value={securityOperationMode} onChange={(event) => setSecurityOperationMode(event.target.value as SecurityOperationMode)}><option value="always_active">Always</option><option value="scheduled">Only certain times</option><option value="event_based">Event based</option></select></label>}
                  <button className="venue-settings-button venue-settings-button--primary" type="button" onClick={() => void handleSaveEntryPolicy()} disabled={policySaving}>{policySaving && <Loader2 className="venue-settings-spin" aria-hidden="true" />}<span>Save entry policy</span></button>
                </div>
              </div>
            </section>
          )}

          {activeView === "payments" && (
            <section className="venue-settings-view">
              <SettingsViewHeader eyebrow="CUSTOMER PAYMENTS" title="Payments" description="Control which payment methods customers can use at your venue." />
              <div className="venue-settings-list">
                <VenueSettingsToggle label="Accept JV Coin" description="Allow customers to pay with JV Coin" checked={localSettings.acceptJvCoin} onCheckedChange={(value) => updateLocalSetting("acceptJvCoin", value)} icon={Wallet} />
                <VenueSettingsToggle label="Accept cards" description="Allow card payments via Stripe" checked={localSettings.acceptCards} onCheckedChange={(value) => updateLocalSetting("acceptCards", value)} icon={CreditCard} />
                <VenueSettingsToggle label="Auto-withdrawals" description="Automatically withdraw to your bank daily" checked={localSettings.autoWithdrawals} onCheckedChange={(value) => updateLocalSetting("autoWithdrawals", value)} icon={DollarSign} />
              </div>
            </section>
          )}

          {activeView === "withdrawal" && (
            <section className="venue-settings-view">
              <SettingsViewHeader
                eyebrow="WITHDRAWAL PROTECTION"
                title="Withdrawal security"
                description="Set limits and approval requirements before funds leave your venue balance."
                action={<button className="venue-settings-button venue-settings-button--secondary" type="button" onClick={() => setShowPinSetup((open) => !open)}>{withdrawalSecurity?.pin_hash ? "Change PIN" : "Set up PIN"}</button>}
              />
              <div className="venue-settings-list venue-settings-list--compact">
                <VenueSettingsToggle label="Require Face ID for large withdrawals" description={withdrawalSecurity?.face_reference_key ? "Face ID is enrolled" : "Face ID is not enrolled"} checked={withdrawalSecurity?.require_face_for_withdrawal || false} onCheckedChange={(value) => void handleToggleFaceWithdrawal(value)} disabled={withdrawalSecurityLoading} icon={ScanFace} />
              </div>
              {showPinSetup && (
                <div className="venue-settings-pin-form">
                  <label><span>New 6-digit PIN</span><input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
                  <label><span>Confirm PIN</span><input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
                  <div><button className="venue-settings-button venue-settings-button--primary" type="button" onClick={() => void handleSetupWithdrawalPin()} disabled={withdrawalSecurityLoading}>Save PIN</button><button className="venue-settings-button venue-settings-button--secondary" type="button" onClick={() => { setShowPinSetup(false); setNewPin(""); setConfirmPin(""); }}>Cancel</button></div>
                </div>
              )}
              {!withdrawalSecurity?.face_reference_key && <button className="venue-settings-button venue-settings-button--secondary venue-settings-wide-action" type="button" onClick={() => setShowFaceEnroll(true)}><ScanFace aria-hidden="true" /><span>Enroll Face for Withdrawals</span></button>}
              <div className="venue-settings-form venue-settings-form--three-column">
                <label><span>Face ID threshold ($)</span><input type="number" value={faceThreshold} onChange={(event) => setFaceThreshold(event.target.value)} /></label>
                <label><span>Daily limit ($)</span><input type="number" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} /></label>
                <label><span>Per-transaction limit ($)</span><input type="number" value={perTxLimit} onChange={(event) => setPerTxLimit(event.target.value)} /></label>
                <button className="venue-settings-button venue-settings-button--primary" type="button" onClick={() => void handleSaveWithdrawalLimits()} disabled={withdrawalSecurityLoading}>{withdrawalSecurityLoading && <Loader2 className="venue-settings-spin" aria-hidden="true" />}<Save aria-hidden="true" /><span>Save limits</span></button>
              </div>
            </section>
          )}

          {activeView === "payout" && (
            <section className="venue-settings-view">
              <SettingsViewHeader eyebrow="PAYOUTS" title="Payout account" description="Connect a bank account to receive real payouts when you withdraw funds." />
              {!connectStatus?.stripe_account_id ? (
                <div className="venue-settings-payout-empty"><div><Landmark aria-hidden="true" /></div><h3>No payout account connected</h3><p>Securely connect a bank account to enable payouts from your venue balance.</p><button className="venue-settings-button venue-settings-button--primary" type="button" onClick={() => void handleConnectOnboard()} disabled={connectLoading}>{connectLoading ? <Loader2 className="venue-settings-spin" aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}<span>Set up payout account</span></button></div>
              ) : !connectStatus.stripe_payouts_enabled ? (
                <div className="venue-settings-payout-empty"><div><Loader2 className="venue-settings-spin" aria-hidden="true" /></div><h3>Onboarding incomplete</h3><p>Complete your payout account setup to receive withdrawals.</p><div><button className="venue-settings-button venue-settings-button--primary" type="button" onClick={() => void handleConnectOnboard()} disabled={connectLoading}><ExternalLink aria-hidden="true" /><span>Complete setup</span></button><button className="venue-settings-button venue-settings-button--secondary" type="button" onClick={() => void handleConnectRefresh()} disabled={connectLoading}>Refresh status</button></div></div>
              ) : (
                <div className="venue-settings-payout-empty"><div><CheckCircle2 aria-hidden="true" /></div><h3>Payouts enabled</h3><p>Your payout account is connected. Withdrawals will be sent directly to your bank.</p><button className="venue-settings-button venue-settings-button--secondary" type="button" onClick={() => void handleConnectRefresh()} disabled={connectLoading}>Refresh status</button></div>
              )}
            </section>
          )}

          {activeView === "features" && (
            <section className="venue-settings-view">
              <SettingsViewHeader eyebrow="WORKSPACE TOOLS" title="Features" description="Enable the features your venue needs. Changes take effect immediately." action={<span className="venue-settings-plan">{modulesContext && !modulesContext.loading ? venuePresets[modulesContext.preset]?.name || "Full Suite" : "Loading"}</span>} />
              {modulesContext && !modulesContext.loading ? (
                <div className="venue-settings-feature-list">
                  {featureModules.map((feature) => {
                    const Icon = feature.icon;
                    const isEnabled = feature.alwaysOn || modulesContext.isModuleEnabled(feature.key);
                    return <VenueSettingsToggle key={feature.key} label={feature.label} description={feature.warning ? `${feature.description}. ${feature.warning}` : feature.description} checked={isEnabled} disabled={feature.alwaysOn} icon={Icon} onCheckedChange={async (checked) => {
                      try {
                        if (checked) await modulesContext.enableModule(feature.key);
                        else await modulesContext.disableModule(feature.key);
                        if (feature.key === "deliveries" && venueId) await supabase.from("venues").update({ delivery_enabled: checked }).eq("id", venueId);
                        if (feature.key === "reservations" && venueId) await supabase.from("venues").update({ reservations_enabled: checked }).eq("id", venueId);
                        toast.success(`${feature.label} ${checked ? "enabled" : "disabled"}`);
                      } catch (error) {
                        console.error("Failed to update feature:", error);
                        toast.error("Failed to update feature");
                      }
                    }} />;
                  })}
                </div>
              ) : <p className="venue-settings-empty">Loading feature configuration...</p>}
            </section>
          )}

          {activeView === "interoperability" && (
            <section className="venue-settings-view">
              <SettingsViewHeader eyebrow="CONNECTED SYSTEMS" title="Interoperability" description="Connect the tools your venue uses to keep order, payment, and guest data in sync." />
              <div className="venue-settings-integrations">
                <article><span><Webhook aria-hidden="true" /></span><div><strong>Webhooks</strong><small>Send real-time venue events to your systems</small></div><button className="venue-settings-button venue-settings-button--secondary" type="button" disabled>Configure</button></article>
                <article><span><Code2 aria-hidden="true" /></span><div><strong>API access</strong><small>Create credentials for approved venue integrations</small></div><button className="venue-settings-button venue-settings-button--secondary" type="button" disabled>Manage</button></article>
                <article><span><Share2 aria-hidden="true" /></span><div><strong>Partner connections</strong><small>Review connected delivery and reservation partners</small></div><button className="venue-settings-button venue-settings-button--secondary" type="button" disabled>View partners</button></article>
              </div>
            </section>
          )}
        </main>
      </div>

      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="venue-dialog-surface venue-settings-modal">
          <DialogHeader>
            <DialogTitle>Set venue location</DialogTitle>
            <DialogDescription>Enter your address to auto-detect coordinates, or manually enter latitude and longitude.</DialogDescription>
          </DialogHeader>
          <div className="venue-settings-location-form">
            <button className="venue-settings-button venue-settings-button--secondary venue-settings-wide-action" type="button" onClick={handleUseCurrentLocation} disabled={gettingLocation}>{gettingLocation ? <Loader2 className="venue-settings-spin" aria-hidden="true" /> : <Navigation aria-hidden="true" />}<span>Use my current location</span></button>
            <label><span>Address</span><div><input placeholder="123 Main St, City, Country" value={address} onChange={(event) => setAddress(event.target.value)} /><button className="venue-settings-button venue-settings-button--secondary" type="button" onClick={() => void handleGeocode()} disabled={geocoding}>{geocoding ? <Loader2 className="venue-settings-spin" aria-hidden="true" /> : "Lookup"}</button></div></label>
            <div className="venue-settings-form venue-settings-form--two-column"><label><span>Latitude</span><input placeholder="-27.4698" value={latitude} onChange={(event) => setLatitude(event.target.value)} type="number" step="any" /></label><label><span>Longitude</span><input placeholder="153.0251" value={longitude} onChange={(event) => setLongitude(event.target.value)} type="number" step="any" /></label></div>
          </div>
          <div className="venue-settings-modal__actions"><button className="venue-settings-button venue-settings-button--secondary" type="button" onClick={() => setLocationDialogOpen(false)}>Cancel</button><button className="venue-settings-button venue-settings-button--primary" type="button" onClick={() => void handleSaveLocation()} disabled={saving}>{saving && <Loader2 className="venue-settings-spin" aria-hidden="true" />}<span>Save location</span></button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

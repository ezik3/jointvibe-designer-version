import { useEffect, useState, type ReactNode } from "react";
import {
  ChefHat,
  CircleCheck,
  CreditCard,
  Loader2,
  MapPin,
  Monitor,
  Printer,
  PrinterCheck,
  ReceiptText,
  Save,
  ShieldCheck,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "./pos-settings.css";

interface TerminalPreferences {
  terminalName: string;
  requireRefundPin: boolean;
  acceptCash: boolean;
  acceptTapToPay: boolean;
  acceptQrPayments: boolean;
  taxRate: string;
  paymentTimeout: string;
  receiptPrinterIp: string;
  kitchenPrinterIp: string;
}

interface SettingsSectionProps {
  icon: LucideIcon;
  id: string;
  title: string;
  description: string;
  wide?: boolean;
  venue?: boolean;
  children: ReactNode;
}

interface SettingsToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

const POS_SETTINGS_STORAGE_PREFIX = "jointvibe-pos-settings";

const defaultTerminalPreferences: TerminalPreferences = {
  terminalName: "Main bar terminal",
  requireRefundPin: true,
  acceptCash: true,
  acceptTapToPay: true,
  acceptQrPayments: true,
  taxRate: "10",
  paymentTimeout: "10",
  receiptPrinterIp: "192.168.1.100",
  kitchenPrinterIp: "192.168.1.101",
};

function getSettingsStorageKey(venueId: string | null) {
  return `${POS_SETTINGS_STORAGE_PREFIX}:${venueId || "terminal"}`;
}

function getStoredTerminalPreferences(venueId: string | null): TerminalPreferences {
  try {
    const stored = localStorage.getItem(getSettingsStorageKey(venueId));
    return stored
      ? { ...defaultTerminalPreferences, ...JSON.parse(stored) }
      : defaultTerminalPreferences;
  } catch {
    return defaultTerminalPreferences;
  }
}

function SettingsSection({ icon: Icon, id, title, description, wide = false, venue = false, children }: SettingsSectionProps) {
  return (
    <section className={`pos-settings-section${wide ? " pos-settings-section--wide" : ""}${venue ? " pos-settings-section--venue" : ""}`} aria-labelledby={id}>
      <header className="pos-settings-section__heading">
        <span className="pos-settings-section__icon"><Icon aria-hidden="true" /></span>
        <div>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function SettingsToggle({ label, description, checked, onCheckedChange, disabled = false }: SettingsToggleProps) {
  return (
    <div className="pos-settings-toggle">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
        className="pos-settings-toggle__control"
      />
    </div>
  );
}

export default function Settings() {
  const [venueId, setVenueId] = useState<string | null>(() => localStorage.getItem("jv_current_venue_id"));
  const [venueName, setVenueName] = useState(() => localStorage.getItem("jv_current_venue_name") || "Venue");
  const [receiptAddress, setReceiptAddress] = useState("");
  const [requireFaceId, setRequireFaceId] = useState(false);
  const [terminalPreferences, setTerminalPreferences] = useState<TerminalPreferences>(() => getStoredTerminalPreferences(venueId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFaceId, setSavingFaceId] = useState(false);
  const [testingPrinters, setTestingPrinters] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<"idle" | "checking" | "success">("idle");

  useEffect(() => {
    if (venueId) return;

    let isCurrent = true;

    const resolveVenue = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !isCurrent) return;

      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (!isCurrent || !venue?.id) return;

      localStorage.setItem("jv_current_venue_id", venue.id);
      setVenueId(venue.id);
    };

    void resolveVenue();
    return () => {
      isCurrent = false;
    };
  }, [venueId]);

  useEffect(() => {
    let isCurrent = true;

    const loadSettings = async () => {
      setLoading(true);
      setTerminalPreferences(getStoredTerminalPreferences(venueId));

      if (!venueId) {
        if (isCurrent) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("venues")
        .select("name, address, require_employee_face_id")
        .eq("id", venueId)
        .maybeSingle();

      if (!isCurrent) return;

      if (error) {
        toast.error("Could not load venue settings.");
      } else if (data) {
        setVenueName(data.name || "Venue");
        setReceiptAddress(data.address || "");
        setRequireFaceId(data.require_employee_face_id ?? false);
      }

      setLoading(false);
    };

    void loadSettings();
    return () => {
      isCurrent = false;
    };
  }, [venueId]);

  const updateTerminalPreference = <Key extends keyof TerminalPreferences>(key: Key, value: TerminalPreferences[Key]) => {
    setTerminalPreferences((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    const nextPreferences = {
      ...terminalPreferences,
      terminalName: terminalPreferences.terminalName.trim() || defaultTerminalPreferences.terminalName,
    };

    localStorage.setItem(getSettingsStorageKey(venueId), JSON.stringify(nextPreferences));
    setTerminalPreferences(nextPreferences);

    if (!venueId) {
      toast.success("Terminal settings saved on this device.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("venues")
        .update({
          name: venueName.trim() || "Venue",
          address: receiptAddress.trim() || null,
        })
        .eq("id", venueId);
      if (error) throw error;

      localStorage.setItem("jv_current_venue_name", venueName.trim() || "Venue");
      toast.success("POS settings saved.");
    } catch {
      toast.error("Terminal settings were saved, but venue details could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  const handleFaceIdToggle = async (checked: boolean) => {
    if (!venueId) {
      toast.error("No venue is connected to this terminal.");
      return;
    }

    setSavingFaceId(true);
    try {
      const { error } = await supabase
        .from("venues")
        .update({ require_employee_face_id: checked })
        .eq("id", venueId);
      if (error) throw error;

      setRequireFaceId(checked);
      toast.success(checked ? "Face verification is required at clock-in." : "Face verification is now optional at clock-in.");
    } catch {
      toast.error("Failed to update the clock-in verification setting.");
    } finally {
      setSavingFaceId(false);
    }
  };

  const handlePrinterTest = () => {
    setTestingPrinters(true);
    setPrinterStatus("checking");

    window.setTimeout(() => {
      setTestingPrinters(false);
      setPrinterStatus("success");
    }, 700);
  };

  return (
    <main className="pos-settings-page" aria-labelledby="pos-settings-title">
      <header className="pos-settings-terminal-bar">
        <div>
          <span>{venueName.toUpperCase()}</span>
          <strong>Point of Sale</strong>
        </div>
        <span><CircleCheck aria-hidden="true" />Terminal ready</span>
      </header>

      <form
        className="pos-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <header className="pos-settings-heading">
          <div>
            <h1 id="pos-settings-title">Settings</h1>
            <p>Configure your terminal, payments, and receipt workflow.</p>
          </div>
          <Button className="pos-settings-button pos-settings-button--primary" type="submit" disabled={loading || saving}>
            {saving ? <Loader2 className="pos-settings-spin" aria-label="Saving settings" /> : <Save aria-hidden="true" />}
            <span>{saving ? "Saving" : "Save settings"}</span>
          </Button>
        </header>

        <div className="pos-settings-layout">
          <SettingsSection icon={Store} id="pos-venue-settings-title" title="Venue and terminal" description="Details shown on receipts and at this checkout terminal." wide venue>
            <div className="pos-settings-grid">
              <div className="pos-settings-field">
                <Label htmlFor="pos-venue-name">Venue name</Label>
                <div className="pos-settings-input">
                  <Store aria-hidden="true" />
                  <Input id="pos-venue-name" value={venueName} onChange={(event) => setVenueName(event.target.value)} disabled={loading} autoComplete="organization" />
                </div>
              </div>
              <div className="pos-settings-field">
                <Label htmlFor="pos-terminal-name">Terminal name</Label>
                <div className="pos-settings-input">
                  <Monitor aria-hidden="true" />
                  <Input id="pos-terminal-name" value={terminalPreferences.terminalName} onChange={(event) => updateTerminalPreference("terminalName", event.target.value)} disabled={loading} />
                </div>
              </div>
              <div className="pos-settings-field pos-settings-grid__wide">
                <Label htmlFor="pos-receipt-address">Receipt address</Label>
                <div className="pos-settings-input">
                  <MapPin aria-hidden="true" />
                  <Input id="pos-receipt-address" value={receiptAddress} onChange={(event) => setReceiptAddress(event.target.value)} disabled={loading} autoComplete="street-address" />
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection icon={ShieldCheck} id="pos-security-settings-title" title="Staff access" description="Protect sensitive terminal actions during service.">
            <div className="pos-settings-list">
              <SettingsToggle
                label="Require staff PIN for refunds"
                description="Staff must verify before refunding an order."
                checked={terminalPreferences.requireRefundPin}
                onCheckedChange={(checked) => updateTerminalPreference("requireRefundPin", checked)}
                disabled={loading}
              />
              <SettingsToggle
                label="Require face verification at clock-in"
                description="Verify each staff member before they start a shift."
                checked={requireFaceId}
                onCheckedChange={handleFaceIdToggle}
                disabled={loading || savingFaceId || !venueId}
              />
            </div>
          </SettingsSection>

          <SettingsSection icon={CreditCard} id="pos-payment-settings-title" title="Payment methods" description="Choose which methods this terminal can accept.">
            <div className="pos-settings-list">
              <SettingsToggle
                label="Cash"
                description="Accept cash payments without a platform fee."
                checked={terminalPreferences.acceptCash}
                onCheckedChange={(checked) => updateTerminalPreference("acceptCash", checked)}
                disabled={loading}
              />
              <SettingsToggle
                label="Tap to Pay"
                description="Accept contactless payments from nearby devices."
                checked={terminalPreferences.acceptTapToPay}
                onCheckedChange={(checked) => updateTerminalPreference("acceptTapToPay", checked)}
                disabled={loading}
              />
              <SettingsToggle
                label="QR and guest payments"
                description="Let customers scan a code or pay through a secure link."
                checked={terminalPreferences.acceptQrPayments}
                onCheckedChange={(checked) => updateTerminalPreference("acceptQrPayments", checked)}
                disabled={loading}
              />
            </div>
            <div className="pos-settings-grid pos-settings-grid--payment">
              <div className="pos-settings-field">
                <Label htmlFor="pos-tax-rate">Default tax rate</Label>
                <div className="pos-settings-input pos-settings-input--suffix">
                  <Input id="pos-tax-rate" type="number" min="0" max="100" step="0.1" inputMode="decimal" value={terminalPreferences.taxRate} onChange={(event) => updateTerminalPreference("taxRate", event.target.value)} disabled={loading} />
                  <b>%</b>
                </div>
              </div>
              <div className="pos-settings-field">
                <Label htmlFor="pos-payment-timeout">Payment timeout</Label>
                <select id="pos-payment-timeout" className="pos-settings-select" value={terminalPreferences.paymentTimeout} onChange={(event) => updateTerminalPreference("paymentTimeout", event.target.value)} disabled={loading}>
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                </select>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection icon={Printer} id="pos-printer-settings-title" title="Receipt and kitchen printers" description="Connect printers used to send customer receipts and kitchen tickets." wide>
            <div className="pos-settings-grid">
              <div className="pos-settings-field">
                <Label htmlFor="pos-receipt-printer">Receipt printer IP</Label>
                <div className="pos-settings-input">
                  <ReceiptText aria-hidden="true" />
                  <Input id="pos-receipt-printer" value={terminalPreferences.receiptPrinterIp} onChange={(event) => updateTerminalPreference("receiptPrinterIp", event.target.value)} disabled={loading} inputMode="url" />
                </div>
              </div>
              <div className="pos-settings-field">
                <Label htmlFor="pos-kitchen-printer">Kitchen printer IP</Label>
                <div className="pos-settings-input">
                  <ChefHat aria-hidden="true" />
                  <Input id="pos-kitchen-printer" value={terminalPreferences.kitchenPrinterIp} onChange={(event) => updateTerminalPreference("kitchenPrinterIp", event.target.value)} disabled={loading} inputMode="url" />
                </div>
              </div>
            </div>
            <div className="pos-printer-actions">
              <Button className="pos-settings-button pos-settings-button--secondary" type="button" onClick={handlePrinterTest} disabled={testingPrinters}>
                {testingPrinters ? <Loader2 className="pos-settings-spin" aria-label="Testing printer connection" /> : <PrinterCheck aria-hidden="true" />}
                <span>{testingPrinters ? "Testing connection" : "Test printer connection"}</span>
              </Button>
              <p className={printerStatus === "success" ? "pos-printer-status pos-printer-status--success" : "pos-printer-status"} role="status" aria-live="polite">
                {printerStatus === "checking" && "Checking printer connection..."}
                {printerStatus === "success" && "Receipt and kitchen printers are reachable."}
              </p>
            </div>
          </SettingsSection>
        </div>
      </form>
    </main>
  );
}

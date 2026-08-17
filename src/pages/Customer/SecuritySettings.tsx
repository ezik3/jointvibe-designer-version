import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ShieldCheck, Lock, ScanFace, Smartphone, DollarSign, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePaymentSecurity } from "@/hooks/usePaymentSecurity";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export default function SecuritySettings() {
  const navigate = useNavigate();
  const { status, loading, checkPinStatus, changePin } = usePaymentSecurity();
  const { toast } = useToast();
  const { t } = useTranslation("common");

  const [settings, setSettings] = useState<any>(null);
  const [limits, setLimits] = useState<any>(null);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinForAction, setPinForAction] = useState('');
  const [savingLimits, setSavingLimits] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: sec } = await supabase
      .from('payment_security_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setSettings(sec);

    const { data: lim } = await supabase
      .from('transaction_limits')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setLimits(lim);
  }

  async function handleChangePin() {
    if (currentPinInput.length !== 6 || newPinInput.length !== 6) {
      toast({ title: t("status.error"), description: t("security.pinMustBeSixDigits"), variant: "destructive" });
      return;
    }
    const result = await changePin(currentPinInput, newPinInput);
    if (result.success) {
      toast({ title: t("security.pinChanged"), description: t("security.pinUpdated") });
      setChangePinOpen(false);
      setCurrentPinInput('');
      setNewPinInput('');
    } else {
      toast({ title: t("status.error"), description: result.message || t("security.failedToChangePin"), variant: "destructive" });
    }
  }

  async function handleToggleFace(enabled: boolean) {
    if (!pinForAction || pinForAction.length !== 6) {
      toast({ title: t("security.pinRequired"), description: t("security.enterPinToChangeSettings"), variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.functions.invoke('update-payment-security', {
      body: { action: enabled ? 'enable_face' : 'disable_face', pin: pinForAction },
    });
    if (error || data?.error) {
      toast({ title: t("status.error"), description: data?.message || t("security.failedToUpdate"), variant: "destructive" });
    } else {
      toast({ title: t("security.updated"), description: data?.message });
      loadSettings();
    }
    setPinForAction('');
  }

  async function handleThresholdChange(value: string) {
    if (!pinForAction || pinForAction.length !== 6) {
      toast({ title: t("security.pinRequired"), description: t("security.enterPinFirst"), variant: "destructive" });
      return;
    }
    await supabase.functions.invoke('update-payment-security', {
      body: { action: 'update_threshold', face_threshold: value, pin: pinForAction },
    });
    toast({ title: t("security.thresholdUpdated") });
    loadSettings();
    setPinForAction('');
  }

  async function handleSaveLimits() {
    if (!limits) return;
    setSavingLimits(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('transaction_limits')
        .update({
          daily_spend_limit: limits.daily_spend_limit,
          per_transaction_limit: limits.per_transaction_limit,
          daily_withdrawal_limit: limits.daily_withdrawal_limit,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      toast({ title: t("security.limitsSaved") });
    }
    setSavingLimits(false);
  }

  async function handleRemoveDevice(deviceId: string) {
    if (!pinForAction || pinForAction.length !== 6) {
      toast({ title: t("security.pinRequired"), description: t("security.enterPinFirst"), variant: "destructive" });
      return;
    }
    await supabase.functions.invoke('update-payment-security', {
      body: { action: 'remove_trusted_device', device_id: deviceId, pin: pinForAction },
    });
    toast({ title: t("security.deviceRemoved") });
    loadSettings();
    setPinForAction('');
  }

  if (loading) {
    return (
      <div className="min-h-full bg-[var(--customer-nav-canvas)] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--customer-nav-canvas)]">
      <div className="max-w-2xl mx-auto px-5 sm:px-7 py-7 sm:py-8 space-y-6">
        {/* Back */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[var(--customer-nav-muted)] hover:text-[var(--customer-nav-text)] transition-colors">
          <ArrowLeft className="w-5 h-5" /> <span className="text-sm">{t("app.back")}</span>
        </button>

        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-7 h-7 text-[var(--customer-nav-cyan)]" />
          <h1 className="text-3xl font-bold text-[var(--customer-nav-text)]">{t("security.paymentSecurity")}</h1>
        </div>

        {/* PIN Section */}
        <div className="bg-[var(--customer-nav-surface)] border border-[var(--customer-nav-line)] rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-[var(--customer-nav-cyan)]" />
            <h2 className="text-lg font-semibold text-[var(--customer-nav-text)]">{t("security.paymentPin")}</h2>
          </div>
          <p className="text-[var(--customer-nav-muted)] text-sm">{t("security.pinDescription")}</p>

          {!changePinOpen ? (
            <Button variant="outline" className="border-[var(--customer-nav-line)] bg-[var(--customer-nav-canvas)] text-[var(--customer-nav-text)] hover:bg-[var(--customer-nav-raised)]" onClick={() => setChangePinOpen(true)}>
              {t("security.changePin")}
            </Button>
          ) : (
            <div className="space-y-3">
              <Input type="password" maxLength={6} placeholder={t("security.currentPin")} value={currentPinInput}
                onChange={e => setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="bg-[var(--customer-nav-canvas)] border-[var(--customer-nav-line)]" />
              <Input type="password" maxLength={6} placeholder={t("security.newPin")} value={newPinInput}
                onChange={e => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="bg-[var(--customer-nav-canvas)] border-[var(--customer-nav-line)]" />
              <div className="flex gap-2">
                <Button onClick={handleChangePin} className="bg-[var(--customer-nav-cyan)] text-[var(--customer-nav-canvas)] hover:brightness-110">{t("app.save")}</Button>
                <Button variant="ghost" onClick={() => { setChangePinOpen(false); setCurrentPinInput(''); setNewPinInput(''); }}>{t("app.cancel")}</Button>
              </div>
            </div>
          )}
        </div>

        {/* Face Recognition Section */}
        <div className="bg-[var(--customer-nav-surface)] border border-[var(--customer-nav-line)] rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <ScanFace className="w-5 h-5 text-[var(--customer-nav-cyan)]" />
            <h2 className="text-lg font-semibold text-[var(--customer-nav-text)]">{t("security.facialRecognition")}</h2>
          </div>
          <p className="text-[var(--customer-nav-muted)] text-sm">{t("security.faceDescription")}</p>

          <div className="flex items-center justify-between">
            <Label className="text-[var(--customer-nav-text)]">{t("security.enableFaceVerification")}</Label>
            <Switch
              checked={settings?.face_enabled || false}
              onCheckedChange={(checked) => handleToggleFace(checked)}
            />
          </div>

          {settings?.face_enabled && (
            <div className="space-y-3">
              <Label className="text-[var(--customer-nav-text)] text-sm">{t("security.requireFaceScan")}</Label>
              <Select value={settings?.face_threshold || 'over_50'} onValueChange={handleThresholdChange}>
                <SelectTrigger className="bg-[var(--customer-nav-canvas)] border-[var(--customer-nav-line)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="every">{t("security.everyPayment")}</SelectItem>
                  <SelectItem value="over_50">{t("security.paymentsOver50")}</SelectItem>
                  <SelectItem value="over_100">{t("security.paymentsOver100")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* PIN for security changes */}
          <div className="pt-2 border-t border-[var(--customer-nav-line)]">
            <Label className="text-[var(--customer-nav-faint)] text-xs">{t("security.pinForChanges")}</Label>
            <Input type="password" maxLength={6} placeholder={t("security.pinPlaceholder")} value={pinForAction}
              onChange={e => setPinForAction(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="bg-[var(--customer-nav-canvas)] border-[var(--customer-nav-line)] mt-1 max-w-[200px]" />
          </div>
        </div>

        {/* Trusted Devices */}
        <div className="bg-[var(--customer-nav-surface)] border border-[var(--customer-nav-line)] rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-[var(--customer-nav-cyan)]" />
            <h2 className="text-lg font-semibold text-[var(--customer-nav-text)]">{t("security.trustedDevices")}</h2>
          </div>
          <p className="text-[var(--customer-nav-muted)] text-sm">{t("security.trustedDevicesDesc")}</p>

          {settings?.trusted_devices && settings.trusted_devices.length > 0 ? (
            <div className="space-y-2">
              {settings.trusted_devices.map((device: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-[var(--customer-nav-canvas)] rounded-sm px-4 py-3">
                  <div>
                    <p className="text-sm text-[var(--customer-nav-text)]">{device.device_name || t("security.unknownDevice")}</p>
                    <p className="text-xs text-[var(--customer-nav-faint)]">
                      {device.trusted_at ? t("security.trusted") : t("security.verificationsCount", { count: device.successful_verifications || 0 })}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveDevice(device.device_id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[var(--customer-nav-faint)] text-sm">{t("security.noTrustedDevices")}</p>
          )}
        </div>

        {/* Transaction Limits */}
        <div className="bg-[var(--customer-nav-surface)] border border-[var(--customer-nav-line)] rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-[var(--customer-nav-cyan)]" />
            <h2 className="text-lg font-semibold text-[var(--customer-nav-text)]">{t("security.transactionLimits")}</h2>
          </div>

          {limits && (
            <div className="space-y-3">
              <div>
                <Label className="text-[var(--customer-nav-muted)] text-sm">{t("security.perTransactionLimit")}</Label>
                <Input type="number" value={limits.per_transaction_limit}
                  onChange={e => setLimits({ ...limits, per_transaction_limit: Number(e.target.value) })}
                  className="bg-[var(--customer-nav-canvas)] border-[var(--customer-nav-line)] mt-1" />
              </div>
              <div>
                <Label className="text-[var(--customer-nav-muted)] text-sm">{t("security.dailySpendingLimit")}</Label>
                <Input type="number" value={limits.daily_spend_limit}
                  onChange={e => setLimits({ ...limits, daily_spend_limit: Number(e.target.value) })}
                  className="bg-[var(--customer-nav-canvas)] border-[var(--customer-nav-line)] mt-1" />
              </div>
              <div>
                <Label className="text-[var(--customer-nav-muted)] text-sm">{t("security.dailyWithdrawalLimit")}</Label>
                <Input type="number" value={limits.daily_withdrawal_limit}
                  onChange={e => setLimits({ ...limits, daily_withdrawal_limit: Number(e.target.value) })}
                  className="bg-[var(--customer-nav-canvas)] border-[var(--customer-nav-line)] mt-1" />
              </div>
              <Button onClick={handleSaveLimits} disabled={savingLimits} className="bg-[var(--customer-nav-cyan)] text-[var(--customer-nav-canvas)] hover:brightness-110">
                {savingLimits ? t("security.savingLimits") : t("security.saveLimits")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

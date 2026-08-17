import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  DollarSign,
  MessageCircle,
  Save,
  ShoppingCart,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import VenueSettingsToggle from "@/components/Venue/VenueSettingsToggle";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  getVenueNotificationPreferences,
  saveVenueSettingsPreferences,
  type VenueNotificationPreferences,
} from "@/lib/venueNotificationPreferences";
import { setDeliverySoundEnabled, setDeliverySoundVolume } from "@/hooks/useDeliverySoundSetting";
import "./notification-settings-modal.css";

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  volume: number;
  newOrders: boolean;
  orderUpdates: boolean;
  messages: boolean;
  salesAlerts: boolean;
  staffActivity: boolean;
  lowInventory: boolean;
  customerCheckIns: boolean;
  aiWaiterRequests: boolean;
  autoApproveOrders: boolean;
}

type NotificationTypeKey =
  | "newOrders"
  | "orderUpdates"
  | "messages"
  | "salesAlerts"
  | "staffActivity"
  | "lowInventory"
  | "customerCheckIns"
  | "aiWaiterRequests";

const defaultSettings: NotificationSettings = {
  enabled: true,
  sound: true,
  volume: 70,
  newOrders: true,
  orderUpdates: true,
  messages: true,
  salesAlerts: true,
  staffActivity: false,
  lowInventory: true,
  customerCheckIns: false,
  aiWaiterRequests: true,
  autoApproveOrders: false,
};

const toModalSettings = (preferences: VenueNotificationPreferences): NotificationSettings => ({
  enabled: preferences.notificationsEnabled,
  sound: preferences.soundAlerts,
  volume: preferences.notificationVolume,
  newOrders: preferences.newOrderAlerts,
  orderUpdates: preferences.orderUpdatesAlerts,
  messages: preferences.customerMessageAlerts,
  salesAlerts: preferences.salesMilestoneAlerts,
  staffActivity: preferences.staffCheckInAlerts,
  lowInventory: preferences.lowStockWarnings,
  customerCheckIns: preferences.customerCheckInAlerts,
  aiWaiterRequests: preferences.aiWaiterAlerts,
  autoApproveOrders: preferences.autoApproveOrders,
});

const toVenuePreferences = (settings: NotificationSettings): VenueNotificationPreferences => ({
  notificationsEnabled: settings.enabled,
  soundAlerts: settings.sound,
  notificationVolume: settings.volume,
  newOrderAlerts: settings.newOrders,
  orderUpdatesAlerts: settings.orderUpdates,
  customerMessageAlerts: settings.messages,
  salesMilestoneAlerts: settings.salesAlerts,
  staffCheckInAlerts: settings.staffActivity,
  lowStockWarnings: settings.lowInventory,
  customerCheckInAlerts: settings.customerCheckIns,
  aiWaiterAlerts: settings.aiWaiterRequests,
  autoApproveOrders: settings.autoApproveOrders,
});

export default function NotificationSettingsModal({ isOpen, onClose }: NotificationSettingsModalProps) {
  const { t } = useTranslation("venue");
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  useEffect(() => {
    if (isOpen) setSettings(toModalSettings(getVenueNotificationPreferences()));
  }, [isOpen]);

  const handleSave = () => {
    const preferences = toVenuePreferences(settings);
    saveVenueSettingsPreferences(preferences);
    setDeliverySoundEnabled(preferences.soundAlerts);
    setDeliverySoundVolume(preferences.notificationVolume);
    toast.success(t("notification_settings.saved_toast"));
    onClose();
  };

  const updateSetting = (key: keyof NotificationSettings, value: boolean | number) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const notificationTypes: Array<{
    key: NotificationTypeKey;
    label: string;
    description: string;
    icon: typeof Bell;
  }> = [
    { key: "newOrders", label: t("notification_settings.types.new_orders_label"), icon: ShoppingCart, description: t("notification_settings.types.new_orders_desc") },
    { key: "orderUpdates", label: t("notification_settings.types.order_updates_label"), icon: Bell, description: t("notification_settings.types.order_updates_desc") },
    { key: "messages", label: t("notification_settings.types.messages_label"), icon: MessageCircle, description: t("notification_settings.types.messages_desc") },
    { key: "salesAlerts", label: t("notification_settings.types.sales_label"), icon: DollarSign, description: t("notification_settings.types.sales_desc") },
    { key: "staffActivity", label: t("notification_settings.types.staff_label"), icon: Users, description: t("notification_settings.types.staff_desc") },
    { key: "lowInventory", label: t("notification_settings.types.inventory_label"), icon: AlertTriangle, description: t("notification_settings.types.inventory_desc") },
    { key: "customerCheckIns", label: t("notification_settings.types.checkins_label"), icon: Users, description: t("notification_settings.types.checkins_desc") },
    { key: "aiWaiterRequests", label: t("notification_settings.types.ai_waiter_label"), icon: Bell, description: t("notification_settings.types.ai_waiter_desc") },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="venue-notification-modal__overlay"
          onClick={onClose}
        >
          <motion.section
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            className="venue-notification-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="venue-notification-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="venue-notification-modal__header">
              <div className="venue-notification-modal__header-copy">
                <p className="venue-notification-modal__eyebrow">ALERT PREFERENCES</p>
                <h2 id="venue-notification-modal-title" className="venue-notification-modal__title">
                  <Bell aria-hidden="true" />
                  {t("notification_settings.title")}
                </h2>
                <p className="venue-notification-modal__description">
                  Choose the operational alerts your venue team should receive.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="venue-notification-modal__close"
                onClick={onClose}
                aria-label={t("common.cancel")}
              >
                <X />
              </Button>
            </header>

            <div className="venue-notification-modal__body">
              <section className="venue-notification-modal__master">
                <VenueSettingsToggle
                  label={t("notification_settings.enable_label")}
                  description={t("notification_settings.enable_desc")}
                  checked={settings.enabled}
                  onCheckedChange={(checked) => updateSetting("enabled", checked)}
                />
              </section>

              <div className={`venue-notification-modal__settings${settings.enabled ? "" : " is-disabled"}`}>
                <section className="venue-notification-modal__sound">
                  <VenueSettingsToggle
                    label={t("notification_settings.sound_alerts")}
                    description="Play an audio alert for enabled notifications"
                    checked={settings.sound}
                    onCheckedChange={(checked) => updateSetting("sound", checked)}
                    icon={Volume2}
                  />

                  {settings.sound && (
                    <div className="venue-notification-modal__volume">
                      <label>{t("notification_settings.volume")}</label>
                      <Slider
                        value={[settings.volume]}
                        onValueChange={([value]) => updateSetting("volume", value)}
                        max={100}
                        step={10}
                        aria-label={t("notification_settings.volume")}
                      />
                      <output>{settings.volume}%</output>
                    </div>
                  )}
                </section>

                <p className="venue-notification-modal__section-title">
                  {t("notification_settings.types_title")}
                </p>

                <section className="venue-notification-modal__types">
                  {notificationTypes.map(({ key, label, icon, description }) => (
                    <VenueSettingsToggle
                      key={key}
                      label={label}
                      description={description}
                      icon={icon}
                      checked={settings[key]}
                      onCheckedChange={(checked) => updateSetting(key, checked)}
                    />
                  ))}
                </section>

                <section className="venue-notification-modal__auto-approve">
                  <VenueSettingsToggle
                    label={t("notification_settings.auto_approve_label")}
                    description={t("notification_settings.auto_approve_desc")}
                    checked={settings.autoApproveOrders}
                    onCheckedChange={(checked) => updateSetting("autoApproveOrders", checked)}
                  />
                </section>
              </div>

              <footer className="venue-notification-modal__actions">
                <Button
                  type="button"
                  variant="outline"
                  className="venue-notification-modal__button"
                  onClick={onClose}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  className="venue-notification-modal__button venue-notification-modal__button--primary"
                  onClick={handleSave}
                >
                  <Save />
                  {t("notification_settings.save_settings")}
                </Button>
              </footer>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

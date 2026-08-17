export const VENUE_SETTINGS_PREFERENCES_KEY = "jv_venue_settings_preferences";
export const VENUE_NOTIFICATION_PREFERENCES_EVENT = "jv:venue-notification-preferences-changed";

export type VenueNotificationCategory = "order" | "message" | "sale" | "checkin" | "general" | "new_order";

export interface VenueNotificationPreferences {
  notificationsEnabled: boolean;
  soundAlerts: boolean;
  notificationVolume: number;
  newOrderAlerts: boolean;
  orderUpdatesAlerts: boolean;
  customerMessageAlerts: boolean;
  salesMilestoneAlerts: boolean;
  staffCheckInAlerts: boolean;
  lowStockWarnings: boolean;
  customerCheckInAlerts: boolean;
  aiWaiterAlerts: boolean;
  autoApproveOrders: boolean;
}

export const defaultVenueNotificationPreferences: VenueNotificationPreferences = {
  notificationsEnabled: true,
  soundAlerts: true,
  notificationVolume: 70,
  newOrderAlerts: true,
  orderUpdatesAlerts: true,
  customerMessageAlerts: true,
  salesMilestoneAlerts: true,
  staffCheckInAlerts: true,
  lowStockWarnings: false,
  customerCheckInAlerts: false,
  aiWaiterAlerts: true,
  autoApproveOrders: false,
};

const LEGACY_NOTIFICATION_SETTINGS_KEY = "venue_notification_settings";

function readStoredRecord(key: string): Record<string, unknown> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function legacyPreferences(settings: Record<string, unknown>): Partial<VenueNotificationPreferences> {
  const preferences: Partial<VenueNotificationPreferences> = {};
  const mappings: Array<[keyof VenueNotificationPreferences, unknown]> = [
    ["notificationsEnabled", settings.enabled],
    ["soundAlerts", settings.sound],
    ["notificationVolume", settings.volume],
    ["newOrderAlerts", settings.newOrders],
    ["orderUpdatesAlerts", settings.orderUpdates],
    ["customerMessageAlerts", settings.messages],
    ["salesMilestoneAlerts", settings.salesAlerts],
    ["staffCheckInAlerts", settings.staffActivity],
    ["lowStockWarnings", settings.lowInventory],
    ["customerCheckInAlerts", settings.customerCheckIns],
    ["aiWaiterAlerts", settings.aiWaiterRequests],
    ["autoApproveOrders", settings.autoApproveOrders],
  ];

  mappings.forEach(([key, value]) => {
    if (typeof value === "boolean" || (key === "notificationVolume" && typeof value === "number")) {
      preferences[key] = value as never;
    }
  });

  return preferences;
}

export function getVenueNotificationPreferences(): VenueNotificationPreferences {
  const savedSettings = readStoredRecord(VENUE_SETTINGS_PREFERENCES_KEY);
  const legacySettings = legacyPreferences(readStoredRecord(LEGACY_NOTIFICATION_SETTINGS_KEY));

  return {
    ...defaultVenueNotificationPreferences,
    ...legacySettings,
    ...savedSettings,
  } as VenueNotificationPreferences;
}

export function saveVenueSettingsPreferences(settings: object) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    VENUE_SETTINGS_PREFERENCES_KEY,
    JSON.stringify({ ...readStoredRecord(VENUE_SETTINGS_PREFERENCES_KEY), ...settings }),
  );
  window.dispatchEvent(new Event(VENUE_NOTIFICATION_PREFERENCES_EVENT));
}

export function isVenueNotificationEnabled(
  preferences: VenueNotificationPreferences,
  category: VenueNotificationCategory,
) {
  if (!preferences.notificationsEnabled) return false;

  switch (category) {
    case "new_order":
      return preferences.newOrderAlerts;
    case "order":
      return preferences.orderUpdatesAlerts;
    case "message":
      return preferences.customerMessageAlerts;
    case "sale":
      return preferences.salesMilestoneAlerts;
    case "checkin":
      return preferences.customerCheckInAlerts;
    default:
      return true;
  }
}

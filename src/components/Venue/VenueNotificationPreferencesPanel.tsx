import {
  Bell,
  Bot,
  DollarSign,
  MessageCircle,
  Package,
  Save,
  ShoppingCart,
  UsersRound,
  Volume2,
} from "lucide-react";
import VenueSettingsToggle from "@/components/Venue/VenueSettingsToggle";
import type { VenueNotificationPreferences } from "@/lib/venueNotificationPreferences";

export type { VenueNotificationPreferences } from "@/lib/venueNotificationPreferences";

interface VenueNotificationPreferencesPanelProps {
  value: VenueNotificationPreferences;
  onChange: (value: VenueNotificationPreferences) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function VenueNotificationPreferencesPanel({
  value,
  onChange,
  onSave,
  onCancel,
}: VenueNotificationPreferencesPanelProps) {
  const update = <Key extends keyof VenueNotificationPreferences>(key: Key, nextValue: VenueNotificationPreferences[Key]) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <form className="venue-notification-preferences" onSubmit={(event) => {
      event.preventDefault();
      onSave();
    }}>
      <div className="venue-settings-list">
        <VenueSettingsToggle
          label="Enable notifications"
          description="Receive live alerts across all venue activity"
          checked={value.notificationsEnabled}
          onCheckedChange={(checked) => update("notificationsEnabled", checked)}
        />
        <VenueSettingsToggle
          label="Sound alerts"
          description="Play an audio alert for enabled notifications"
          checked={value.soundAlerts}
          onCheckedChange={(checked) => update("soundAlerts", checked)}
          icon={Volume2}
        />
      </div>

      <div className="venue-notification-volume">
        <label htmlFor="venue-notification-volume">Volume</label>
        <input
          id="venue-notification-volume"
          type="range"
          min="0"
          max="100"
          value={value.notificationVolume}
          onChange={(event) => update("notificationVolume", Number(event.target.value))}
        />
        <output htmlFor="venue-notification-volume">{value.notificationVolume}%</output>
      </div>

      <p className="venue-notification-preferences__subtitle">NOTIFICATION TYPES</p>
      <div className="venue-settings-list">
        <VenueSettingsToggle label="New orders" description="Get notified when a new order is placed" checked={value.newOrderAlerts} onCheckedChange={(checked) => update("newOrderAlerts", checked)} icon={ShoppingCart} />
        <VenueSettingsToggle label="Order updates" description="Updates on order status changes" checked={value.orderUpdatesAlerts} onCheckedChange={(checked) => update("orderUpdatesAlerts", checked)} icon={Bell} />
        <VenueSettingsToggle label="Customer messages" description="Messages from customers and staff" checked={value.customerMessageAlerts} onCheckedChange={(checked) => update("customerMessageAlerts", checked)} icon={MessageCircle} />
        <VenueSettingsToggle label="Sales milestones" description="Alerts for sales goals and milestones" checked={value.salesMilestoneAlerts} onCheckedChange={(checked) => update("salesMilestoneAlerts", checked)} icon={DollarSign} />
        <VenueSettingsToggle label="Staff activity" description="Clock in, out, and break notifications" checked={value.staffCheckInAlerts} onCheckedChange={(checked) => update("staffCheckInAlerts", checked)} icon={UsersRound} />
        <VenueSettingsToggle label="Low inventory" description="Alerts when stock is running low" checked={value.lowStockWarnings} onCheckedChange={(checked) => update("lowStockWarnings", checked)} icon={Package} />
        <VenueSettingsToggle label="Customer check-ins" description="When customers check in to your venue" checked={value.customerCheckInAlerts} onCheckedChange={(checked) => update("customerCheckInAlerts", checked)} icon={UsersRound} />
        <VenueSettingsToggle label="AI waiter requests" description="When customers call the AI waiter" checked={value.aiWaiterAlerts} onCheckedChange={(checked) => update("aiWaiterAlerts", checked)} icon={Bot} />
      </div>

      <div className="venue-notification-preferences__auto-approve">
        <VenueSettingsToggle
          label="Auto-approve new orders"
          description="Automatically acknowledge incoming orders without a confirmation prompt"
          checked={value.autoApproveOrders}
          onCheckedChange={(checked) => update("autoApproveOrders", checked)}
        />
      </div>

      <div className="venue-notification-preferences__actions">
        <button className="venue-settings-button venue-settings-button--secondary" type="button" onClick={onCancel}>Cancel</button>
        <button className="venue-settings-button venue-settings-button--primary" type="submit"><Save aria-hidden="true" /><span>Save settings</span></button>
      </div>
    </form>
  );
}

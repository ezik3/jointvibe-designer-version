import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Bell, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface ShiftReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  userId: string;
}

interface RosterEntry {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface ReminderPref {
  roster_id: string;
  enabled: boolean;
  minutes_before: number;
  existing_id?: string;
}

const REMINDER_OPTION_VALUES = ["15", "30", "60", "120", "480", "720"] as const;

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${m > 0 ? `:${m.toString().padStart(2, "0")}` : ""}${ampm}`;
}

export default function ShiftReminderModal({ isOpen, onClose, venueId, userId }: ShiftReminderModalProps) {
  const { t } = useTranslation('common');
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [reminders, setReminders] = useState<Map<string, ReminderPref>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoading(true);

      // Fetch roster entries for this employee at this venue
      const { data: roster } = await supabase
        .from("employee_roster")
        .select("id, day_of_week, start_time, end_time")
        .eq("venue_id", venueId)
        .eq("employee_id", userId);

      setRosterEntries(roster || []);

      // Fetch existing reminders
      const { data: existingReminders } = await supabase
        .from("shift_reminders")
        .select("*")
        .eq("employee_id", userId)
        .eq("venue_id", venueId);

      const map = new Map<string, ReminderPref>();
      (roster || []).forEach(r => {
        const existing = existingReminders?.find(er => er.roster_id === r.id);
        map.set(r.id, {
          roster_id: r.id,
          enabled: existing?.enabled ?? false,
          minutes_before: existing?.reminder_minutes_before ?? 60,
          existing_id: existing?.id,
        });
      });
      setReminders(map);
      setLoading(false);
    };

    fetchData();
  }, [isOpen, venueId, userId]);

  const toggleReminder = (rosterId: string) => {
    setReminders(prev => {
      const next = new Map(prev);
      const current = next.get(rosterId)!;
      next.set(rosterId, { ...current, enabled: !current.enabled });
      return next;
    });
  };

  const setMinutesBefore = (rosterId: string, value: string) => {
    setReminders(prev => {
      const next = new Map(prev);
      const current = next.get(rosterId)!;
      next.set(rosterId, { ...current, minutes_before: parseInt(value) });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);

    for (const [, pref] of reminders) {
      if (pref.existing_id) {
        await supabase
          .from("shift_reminders")
          .update({
            enabled: pref.enabled,
            reminder_minutes_before: pref.minutes_before,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pref.existing_id);
      } else if (pref.enabled) {
        const entry = rosterEntries.find(r => r.id === pref.roster_id);
        await supabase
          .from("shift_reminders")
          .insert({
            employee_id: userId,
            venue_id: venueId,
            roster_id: pref.roster_id,
            day_of_week: entry?.day_of_week || "",
            reminder_minutes_before: pref.minutes_before,
            enabled: true,
          });
      }
    }

    setSaving(false);
    toast.success(t('shift_reminders.saved'));
    onClose();
  };

  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const sorted = [...rosterEntries].sort((a, b) => dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="customer-dialog-surface max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--customer-modal-text)]">
            <Bell className="h-5 w-5 text-[var(--customer-modal-cyan)]" />
            {t('shift_reminders.title')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-[var(--customer-modal-muted)] text-center py-8">{t('shift_reminders.no_shifts')}</p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {sorted.map(entry => {
              const pref = reminders.get(entry.id);
              if (!pref) return null;

              return (
                <div
                  key={entry.id}
                  className="p-4 rounded-[6px] bg-[var(--customer-modal-raised)] border border-[var(--customer-modal-line)] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[var(--customer-modal-text)]">{entry.day_of_week}</p>
                      <p className="text-sm text-[var(--customer-modal-muted)] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime12(entry.start_time)} - {formatTime12(entry.end_time)}
                      </p>
                    </div>
                    <Switch
                      checked={pref.enabled}
                      onCheckedChange={() => toggleReminder(entry.id)}
                    />
                  </div>

                  {pref.enabled && (
                    <Select
                      value={pref.minutes_before.toString()}
                      onValueChange={(val) => setMinutesBefore(entry.id, val)}
                    >
                      <SelectTrigger className="customer-modal-field">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REMINDER_OPTION_VALUES.map(value => (
                          <SelectItem key={value} value={value}>
                            {t(`shift_reminders.options.${value}` as any)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || loading}
          className="customer-modal-primary w-full font-semibold"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t('shift_reminders.save_button')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

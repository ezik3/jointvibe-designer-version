import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar } from "@/components/ui/calendar";
import { addDays, isBefore, startOfDay, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

interface ReservationCalendarProps {
  selectedDate: Date | undefined;
  onDateSelect: (date: Date | undefined) => void;
  maxAdvanceDays: number;
  minLeadMinutes: number;
}

export function ReservationCalendar({
  selectedDate,
  onDateSelect,
  maxAdvanceDays,
  minLeadMinutes,
}: ReservationCalendarProps) {
  const { t } = useTranslation('common');
  const today = startOfDay(new Date());
  const maxDate = addDays(today, maxAdvanceDays);
  
  // If min lead time is more than current remaining day, disable today
  const now = new Date();
  const todayDisabled = minLeadMinutes > 0 && (
    now.getHours() >= 21 // After 9 PM, disable today
  );

  const disabledDays = (date: Date) => {
    const start = startOfDay(date);
    // Before today or after max date
    if (isBefore(start, today) || isBefore(maxDate, start)) {
      return true;
    }
    // Today disabled if too late
    if (todayDisabled && isToday(date)) {
      return true;
    }
    return false;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center"
    >
      <h3 className="text-lg font-semibold text-[var(--customer-modal-text)] mb-4">{t('reservation.select_date')}</h3>
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={onDateSelect}
        disabled={disabledDays}
        className={cn(
          "rounded-[6px] border border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] p-3 pointer-events-auto",
          "[&_.rdp-day]:text-[var(--customer-modal-text)] [&_.rdp-day]:rounded-[4px]",
          "[&_.rdp-day_button]:text-[var(--customer-modal-text)]",
          "[&_.rdp-day_button:hover]:bg-[var(--customer-modal-raised)]",
          "[&_.rdp-day_button.rdp-day_selected]:bg-[var(--customer-modal-cyan)] [&_.rdp-day_button.rdp-day_selected]:text-[var(--customer-modal-canvas)]",
          "[&_.rdp-head_cell]:text-[var(--customer-modal-muted)]",
          "[&_.rdp-caption]:text-[var(--customer-modal-text)]",
          "[&_.rdp-nav_button]:text-[var(--customer-modal-text)] [&_.rdp-nav_button:hover]:bg-[var(--customer-modal-raised)]"
        )}
      />
      <p className="text-sm text-[var(--customer-modal-muted)] mt-3 text-center">
        {t('reservation.book_in_advance', { count: maxAdvanceDays })}
      </p>
    </motion.div>
  );
}

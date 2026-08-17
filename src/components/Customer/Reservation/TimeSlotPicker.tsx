import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface TimeSlot {
  time: string;
  available: boolean;
}

interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selectedTime: string | null;
  onTimeSelect: (time: string) => void;
}

export function TimeSlotPicker({
  slots,
  selectedTime,
  onTimeSelect,
}: TimeSlotPickerProps) {
  const { t } = useTranslation('common');
  const availableSlots = slots.filter(s => s.available);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col"
    >
      <h3 className="text-lg font-semibold text-[var(--customer-modal-text)] mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-primary" />
        {t('reservation.select_time')}
      </h3>

      {availableSlots.length === 0 ? (
        <div className="text-center py-8 text-[var(--customer-modal-muted)]">
          {t('reservation.no_slots')}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
          {availableSlots.map((slot) => (
            <motion.button
              key={slot.time}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTimeSelect(slot.time)}
              className={`
                py-3 px-4 rounded-[6px] border text-sm font-medium transition-all
                ${selectedTime === slot.time
                  ? "bg-[var(--customer-modal-cyan)] border-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)]"
                  : "bg-[var(--customer-modal-canvas)] border-[var(--customer-modal-line)] text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)]"
                }
              `}
            >
              {slot.time}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

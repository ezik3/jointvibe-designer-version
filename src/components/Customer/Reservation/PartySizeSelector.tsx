import { motion } from "framer-motion";
import { Users, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';

interface PartySizeSelectorProps {
  partySize: number;
  onPartySizeChange: (size: number) => void;
  minSize?: number;
  maxSize?: number;
}

export function PartySizeSelector({
  partySize,
  onPartySizeChange,
  minSize = 1,
  maxSize = 20,
}: PartySizeSelectorProps) {
  const { t } = useTranslation('common');
  // Ensure maxSize is at least minSize and a valid number
  const safeMaxSize = Math.max(maxSize || 20, minSize, 2);

  const handleDecrease = () => {
    if (partySize > minSize) {
      onPartySizeChange(partySize - 1);
    }
  };

  const handleIncrease = () => {
    if (partySize < safeMaxSize) {
      onPartySizeChange(partySize + 1);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col"
    >
      <h3 className="text-lg font-semibold text-[var(--customer-modal-text)] mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        {t('reservation.party_size')}
      </h3>

      <div className="flex items-center justify-center gap-6 py-4">
        <Button
          variant="outline"
          size="icon"
          className="customer-modal-secondary h-12 w-12 rounded-[6px]"
          onClick={handleDecrease}
          disabled={partySize <= minSize}
        >
          <Minus className="h-5 w-5" />
        </Button>

        <div className="text-center">
          <div className="text-4xl font-bold text-[var(--customer-modal-text)]">{partySize}</div>
          <div className="text-sm text-[var(--customer-modal-muted)]">
            {partySize === 1 ? t('reservation.guest_one') : t('reservation.guest_other')}
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="customer-modal-secondary h-12 w-12 rounded-[6px]"
          onClick={handleIncrease}
          disabled={partySize >= safeMaxSize}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </motion.div>
  );
}

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Clock, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from 'react-i18next';

export interface MenuItemPreview {
  id: string;
  name: string;
  description?: string;
  category?: string;
  base_price: number;
  image_url?: string;
  available?: boolean;
  preparation_time?: number;
  venue_id: string;
  venue_name?: string;
}

interface MenuItemPreviewModalProps {
  item: MenuItemPreview | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToOrder?: (item: MenuItemPreview) => void;
}

export default function MenuItemPreviewModal({ 
  item, 
  isOpen, 
  onClose,
  onAddToOrder 
}: MenuItemPreviewModalProps) {
  const { t } = useTranslation('common');
  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="customer-dialog-surface p-0 overflow-hidden">
        {/* Image */}
        {item.image_url && (
          <div className="relative h-48 w-full">
            <img
              src={item.image_url}
              alt={item.name}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(8,11,14,0.84),rgba(8,11,14,0.04))]" />
          </div>
        )}

        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold text-foreground">{item.name}</h2>
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1 bg-primary/20 text-primary px-3 py-1.5 rounded-full font-bold"
              >
                <DollarSign className="h-4 w-4" />
                {item.base_price.toFixed(2)}
              </motion.div>
            </div>

            {item.category && (
              <Badge variant="secondary" className="text-xs">
                {item.category}
              </Badge>
            )}

            {item.venue_name && (
              <p className="text-sm text-muted-foreground">
                {t('menu_preview.at')} <span className="text-primary font-medium">{item.venue_name}</span>
              </p>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {item.description}
            </p>
          )}

          {/* Prep time */}
          {item.preparation_time && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{t('menu_preview.prep_time', { minutes: item.preparation_time })}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              {t('actions.close')}
            </Button>
            {onAddToOrder && (
              <Button
                className="flex-1 bg-primary text-primary-foreground"
                onClick={() => {
                  onAddToOrder(item);
                  onClose();
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('menu_preview.add_to_order')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

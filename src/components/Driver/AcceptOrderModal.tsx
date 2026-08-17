import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, ArrowRight, DollarSign, Clock, Package, Car, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface DeliveryOrder {
  id: string;
  pickup_address?: string;
  delivery_address: string;
  delivery_fee?: number;
  driver_earnings?: number;
  created_at: string;
}

interface RideBooking {
  id: string;
  pickup_address: string;
  destination_address: string;
  estimated_fare?: number;
  driver_earnings?: number;
  distance_km?: number;
  estimated_duration_minutes?: number;
  created_at: string;
}

interface AcceptOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: DeliveryOrder | RideBooking | null;
  orderType: 'delivery' | 'ride';
  onAccept: (orderId: string) => Promise<{ success: boolean }>;
}

export default function AcceptOrderModal({
  isOpen,
  onClose,
  order,
  orderType,
  onAccept
}: AcceptOrderModalProps) {
  const { t } = useTranslation('common');
  const [isAccepting, setIsAccepting] = useState(false);

  if (!order) return null;

  const isDelivery = orderType === 'delivery';
  const deliveryOrder = order as DeliveryOrder;
  const rideBooking = order as RideBooking;

  const pickupAddress = isDelivery ? deliveryOrder.pickup_address : rideBooking.pickup_address;
  const dropoffAddress = isDelivery ? deliveryOrder.delivery_address : rideBooking.destination_address;
  const earnings = isDelivery 
    ? (deliveryOrder.driver_earnings || (deliveryOrder.delivery_fee ? deliveryOrder.delivery_fee - 0.10 : 0))
    : (rideBooking.driver_earnings || (rideBooking.estimated_fare ? rideBooking.estimated_fare - 0.10 : 0));

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const result = await onAccept(order.id);
      if (result.success) {
        onClose();
      }
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {isDelivery ? (
              <>
                <Package className="w-6 h-6 text-primary" />
                New Delivery Available
              </>
            ) : (
              <>
                <Car className="w-6 h-6 text-primary" />
                New Ride Request
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-[8px] border border-primary/40 bg-primary/10 p-4 text-center"
          >
            <div className="text-sm text-muted-foreground mb-1">You'll Earn</div>
            <div className="text-3xl font-bold text-primary flex items-center justify-center gap-1">
              <DollarSign className="w-7 h-7" />
              {earnings.toFixed(2)}
            </div>
          </motion.div>

          <div className="space-y-3 rounded-[8px] border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Pickup</div>
                <div className="text-sm font-medium truncate">{pickupAddress || 'Restaurant'}</div>
              </div>
            </div>

            <div className="flex justify-center">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Drop-off</div>
                <div className="text-sm font-medium truncate">{dropoffAddress}</div>
              </div>
            </div>
          </div>

          {!isDelivery && rideBooking.distance_km && (
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {rideBooking.distance_km.toFixed(1)} km
              </div>
              {rideBooking.estimated_duration_minutes && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  ~{rideBooking.estimated_duration_minutes} min
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isAccepting}
            >
              Decline
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90"
              onClick={handleAccept}
              disabled={isAccepting}
            >
              {isAccepting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>Accept {isDelivery ? 'Delivery' : 'Ride'}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, MapPin, DollarSign, ShoppingCart, LogOut, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface ShiftModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueName: string;
  employeeRole: string;
  onStartShift: () => void;
}

export default function ShiftModeModal({ 
  isOpen, 
  onClose, 
  venueName, 
  employeeRole,
  onStartShift 
}: ShiftModeModalProps) {
  const { t } = useTranslation('venue');
  const [isClockingIn, setIsClockingIn] = useState(false);

  const handleStartShift = async () => {
    setIsClockingIn(true);
    // Simulate geolocation check
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsClockingIn(false);
    toast.success(t('shift_modal.now_on_shift'));
    onStartShift();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="venue-dialog-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            {t('shift_modal.ready_title')}
          </DialogTitle>
          <DialogDescription className="text-center text-slate-400">
            {t('shift_modal.ready_desc')}
          </DialogDescription>
        </DialogHeader>

        <Card className="bg-[#12363b] border-cyan-500/30">
          <CardContent className="p-6 text-center">
            <h3 className="text-2xl font-bold mb-2">{venueName}</h3>
            <p className="text-primary font-medium capitalize">{employeeRole}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto text-blue-400 mb-2" />
              <p className="text-sm text-slate-400">{t('shift_modal.shift_time')}</p>
              <p className="font-bold">{t('shift_modal.shift_time_default')}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4 text-center">
              <MapPin className="h-6 w-6 mx-auto text-green-400 mb-2" />
              <p className="text-sm text-slate-400">{t('shift_modal.location')}</p>
              <p className="font-bold text-green-400">{t('shift_modal.at_venue')}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleStartShift}
            disabled={isClockingIn}
            className="venue-dialog-primary-action w-full h-12 text-lg font-bold"
          >
            {isClockingIn ? (
              <>
                <MapPin className="mr-2 h-5 w-5 animate-pulse" />
                {t('shift_modal.verifying_location')}
              </>
            ) : (
              <>
                <Play className="mr-2 h-5 w-5" />
                {t('shift_modal.start_shift')}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="venue-dialog-secondary-action w-full"
          >
            {t('shift_modal.not_now')}
          </Button>
        </div>

        <p className="text-xs text-center text-slate-500">
          {t('shift_modal.location_verify_hint')}
        </p>
      </DialogContent>
    </Dialog>
  );
}

// Clock Out Modal Component
interface ClockOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  shiftData: {
    hoursWorked: string;
    ordersServed: number;
    totalSales: number;
  };
  onConfirmClockOut: () => void;
}

export function ClockOutModal({ isOpen, onClose, shiftData, onConfirmClockOut }: ClockOutModalProps) {
  const { t } = useTranslation('venue');
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="venue-dialog-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            {t('shift_modal.end_title')}
          </DialogTitle>
          <DialogDescription className="text-center text-slate-400">
            {t('shift_modal.end_desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto text-blue-400 mb-2" />
              <p className="text-xs text-slate-400">{t('shift_modal.hours')}</p>
              <p className="font-bold text-lg">{shiftData.hoursWorked}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4 text-center">
              <ShoppingCart className="h-6 w-6 mx-auto text-orange-400 mb-2" />
              <p className="text-xs text-slate-400">{t('shift_modal.orders')}</p>
              <p className="font-bold text-lg">{shiftData.ordersServed}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4 text-center">
              <DollarSign className="h-6 w-6 mx-auto text-green-400 mb-2" />
              <p className="text-xs text-slate-400">{t('shift_modal.sales')}</p>
              <p className="font-bold text-lg">${shiftData.totalSales}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Button
            onClick={onConfirmClockOut}
            className="w-full h-12 bg-red-500 hover:bg-red-600 text-lg font-bold"
          >
            <LogOut className="mr-2 h-5 w-5" />
            {t('shift_modal.confirm_clock_out')}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full border-slate-600 text-slate-300"
          >
            <Pause className="mr-2 h-4 w-4" />
            {t('shift_modal.continue_working')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

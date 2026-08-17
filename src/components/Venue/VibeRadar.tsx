import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Megaphone, AlertCircle, Save, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from 'react-i18next';

interface VibeSummary {
  yes: number;
  maybe: number;
  no: number;
}

interface VibeRadarProps {
  isOpen: boolean;
  onClose: () => void;
  vibe: {
    id: string;
    message: string;
    expiresAt: Date;
    status: string;
    responseSummary: VibeSummary;
    linkedDealId?: string | null;
  } | null;
  onConvertToDeal: (vibeId: string) => void;
  onLetExpire: (vibeId: string) => void;
  onPushDealNow?: (vibeId: string, dealId: string) => void;
  onScheduleDeal?: (vibeId: string, dealId: string, scheduledAt: string) => void;
  onSaveForLater?: (vibeId: string, dealId: string) => void;
}

// Animated radar blip component
const RadarBlip = ({ 
  type, 
  index, 
  total 
}: { 
  type: 'yes' | 'maybe' | 'no'; 
  index: number; 
  total: number;
}) => {
  const { t } = useTranslation('venue');
  const angle = (index / Math.max(total, 1)) * 360 + Math.random() * 30;
  const distance = 30 + Math.random() * 50;
  const x = Math.cos((angle * Math.PI) / 180) * distance;
  const y = Math.sin((angle * Math.PI) / 180) * distance;

  const colors = {
    yes: 'bg-green-400 shadow-green-400/50',
    maybe: 'bg-yellow-400 shadow-yellow-400/50',
    no: 'bg-red-400 shadow-red-400/50',
  };

  return (
    <motion.div
      className={`absolute w-3 h-3 rounded-full ${colors[type]} shadow-lg`}
      style={{ 
        left: `calc(50% + ${x}%)`, 
        top: `calc(50% + ${y}%)`,
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
    />
  );
};

// Radar pulse animation
const RadarPulse = () => (
  <div className="absolute inset-0 flex items-center justify-center">
    {[1, 2, 3].map((ring) => (
      <motion.div
        key={ring}
        className="absolute rounded-full border border-primary/30"
        style={{ 
          width: `${ring * 33}%`, 
          height: `${ring * 33}%`,
        }}
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.1, 0.3],
        }}
        transition={{ 
          duration: 2, 
          repeat: Infinity, 
          delay: ring * 0.3,
        }}
      />
    ))}
    
    {/* Sweeping radar line */}
    <motion.div
      className="absolute w-1/2 h-0.5 bg-cyan-400/70 origin-left"
      style={{ left: '50%', top: '50%' }}
      animate={{ rotate: 360 }}
      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
    />
  </div>
);

const VibeRadar = ({
  isOpen,
  onClose,
  vibe,
  onConvertToDeal,
  onLetExpire,
  onPushDealNow,
  onScheduleDeal,
  onSaveForLater,
}: VibeRadarProps) => {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");

  useEffect(() => {
    if (!vibe) return;

    const updateTimer = () => {
      const now = new Date();
      const expires = new Date(vibe.expiresAt);
      
      if (expires <= now) {
        setTimeLeft("Expired");
        return;
      }

      setTimeLeft(formatDistanceToNow(expires, { addSuffix: false }));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [vibe]);

  if (!vibe) return null;

  const totalResponses = vibe.responseSummary.yes + vibe.responseSummary.maybe + vibe.responseSummary.no;
  const isExpired = vibe.status === 'expired' || new Date(vibe.expiresAt) <= new Date();
  const hasLinkedDeal = !!vibe.linkedDealId;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="venue-dialog-surface max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <div className="relative w-6 h-6">
              <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping" />
              <div className="absolute inset-1 rounded-full bg-primary" />
            </div>
            Vibe Radar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Radar Visualization */}
          <div className="relative aspect-square bg-[#171d23] rounded-full overflow-hidden">
            <RadarPulse />
            
            {/* Center venue dot */}
            <div className="venue-dialog-icon--cyan absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center z-10 shadow-lg shadow-cyan-500/30">
              <div className="w-3 h-3 rounded-full bg-white" />
            </div>

            {/* Response blips */}
            {Array.from({ length: vibe.responseSummary.yes }).map((_, i) => (
              <RadarBlip key={`yes-${i}`} type="yes" index={i} total={vibe.responseSummary.yes} />
            ))}
            {Array.from({ length: vibe.responseSummary.maybe }).map((_, i) => (
              <RadarBlip key={`maybe-${i}`} type="maybe" index={i} total={vibe.responseSummary.maybe} />
            ))}
            {Array.from({ length: vibe.responseSummary.no }).map((_, i) => (
              <RadarBlip key={`no-${i}`} type="no" index={i} total={vibe.responseSummary.no} />
            ))}
          </div>

          {/* Response Summary */}
          <div className="flex justify-center gap-6">
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-2xl font-bold text-white">{vibe.responseSummary.yes}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{t("feed:events.interested")}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-2xl font-bold text-white">{vibe.responseSummary.maybe}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Maybe</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <span className="text-2xl font-bold text-white">{vibe.responseSummary.no}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">No</p>
            </div>
          </div>

          {/* Vibe Message */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <p className="text-white text-center italic">"{vibe.message}"</p>
            </CardContent>
          </Card>

          {/* Timer */}
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm">
              {isExpired ? (
                <span className="text-red-400">Vibe has expired</span>
              ) : (
                <>Expires in <span className="text-white font-medium">{timeLeft}</span></>
              )}
            </span>
          </div>

          {/* Actions — 3-button layout when linked deal exists */}
          {hasLinkedDeal && (vibe.status === 'collecting' || isExpired) && (
            <div className="space-y-2">
              <p className="text-xs text-cyan-400 text-center font-medium">Deal draft attached</p>
              
              {showScheduler ? (
                <div className="space-y-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <Label className="text-slate-300 text-sm">Schedule for</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowScheduler(false)}
                      className="flex-1 border-slate-600 text-slate-300"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (scheduledDate && onScheduleDeal) {
                          onScheduleDeal(vibe.id, vibe.linkedDealId!, scheduledDate);
                          setShowScheduler(false);
                        }
                      }}
                      disabled={!scheduledDate}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      Confirm
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    onClick={() => onPushDealNow?.(vibe.id, vibe.linkedDealId!)}
                    disabled={totalResponses === 0}
                    className="venue-dialog-primary-action w-full"
                  >
                    <Megaphone className="w-4 h-4 mr-2" />
                    Push This Deal Now (1 credit)
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowScheduler(true)}
                      className="venue-dialog-secondary-action"
                    >
                      <CalendarClock className="w-4 h-4 mr-1" />
                      Schedule
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onSaveForLater?.(vibe.id, vibe.linkedDealId!)}
                      className="venue-dialog-secondary-action"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Save for Later
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Original 2-button layout when no linked deal */}
          {!hasLinkedDeal && !isExpired && vibe.status === 'collecting' && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => onLetExpire(vibe.id)}
                className="venue-dialog-secondary-action"
              >
                Let Expire
              </Button>
              <Button
                onClick={() => onConvertToDeal(vibe.id)}
                disabled={totalResponses === 0}
                className="venue-dialog-primary-action"
              >
                <Megaphone className="w-4 h-4 mr-2" />
                Convert to Deal
              </Button>
            </div>
          )}

          {isExpired && !hasLinkedDeal && (
            <div className="flex items-center justify-center gap-2 text-slate-400 bg-slate-800/50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">This vibe has ended. No credits were used.</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VibeRadar;

import { useState, useEffect } from "react";
import { motion, Reorder } from "framer-motion";
import { 
  X, GripVertical, Plus, Check, UserPlus,
  ShoppingCart, ChefHat, Table2, MessageCircle, Bot, Megaphone, 
  Wallet, Truck, Calendar, Monitor, Radio, Music, Mic2, MicVocal, Mic, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import PerformerInviteModal from "./PerformerInviteModal";
import { useTranslation } from 'react-i18next';

interface OrbCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  activeOrbs: string[];
  availableOrbs: string[];
  onSave: (orbs: string[]) => Promise<void>;
  onAddPerformer?: (performer: any) => Promise<void>;
  maxOrbs?: number;
  venueId?: string;
}

const orbMeta: Record<string, { icon: any; label: string; color: string; description: string }> = {
  orders: { icon: ShoppingCart, label: "Live Orders", color: "venue-dialog-icon--orange", description: "Track incoming orders" },
  kitchen: { icon: ChefHat, label: "Kitchen", color: "venue-dialog-icon--green", description: "Kitchen queue display" },
  tables: { icon: Table2, label: "Tables", color: "venue-dialog-icon--blue", description: "Table management" },
  messages: { icon: MessageCircle, label: "Messages", color: "venue-dialog-icon--gold", description: "Customer chat" },
  ai_assistant: { icon: Bot, label: "JV Assistant", color: "venue-dialog-icon--cyan", description: "AI-powered help" },
  push_deals: { icon: Megaphone, label: "Push Deal", color: "venue-dialog-icon--rose", description: "Send promotions" },
  wallet: { icon: Wallet, label: "Wallet", color: "venue-dialog-icon--green", description: "Payments & payouts" },
  deliveries: { icon: Truck, label: "Deliveries", color: "venue-dialog-icon--orange", description: "Delivery tracking" },
  reservations: { icon: Calendar, label: "Reservations", color: "venue-dialog-icon--cyan", description: "Booking management" },
  pos: { icon: Monitor, label: "Open POS", color: "venue-dialog-icon--cyan", description: "Point of sale" },
  vibe_radar: { icon: Radio, label: "Vibe Radar", color: "venue-dialog-icon--cyan", description: "Send demand tests" },
  dj_booth: { icon: Music, label: "DJ Booth", color: "venue-dialog-icon--blue", description: "Performer control" },
};

const OrbCustomizer = ({
  isOpen,
  onClose,
  activeOrbs,
  availableOrbs,
  onSave,
  onAddPerformer,
  maxOrbs = 8,
  venueId = '',
}: OrbCustomizerProps) => {
  const { t } = useTranslation('venue');
  const [selectedOrbs, setSelectedOrbs] = useState<string[]>(activeOrbs);
  const [isSaving, setIsSaving] = useState(false);
  const [showPerformerModal, setShowPerformerModal] = useState(false);

  useEffect(() => {
    setSelectedOrbs(activeOrbs);
  }, [activeOrbs, isOpen]);

  const handleReorder = (newOrder: string[]) => {
    setSelectedOrbs(newOrder);
  };

  const addOrb = (orbId: string) => {
    if (selectedOrbs.length >= maxOrbs) {
      toast.error(`Maximum ${maxOrbs} orbs allowed`);
      return;
    }
    if (!selectedOrbs.includes(orbId)) {
      setSelectedOrbs([...selectedOrbs, orbId]);
    }
  };

  const removeOrb = (orbId: string) => {
    setSelectedOrbs(selectedOrbs.filter(id => id !== orbId));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(selectedOrbs);
      toast.success("Home layout saved!");
      onClose();
    } catch (error) {
      toast.error("Failed to save layout");
    } finally {
      setIsSaving(false);
    }
  };

  const inactiveOrbs = availableOrbs.filter(id => !selectedOrbs.includes(id));

  const handleAddPerformer = async (performer: any) => {
    if (onAddPerformer) {
      await onAddPerformer(performer);
    }
    setShowPerformerModal(false);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="venue-dialog-surface max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">Customize Home Orbs</DialogTitle>
            <DialogDescription className="text-slate-400">
              Drag to reorder, tap to add or remove
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[55vh] pr-4">
            <div className="space-y-6">
            {/* Active Orbs */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-400">ACTIVE ORBS</h3>
                <span className="text-xs text-slate-500">{selectedOrbs.length}/{maxOrbs}</span>
              </div>
              
              <Reorder.Group
                axis="y"
                values={selectedOrbs}
                onReorder={handleReorder}
                className="space-y-2"
              >
                {selectedOrbs.map((orbId) => {
                  const meta = orbMeta[orbId];
                  if (!meta) return null;
                  const Icon = meta.icon;

                  return (
                    <Reorder.Item
                      key={orbId}
                      value={orbId}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <Card className="bg-slate-800/80 border-slate-700 hover:border-slate-600 transition-colors">
                        <CardContent className="p-3 flex items-center gap-3">
                          <GripVertical className="w-5 h-5 text-slate-500" />
                          <div className={`w-10 h-10 rounded-full ${meta.color} flex items-center justify-center`}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-white font-medium">{meta.label}</p>
                            <p className="text-xs text-slate-400">{meta.description}</p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeOrb(orbId)}
                            className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>

              {selectedOrbs.length === 0 && (
                <Card className="bg-slate-800/50 border-slate-700 border-dashed">
                  <CardContent className="p-6 text-center text-slate-500">
                    Add orbs from below
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Available Orbs */}
            {inactiveOrbs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-400 mb-3">ADD ORB</h3>
                <div className="space-y-2">
                  {inactiveOrbs.map((orbId) => {
                    const meta = orbMeta[orbId];
                    if (!meta) return null;
                    const Icon = meta.icon;

                    return (
                      <Card 
                        key={orbId}
                        className="bg-slate-800/50 border-slate-700 hover:border-primary/50 transition-colors cursor-pointer"
                        onClick={() => addOrb(orbId)}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full ${meta.color} opacity-60 flex items-center justify-center`}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-slate-300 font-medium">{meta.label}</p>
                            <p className="text-xs text-slate-500">{meta.description}</p>
                          </div>
                          <Plus className="w-5 h-5 text-slate-500" />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add Guest/Performer Section */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3">ADD GUEST / PERFORMER</h3>
              <Card 
                className="bg-[#12363b] border-cyan-500/30 hover:border-cyan-500/50 transition-colors cursor-pointer"
                onClick={() => setShowPerformerModal(true)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="venue-dialog-icon--cyan w-12 h-12 rounded-full flex items-center justify-center shadow-lg">
                    <UserPlus className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold">Add DJ, Host, Singer...</p>
                    <p className="text-xs text-slate-400">Invite performers with display takeover access</p>
                  </div>
                  <Plus className="w-5 h-5 text-cyan-400" />
                </CardContent>
              </Card>
            </div>
            </div>
          </ScrollArea>

          {/* Save Button */}
          <div className="pt-4 border-t border-slate-700">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="venue-dialog-primary-action w-full"
            >
              {isSaving ? (
                <motion.div
                  className="w-5 h-5 rounded-full border-2 border-white border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Layout
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Performer Invite Modal */}
      <PerformerInviteModal
        isOpen={showPerformerModal}
        onClose={() => setShowPerformerModal(false)}
        onInvite={handleAddPerformer}
        venueId={venueId}
      />
    </>
  );
};

export default OrbCustomizer;

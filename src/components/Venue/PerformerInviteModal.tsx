import { useState } from "react";
import { motion } from "framer-motion";
import { X, Search, Music, Mic2, MicVocal, Mic, Sparkles, Check, Video, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface PerformerInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (performer: PerformerData) => Promise<void>;
  venueId: string;
}

interface PerformerData {
  role: string;
  displayName: string;
  userId?: string;
  permissions: string[];
}

const performerRoles = [
  { id: 'dj', icon: Music, color: 'venue-dialog-icon--blue' },
  { id: 'host', icon: Mic2, color: 'venue-dialog-icon--cyan' },
  { id: 'singer', icon: MicVocal, color: 'venue-dialog-icon--rose' },
  { id: 'rapper', icon: Mic, color: 'venue-dialog-icon--gold' },
  { id: 'entertainer', icon: Sparkles, color: 'venue-dialog-icon--green' },
];

const availablePermissions = [
  { id: 'live_video', icon: Video, labelKey: 'live_video_label', descKey: 'live_video_desc' },
  { id: 'display_takeover', icon: Monitor, labelKey: 'display_label', descKey: 'display_desc' },
];

const PerformerInviteModal = ({
  isOpen,
  onClose,
  onInvite,
  venueId,
}: PerformerInviteModalProps) => {
  const { t } = useTranslation('venue');
  const [step, setStep] = useState<'role' | 'details'>('role');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(['live_video', 'display_takeover']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectRole = (roleId: string) => {
    setSelectedRole(roleId);
    setStep('details');
  };

  const togglePermission = (permId: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permId) 
        ? prev.filter(p => p !== permId)
        : [...prev, permId]
    );
  };

  const handleInvite = async () => {
    if (!selectedRole || !displayName.trim()) {
      toast.error(t('performer_modal.errors.name_required'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onInvite({
        role: selectedRole,
        displayName: displayName.trim(),
        permissions: selectedPermissions,
      });
      toast.success(t('performer_modal.success', { name: displayName, role: t(`performer_modal.roles.${selectedRole}_label`) }));
      handleClose();
    } catch (error) {
      toast.error(t('performer_modal.errors.add_failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep('role');
    setSelectedRole(null);
    setDisplayName("");
    setSearchQuery("");
    setSelectedPermissions(['live_video', 'display_takeover']);
    onClose();
  };

  const selectedRoleData = performerRoles.find(r => r.id === selectedRole);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="venue-dialog-surface max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            {step === 'role' ? (
              <>
                <Sparkles className="w-5 h-5 text-cyan-400" />
                {t('performer_modal.add_guest')}
              </>
            ) : (
              <>
                {selectedRoleData && (
                  <div className={`w-8 h-8 rounded-full ${selectedRoleData.color} flex items-center justify-center`}>
                    <selectedRoleData.icon className="w-4 h-4 text-white" />
                  </div>
                )}
                {t('performer_modal.add_role', { role: selectedRoleData ? t(`performer_modal.roles.${selectedRoleData.id}_label`) : '' })}
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {step === 'role'
              ? t('performer_modal.role_subtitle')
              : t('performer_modal.details_subtitle')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          {step === 'role' ? (
            <div className="space-y-3 py-2">
              {performerRoles.map((role) => {
                const Icon = role.icon;
                return (
                  <Card 
                    key={role.id}
                    className="bg-slate-800/50 border-slate-700 hover:border-primary/50 transition-all cursor-pointer group"
                    onClick={() => handleSelectRole(role.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-full ${role.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-semibold text-lg">{t(`performer_modal.roles.${role.id}_label`)}</p>
                        <p className="text-slate-400 text-sm">{t(`performer_modal.roles.${role.id}_desc`)}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {/* Display Name */}
              <div className="space-y-2">
                <Label className="text-slate-300">{t('performer_modal.display_name')}</Label>
                <Input
                  placeholder={t('performer_modal.display_name_placeholder')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white"
                />
                <p className="text-xs text-slate-500">{t('performer_modal.display_name_hint')}</p>
              </div>

              {/* Search for existing user (optional) */}
              <div className="space-y-2">
                <Label className="text-slate-400 text-sm">{t('performer_modal.link_user_label')}</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    placeholder={t('performer_modal.link_search_placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white pl-10"
                  />
                </div>
                <p className="text-xs text-slate-500">{t('performer_modal.link_hint')}</p>
              </div>

              {/* Permissions */}
              <div className="space-y-3">
                <Label className="text-slate-300">{t('performer_modal.permissions')}</Label>
                {availablePermissions.map((perm) => {
                  const Icon = perm.icon;
                  const isSelected = selectedPermissions.includes(perm.id);
                  return (
                    <Card 
                      key={perm.id}
                      className={`border transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-primary/10 border-primary/50' 
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                      onClick={() => togglePermission(perm.id)}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => togglePermission(perm.id)}
                        />
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-primary' : 'text-slate-400'}`} />
                        <div className="flex-1">
                          <p className={`font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {t(`performer_modal.perms.${perm.labelKey}`)}
                          </p>
                          <p className="text-xs text-slate-500">{t(`performer_modal.perms.${perm.descKey}`)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-700 flex gap-3">
          {step === 'details' && (
            <Button
              variant="outline"
              onClick={() => setStep('role')}
              className="border-slate-600 text-slate-300"
            >
              {t('common:actions.back', 'Back')}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleClose}
            className="venue-dialog-secondary-action flex-1"
          >
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          {step === 'details' && (
            <Button
              onClick={handleInvite}
              disabled={!displayName.trim() || isSubmitting}
              className="venue-dialog-primary-action flex-1"
            >
              {isSubmitting ? (
                <motion.div
                  className="w-5 h-5 rounded-full border-2 border-white border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {t('performer_modal.add_performer')}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PerformerInviteModal;

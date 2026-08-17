import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';

interface FollowerProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
}

interface FollowersListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  users: FollowerProfile[];
}

const FollowersListModal = ({ isOpen, onClose, title, users }: FollowersListModalProps) => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  const handleUserClick = (userId: string) => {
    onClose();
    navigate(`/app/user/${userId}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="customer-dialog-surface p-0 max-h-[70vh] overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white">{title}</h2>
        </div>
        <div className="overflow-y-auto max-h-[60vh]">
          {users.length === 0 ? (
            <div className="py-12 text-center">
              <User className="w-10 h-10 mx-auto text-white/20 mb-2" />
              <p className="text-white/40 text-sm">{t('followers_modal.no_yet', { title: title.toLowerCase() })}</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {users.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => handleUserClick(u.user_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                >
                  <Avatar className="w-11 h-11 ring-1 ring-white/10">
                    <AvatarImage src={u.avatar_url || undefined} />
                    <AvatarFallback className="bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)] text-sm font-bold">
                      {(u.display_name || "A")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {u.display_name || t('followers_modal.anonymous')}
                    </p>
                    {u.location && (
                      <p className="text-white/40 text-xs flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        {u.location}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FollowersListModal;

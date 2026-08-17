import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, X, Check, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from 'react-i18next';

interface TaggedFriend {
  id: string;
  display_name: string;
  avatar_url?: string;
}

interface TagFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFriends: TaggedFriend[];
  onSelectFriends: (friends: TaggedFriend[]) => void;
}

const TagFriendsModal = ({
  isOpen,
  onClose,
  selectedFriends,
  onSelectFriends,
}: TagFriendsModalProps) => {
  const { t } = useTranslation('feed');
  const [searchQuery, setSearchQuery] = useState("");
  const [friends, setFriends] = useState<TaggedFriend[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSelected, setLocalSelected] = useState<TaggedFriend[]>(selectedFriends);

  useEffect(() => {
    if (isOpen) {
      setLocalSelected(selectedFriends);
      fetchFriends();
    }
  }, [isOpen, selectedFriends]);

  const fetchFriends = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get connected friends
      const { data: connections } = await supabase
        .from('user_connections')
        .select('connected_user_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      if (connections && connections.length > 0) {
        const friendIds = connections.map(c => c.connected_user_id);
        const { data: profiles } = await supabase
          .from('customer_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', friendIds);

        if (profiles) {
          setFriends(profiles.map(p => ({
            id: p.user_id,
            display_name: p.display_name || 'User',
            avatar_url: p.avatar_url || undefined,
          })));
        }
      } else {
        // Fallback: show some profiles if no connections
        const { data: profiles } = await supabase
          .from('customer_profiles')
          .select('user_id, display_name, avatar_url')
          .not('user_id', 'eq', user.id)
          .limit(20);

        if (profiles) {
          setFriends(profiles.map(p => ({
            id: p.user_id,
            display_name: p.display_name || 'User',
            avatar_url: p.avatar_url || undefined,
          })));
        }
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFriend = (friend: TaggedFriend) => {
    const isSelected = localSelected.some(f => f.id === friend.id);
    if (isSelected) {
      setLocalSelected(localSelected.filter(f => f.id !== friend.id));
    } else {
      setLocalSelected([...localSelected, friend]);
    }
  };

  const handleDone = () => {
    onSelectFriends(localSelected);
    onClose();
  };

  const filteredFriends = friends.filter(f =>
    f.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="customer-dialog-surface">
        <DialogHeader>
          <DialogTitle className="text-[var(--customer-modal-text)] flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[var(--customer-modal-cyan)]" />
            {t("friends.tag_friends")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--customer-modal-faint)]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("friends.search_friends")}
              className="customer-modal-field pl-10"
            />
          </div>

          {/* Selected Friends */}
          {localSelected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {localSelected.map(friend => (
                <div
                  key={friend.id}
                  className="flex items-center gap-2 px-2 py-1 bg-[var(--customer-modal-cyan-soft)] border border-[var(--customer-modal-cyan)] rounded-full"
                >
                  <Avatar className="w-5 h-5">
                    <AvatarImage src={friend.avatar_url} />
                    <AvatarFallback className="bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)] text-[10px]">
                      {friend.display_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-[var(--customer-modal-text)]">{friend.display_name}</span>
                  <button
                    onClick={() => toggleFriend(friend)}
                    className="p-0.5 hover:bg-[var(--customer-modal-raised)] rounded-full"
                  >
                    <X className="w-3 h-3 text-[var(--customer-modal-cyan)]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Friends List */}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {loading ? (
              <div className="text-center py-8 text-[var(--customer-modal-faint)]">{t("friends.loading_friends")}</div>
            ) : filteredFriends.length === 0 ? (
              <div className="text-center py-8 text-[var(--customer-modal-faint)]">
                {searchQuery ? t("friends.no_friends_found") : t("friends.no_friends_yet")}
              </div>
            ) : (
              filteredFriends.map(friend => {
                const isSelected = localSelected.some(f => f.id === friend.id);
                return (
                  <button
                    key={friend.id}
                    onClick={() => toggleFriend(friend)}
                    className={`customer-modal-list-item w-full flex items-center gap-3 p-2 transition-colors ${
                      isSelected 
                        ? 'is-selected' 
                        : ''
                    }`}
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={friend.avatar_url} />
                      <AvatarFallback className="bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)]">
                        {friend.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-left text-[var(--customer-modal-text)]">{friend.display_name}</span>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-[var(--customer-modal-cyan)] flex items-center justify-center">
                        <Check className="w-4 h-4 text-[var(--customer-modal-canvas)]" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Done Button */}
          <Button
            onClick={handleDone}
            className="customer-modal-primary w-full"
          >
            {t("common:actions.done")} {localSelected.length > 0 && `(${localSelected.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TagFriendsModal;

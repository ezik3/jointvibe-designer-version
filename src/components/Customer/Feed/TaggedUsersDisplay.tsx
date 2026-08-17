import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Users } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface TaggedUser {
  id: string;
  username: string;
  avatar_url?: string;
  age?: number;
  relationship_status?: string;
  location?: string;
  connection_count?: number;
}

interface TaggedUsersDisplayProps {
  users: TaggedUser[];
  maxDisplay?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const TaggedUsersDisplay = ({ 
  users, 
  maxDisplay = 5, 
  size = "md",
  showLabel = true 
}: TaggedUsersDisplayProps) => {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const [showAllUsers, setShowAllUsers] = useState(false);

  if (users.length === 0) return null;

  const displayUsers = users.slice(0, maxDisplay);
  const remainingCount = users.length - maxDisplay;

  const sizeClasses = {
    sm: "w-6 h-6 ring-1",
    md: "w-8 h-8 ring-2",
    lg: "w-10 h-10 ring-2",
  };

  const avatarSize = sizeClasses[size];

  const handleUserClick = (userId: string) => {
    navigate(`/app/user/${userId}`);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {showLabel && <span className="text-[var(--customer-modal-muted)] text-sm">with</span>}
        
        {/* Avatar Stack */}
        <div className="flex -space-x-2">
          {displayUsers.map((user, index) => (
            <button
              key={user.id}
              onClick={() => handleUserClick(user.id)}
              className={`${avatarSize} rounded-full ring-[var(--customer-modal-line)] hover:ring-[var(--customer-modal-cyan)] hover:z-10 transition-all hover:scale-110`}
              style={{ zIndex: displayUsers.length - index }}
            >
              <Avatar className="w-full h-full">
                <AvatarImage src={user.avatar_url} alt={user.username} className="object-cover" />
                <AvatarFallback className="bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)] text-xs font-bold">
                  {user.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          ))}
        </div>

        {/* Remaining Count */}
        {remainingCount > 0 && (
          <button
            onClick={() => setShowAllUsers(true)}
            className="text-[var(--customer-modal-muted)] text-sm hover:text-[var(--customer-modal-cyan)] transition-colors"
          >
            and {remainingCount} {remainingCount === 1 ? 'other' : 'others'}
          </button>
        )}
      </div>

      {/* All Tagged Users Modal */}
      <Dialog open={showAllUsers} onOpenChange={setShowAllUsers}>
        <DialogContent className="customer-dialog-surface p-6 max-w-sm">
          <h3 className="text-lg font-bold text-[var(--customer-modal-text)] mb-4">Tagged in this post</h3>
          <div className="flex flex-wrap gap-3">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  setShowAllUsers(false);
                  handleUserClick(user.id);
                }}
                className="customer-modal-list-item flex flex-col items-center gap-1 p-2 transition-all"
              >
                <Avatar className="w-12 h-12 ring-2 ring-[var(--customer-modal-line)] hover:ring-[var(--customer-modal-cyan)] transition-all">
                  <AvatarImage src={user.avatar_url} alt={user.username} className="object-cover" />
                  <AvatarFallback className="bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)] text-sm font-bold">
                    {user.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-[var(--customer-modal-text)] truncate max-w-[60px]">{user.username}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TaggedUsersDisplay;

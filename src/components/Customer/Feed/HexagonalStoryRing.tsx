import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from 'react-i18next';

interface StoryUser {
  id: string;
  username: string;
  avatar_url?: string;
  isGold?: boolean;
  hasUnseenStory?: boolean;
  expiresIn?: number; // hours
  city?: string;
  distance?: number; // km
  isOnline?: boolean;
  isLive?: boolean; // NEW: actively broadcasting
  postedAt?: Date;
}

interface HexagonalStoryRingProps {
  users: StoryUser[];
  onUserClick: (user: StoryUser) => void;
}

const HexagonalStoryRing = ({ users, onUserClick }: HexagonalStoryRingProps) => {
  const { t } = useTranslation('feed');
  // Sort users: closest first when scrolling right-to-left (default order)
  // Most recent posts appear first (closest), older/seen posts appear further right
  const sortedUsers = [...users].sort((a, b) => {
    // First by hasUnseenStory (unseen first)
    if (a.hasUnseenStory && !b.hasUnseenStory) return -1;
    if (!a.hasUnseenStory && b.hasUnseenStory) return 1;
    
    // Then by distance (closest first for unseen, furthest first for seen)
    const distA = a.distance ?? 999;
    const distB = b.distance ?? 999;
    
    if (a.hasUnseenStory && b.hasUnseenStory) {
      return distA - distB; // Closest unseen posts first
    }
    
    // For seen posts, show older/further ones when scrolling right
    return distB - distA;
  });

  return (
    <div className="flex gap-4 sm:gap-5 overflow-x-auto scrollbar-hide py-3 px-4 sm:px-6">
      {sortedUsers.map((user) => {
        const ringClass = user.isGold
          ? "bg-[conic-gradient(from_180deg,hsl(var(--gold)),hsl(var(--orange)),hsl(var(--gold)))] shadow-[0_0_18px_hsl(var(--gold)/0.35)]"
          : user.hasUnseenStory
          ? "bg-[conic-gradient(from_140deg,hsl(var(--cyan)),hsl(var(--purple)),hsl(var(--pink)),hsl(var(--cyan)))] shadow-[0_0_18px_hsl(var(--primary)/0.28)]"
          : "bg-white/[0.12]";

        return (
          <button
            key={user.id}
            onClick={() => onUserClick(user)}
            className="flex-shrink-0 group"
            aria-label={`Open ${user.username}'s story`}
          >
            {/* Stitch-style story card */}
            <div className="relative">
              <div
                className={`w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-2xl p-[2.5px] transition-transform duration-200 group-hover:scale-105 ${ringClass}`}
              >
                <div className="w-full h-full rounded-[14px] bg-background/70 backdrop-blur-xl ring-1 ring-inset ring-white/[0.06] overflow-hidden">
                  <Avatar className="w-full h-full rounded-[12px]">
                    <AvatarImage
                      src={user.avatar_url}
                      className="object-cover w-full h-full"
                    />
                    <AvatarFallback className="bg-muted text-foreground font-semibold">
                      {user.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>

              {/* LIVE badge */}
              {user.isLive && (
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-red-500 px-1.5 py-[1px] rounded-full z-10 shadow-[0_0_10px_rgba(239,68,68,0.6)]">
                  <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-[8px] font-bold leading-none">LIVE</span>
                </div>
              )}
              {/* Subtle online dot (top-right) */}
              {!user.isLive && user.isOnline && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-background shadow-[0_0_10px_rgba(16,185,129,0.45)]" />
              )}
            </div>

            {/* Labels */}
            <div className="mt-2">
              <div className="text-[11px] sm:text-[12px] font-medium text-foreground/80 truncate max-w-[76px] sm:max-w-[84px]">
                {user.username}
              </div>
              {user.distance !== undefined && (
                <div className="text-[10px] sm:text-[11px] text-cyan/80 truncate">
                  • {user.distance}km
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default HexagonalStoryRing;

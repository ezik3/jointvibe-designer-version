import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import { useTranslation } from 'react-i18next';

interface NearbyUser {
  id: string;
  username: string;
  avatar_url?: string;
  distance?: number;
  isGold?: boolean;
  tier?: string;
}

interface NearbyUsersCarouselProps {
  users: NearbyUser[];
  onUserClick: (user: NearbyUser) => void;
}

const NearbyUsersCarousel = ({ users, onUserClick }: NearbyUsersCarouselProps) => {
  const { t } = useTranslation('feed');
  if (users.length === 0) {
    return (
      <div className="bg-black/80 backdrop-blur-xl py-6 px-4 text-center">
        <p className="text-muted-foreground text-sm">{t('nearby.no_public_profiles')}</p>
        <p className="text-muted-foreground/60 text-xs mt-1">{t('nearby.will_appear_here')}</p>
      </div>
    );
  }

  return (
    <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 py-4">
      <ScrollArea className="w-full">
        <div className="flex gap-4 px-4">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => onUserClick(user)}
              className="flex flex-col items-center gap-2 min-w-[80px] group"
            >
              <div className={`relative p-0.5 rounded-full ${
                user.isGold 
                  ? "bg-gradient-to-br from-yellow-400 via-amber-300 to-yellow-500 shadow-[0_0_20px_rgba(255,215,0,0.5)]" 
                  : "bg-gradient-to-br from-neon-purple via-neon-pink to-neon-cyan"
              }`}>
                <Avatar className="w-16 h-16 ring-2 ring-black">
                  <AvatarImage src={user.avatar_url} className="object-cover" />
                  <AvatarFallback className="bg-gradient-to-br from-neon-purple to-neon-pink text-white text-lg font-bold">
                    {user.username?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                {user.isGold && (
                  <div className="absolute -top-1 -right-1 text-lg">⭐</div>
                )}
              </div>
              <div className="flex flex-col items-center">
                <span className="text-white text-xs font-medium truncate max-w-[70px] group-hover:text-neon-cyan transition-colors">
                  {user.username}
                </span>
                {user.tier && user.tier !== "member" && (
                  <TierBadge tier={user.tier as TierName} size="sm" showLabel={false} />
                )}
                {user.distance !== undefined && (
                  <span className="text-muted-foreground text-[10px]">
                    {t('nearby.km_away', { distance: user.distance.toFixed(1) })}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </div>
  );
};

export default NearbyUsersCarousel;

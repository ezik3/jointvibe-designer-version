import { Star, TrendingUp, MapPin } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import FollowButton from "@/components/Customer/FollowButton";
import { useTranslation } from 'react-i18next';

interface RisingCreator {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string;
  location?: string;
  follower_count: number;
}

interface RisingCreatorsSectionProps {
  creators: RisingCreator[];
  loading?: boolean;
}

const RisingCreatorsSection = ({ creators, loading }: RisingCreatorsSectionProps) => {
  const { t } = useTranslation('feed');
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-28 h-36 rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (creators.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          <h3 className="font-semibold text-white">{t("discover.rising_creators")}</h3>
        </div>
        <div className="p-6 text-center bg-white/5 rounded-xl border border-white/10">
          <p className="text-white/50 text-sm">{t("discover.no_rising_creators")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Star className="w-5 h-5 text-yellow-500" />
        <h3 className="font-semibold text-white">{t("discover.rising_creators")}</h3>
        <TrendingUp className="w-4 h-4 text-green-500" />
      </div>
      
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
        {creators.slice(0, 8).map((creator, index) => (
          <div
            key={creator.id}
            className="relative w-28 flex-shrink-0 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-cyan/30 transition-colors cursor-pointer group"
          >
            {/* Rank badge */}
            {index < 3 && (
              <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg ${
                index === 0 ? "bg-yellow-500 text-black" :
                index === 1 ? "bg-gray-300 text-black" :
                "bg-orange-600 text-white"
              }`}>
                {index + 1}
              </div>
            )}
            
            {/* Avatar */}
            <div className="flex justify-center mb-2">
              <Avatar className="w-14 h-14 ring-2 ring-cyan/50 group-hover:ring-cyan transition-all">
                <AvatarImage src={creator.avatar_url} />
                <AvatarFallback className="bg-gradient-to-br from-purple to-pink text-white text-lg">
                  {creator.display_name?.[0]}
                </AvatarFallback>
              </Avatar>
            </div>
            
            {/* Info */}
            <div className="text-center">
              <h4 className="text-white text-xs font-semibold truncate">{creator.display_name}</h4>
              {creator.location && (
                <div className="flex items-center justify-center gap-0.5 text-white/40 text-[9px] mt-0.5">
                  <MapPin className="w-2 h-2" />
                  <span className="truncate">{creator.location}</span>
                </div>
              )}
              <div className="flex items-center justify-center gap-1 text-green-500 text-[10px] font-medium mt-1">
                <TrendingUp className="w-2.5 h-2.5" />
                <span>{t("discover.followers_this_week", { count: creator.follower_count })}</span>
              </div>
            </div>
            
            {/* Follow button */}
            <div className="mt-2">
              <FollowButton 
                targetUserId={creator.user_id} 
                variant="compact"
                className="w-full text-[10px] py-1"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RisingCreatorsSection;

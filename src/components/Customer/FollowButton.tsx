import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useFollowActions } from "@/hooks/useFollowers";
import { useAuth } from "@/contexts/AuthContext";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface FollowButtonProps {
  targetUserId: string;
  variant?: "default" | "compact" | "icon";
  className?: string;
  onFollowChange?: (isFollowing: boolean) => void;
}

const FollowButton = ({ 
  targetUserId, 
  variant = "default",
  className,
  onFollowChange,
}: FollowButtonProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { isFollowingMap, checkIsFollowing, toggleFollow } = useFollowActions();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const isFollowing = isFollowingMap[targetUserId] || false;
  const isSelf = user?.id === targetUserId;

  useEffect(() => {
    const check = async () => {
      if (targetUserId && !isSelf) {
        await checkIsFollowing(targetUserId);
      }
      setInitialLoading(false);
    };
    check();
  }, [targetUserId, isSelf, checkIsFollowing]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.error(t('follow.sign_in_required'));
      return;
    }
    if (isSelf) return;

    setLoading(true);
    const success = await toggleFollow(targetUserId);
    setLoading(false);

    if (success) {
      const newFollowState = !isFollowing;
      toast.success(newFollowState ? t('follow.following_now') : t('follow.unfollowed'));
      onFollowChange?.(newFollowState);
    } else {
      toast.error(t('follow.update_failed'));
    }
  };

  if (isSelf || !targetUserId) return null;

  if (initialLoading) {
    return (
      <Button 
        variant="ghost" 
        size={variant === "icon" ? "icon" : "sm"}
        disabled
        className={className}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "w-8 h-8 rounded-full transition-all",
          isFollowing 
            ? "bg-white/10 text-white hover:bg-white/20" 
            : "bg-cyan/20 text-cyan hover:bg-cyan/30",
          className
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isFollowing ? (
          <UserCheck className="w-4 h-4" />
        ) : (
          <UserPlus className="w-4 h-4" />
        )}
      </Button>
    );
  }

  if (variant === "compact") {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "px-3 py-1 text-xs font-semibold rounded-full transition-all",
          isFollowing 
            ? "bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400" 
            : "bg-cyan text-black hover:bg-cyan/80",
          className
        )}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isFollowing ? (
          t('follow.following')
        ) : (
          t('follow.follow')
        )}
      </button>
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant={isFollowing ? "outline" : "default"}
      size="sm"
      className={cn(
        "transition-all",
        isFollowing 
          ? "border-white/20 text-white hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/10" 
          : "bg-gradient-to-r from-cyan to-primary text-white",
        className
      )}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : isFollowing ? (
        <UserCheck className="w-4 h-4 mr-2" />
      ) : (
        <UserPlus className="w-4 h-4 mr-2" />
      )}
      {isFollowing ? t('follow.following') : t('follow.follow')}
    </Button>
  );
};

export default FollowButton;

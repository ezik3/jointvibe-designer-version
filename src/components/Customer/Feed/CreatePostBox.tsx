import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from 'react-i18next';

interface CreatePostBoxProps {
  userAvatar?: string;
  userName?: string;
  onClick: () => void;
}

const CreatePostBox = ({ userAvatar, userName, onClick }: CreatePostBoxProps) => {
  const { t } = useTranslation('feed');
  return (
    <button
      onClick={onClick}
      className="w-full bg-white/95 dark:bg-black/60 backdrop-blur-xl rounded-2xl p-4 flex items-center gap-4 ring-1 ring-white/10 hover:ring-neon-purple/50 transition-all duration-300 shadow-lg hover:shadow-neon-purple/10"
    >
      <div className="relative">
        <Avatar className="w-12 h-12 ring-2 ring-neon-purple">
          <AvatarImage src={userAvatar} />
          <AvatarFallback className="bg-gradient-to-br from-neon-purple to-neon-pink text-white font-bold">
            {userName?.[0]?.toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-neon-cyan rounded-full flex items-center justify-center ring-2 ring-white dark:ring-black">
          <span className="text-[10px] font-bold text-black">+</span>
        </div>
      </div>
      <span className="text-muted-foreground text-sm flex-1 text-left">
        {t("composer.whats_the_vibe")}
      </span>
    </button>
  );
};

export default CreatePostBox;

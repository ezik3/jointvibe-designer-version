import { motion } from "framer-motion";
import FloatingOrb from "./FloatingOrb";
import { Utensils, MessageSquare, Users, Music, Video, Bot } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface OrbsLayerProps {
  onMenuClick?: () => void;
  onChatClick?: () => void;
  onTableClick?: () => void;
  onDJClick?: () => void;
  onFeedClick?: () => void;
  onAIClick?: () => void;
}

const OrbsLayer = ({
  onMenuClick,
  onChatClick,
  onTableClick,
  onDJClick,
  onFeedClick,
  onAIClick,
}: OrbsLayerProps) => {
  const { t } = useTranslation('common');
  const orbs = [
    {
      icon: <Utensils className="w-6 h-6 sm:w-7 sm:h-7" />,
      label: "Menu",
      color: "hsl(var(--cyan))",
      glowColor: "rgba(0, 217, 255, 0.4)",
      onClick: onMenuClick || (() => toast.info("Menu feature coming soon!")),
    },
    {
      icon: <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7" />,
      label: "Chat",
      color: "hsl(var(--purple))",
      glowColor: "rgba(168, 85, 247, 0.4)",
      onClick: onChatClick || (() => toast.info("Chat feature coming soon!")),
    },
    {
      icon: <Bot className="w-6 h-6 sm:w-7 sm:h-7" />,
      label: "AI Waiter",
      color: "hsl(var(--gold))",
      glowColor: "rgba(251, 191, 36, 0.4)",
      onClick: onAIClick || (() => toast.info("AI Waiter feature coming soon!")),
    },
    {
      icon: <Users className="w-6 h-6 sm:w-7 sm:h-7" />,
      label: "My Table",
      color: "#14B8A6",
      glowColor: "rgba(20, 184, 166, 0.4)",
      onClick: onTableClick || (() => toast.info("My Table feature coming soon!")),
    },
    {
      icon: <Music className="w-6 h-6 sm:w-7 sm:h-7" />,
      label: "DJ Booth",
      color: "#9333EA",
      glowColor: "rgba(147, 51, 234, 0.4)",
      onClick: onDJClick || (() => toast.info("DJ Booth feature coming soon!")),
    },
    {
      icon: <Video className="w-6 h-6 sm:w-7 sm:h-7" />,
      label: "Live Feed",
      color: "hsl(var(--pink))",
      glowColor: "rgba(236, 72, 153, 0.4)",
      onClick: onFeedClick || (() => toast.info("Live Feed feature coming soon!")),
    },
  ];

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none">
      <motion.div
        className="grid grid-cols-3 gap-4 sm:gap-8 pointer-events-auto"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        {orbs.map((orb, index) => (
          <FloatingOrb
            key={orb.label}
            icon={orb.icon}
            label={orb.label}
            color={orb.color}
            glowColor={orb.glowColor}
            delay={index * 0.1}
            onClick={orb.onClick}
          />
        ))}
      </motion.div>
    </div>
  );
};

export default OrbsLayer;

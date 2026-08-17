import { motion } from "framer-motion";
import { Sparkles, Compass, MapPin, Radio, Users } from "lucide-react";
import { useTranslation } from 'react-i18next';

type TabId = "foryou" | "explore" | "city" | "live" | "following";

interface ExploreTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; labelKey: string; icon: React.ElementType }[] = [
  { id: "foryou", labelKey: "common:navigation.for_you", icon: Sparkles },
  { id: "explore", labelKey: "common:navigation.explore", icon: Compass },
  { id: "city", labelKey: "common:navigation.city", icon: MapPin },
  { id: "live", labelKey: "common:navigation.live", icon: Radio },
  { id: "following", labelKey: "common:navigation.following", icon: Users },
];

const ExploreTabs = ({ activeTab, onTabChange }: ExploreTabsProps) => {
  const { t } = useTranslation('common');
  return (
    <div className="flex overflow-x-auto scrollbar-hide border-b border-white/10 px-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
              isActive ? "text-white" : "text-white/50 hover:text-white/70"
            }`}
          >
            <Icon className={`w-4 h-4 ${tab.id === "live" && isActive ? "text-red-500" : ""}`} />
            <span>{t(tab.labelKey)}</span>
            {isActive && (
              <motion.div
                layoutId="exploreActiveTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan to-primary"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            {tab.id === "live" && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ExploreTabs;

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Compass } from "lucide-react";
import { Input } from "@/components/ui/input";
import ExploreTabs from "./ExploreTabs";
import TrendingSection from "./TrendingSection";
import HotVenuesSection from "./HotVenuesSection";
import LiveNowSection from "./LiveNowSection";
import RisingCreatorsSection from "./RisingCreatorsSection";
import ForYouFeed from "./ForYouFeed";
import FollowingFeed from "./FollowingFeed";
import CityFeed from "./CityFeed";
import { useExploreData, useFollowingFeed } from "@/hooks/useExploreData";
import SwipeHintFinger, { markSwipeHintSeen } from "./SwipeHintFinger";
import { useActiveDeals } from "@/hooks/useActiveDeals";
import DealCard from "@/components/Customer/Deals/DealCard";
import { useTranslation } from 'react-i18next';

interface ExplorePanelProps {
  isOpen: boolean;
  onClose: () => void;
  userCity?: string;
}

type TabId = "foryou" | "explore" | "city" | "live" | "following";

const EXPLORE_BACK_HINT_KEY = "jv_explore_back_hint_seen";

const ExplorePanel = ({ isOpen, onClose, userCity = "Brisbane" }: ExplorePanelProps) => {
  const { t } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<TabId>("explore");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBackHint, setShowBackHint] = useState(false);
  
  const { trendingPosts, hotVenues, liveStreams, risingCreators, loading } = useExploreData(userCity);
  const { posts: followingPosts, loading: followingLoading } = useFollowingFeed();
  const { deals: exploreDeals, recordImpression: recordExploreImpression, redeemDeal: redeemExploreDeal, snoozeDeal: snoozeExploreDeal } = useActiveDeals('explore', 3);
  const { deals: liveDeals, recordImpression: recordLiveImpression, redeemDeal: redeemLiveDeal, snoozeDeal: snoozeLiveDeal } = useActiveDeals('explore', 2);

  // Show back hint when panel opens (if not seen before)
  useEffect(() => {
    if (isOpen) {
      const hasSeenHint = localStorage.getItem(EXPLORE_BACK_HINT_KEY);
      if (!hasSeenHint) {
        setShowBackHint(true);
      }
    } else {
      setShowBackHint(false);
    }
  }, [isOpen]);

  // Mark back hint as seen when panel closes
  const handleClose = () => {
    markSwipeHintSeen(EXPLORE_BACK_HINT_KEY);
    setShowBackHint(false);
    onClose();
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "foryou":
        return <ForYouFeed posts={trendingPosts} loading={loading} />;
      case "explore":
        return (
          <div className="space-y-6">
            <TrendingSection posts={trendingPosts} city={userCity} loading={loading} />
            {exploreDeals.length > 0 && (
              <DealCard
                deal={exploreDeals[0]}
                variant="full"
                onImpression={() => recordExploreImpression(exploreDeals[0].id, exploreDeals[0].venue_id)}
                onRedeem={() => redeemExploreDeal(exploreDeals[0].id, exploreDeals[0].venue_id)}
                onSnooze={snoozeExploreDeal}
              />
            )}
            <HotVenuesSection venues={hotVenues} loading={loading} />
            {exploreDeals.length > 1 && (
              <DealCard
                deal={exploreDeals[1]}
                variant="full"
                onImpression={() => recordExploreImpression(exploreDeals[1].id, exploreDeals[1].venue_id)}
                onRedeem={() => redeemExploreDeal(exploreDeals[1].id, exploreDeals[1].venue_id)}
                onSnooze={snoozeExploreDeal}
              />
            )}
            <LiveNowSection streams={liveStreams} loading={loading} />
            {exploreDeals.length > 2 && (
              <DealCard
                deal={exploreDeals[2]}
                variant="full"
                onImpression={() => recordExploreImpression(exploreDeals[2].id, exploreDeals[2].venue_id)}
                onRedeem={() => redeemExploreDeal(exploreDeals[2].id, exploreDeals[2].venue_id)}
                onSnooze={snoozeExploreDeal}
              />
            )}
            <RisingCreatorsSection creators={risingCreators} loading={loading} />
          </div>
        );
      case "city":
        return <CityFeed city={userCity} posts={trendingPosts} loading={loading} />;
      case "live":
        return (
          <div className="space-y-4">
            <LiveNowSection streams={liveStreams} loading={loading} fullView />
            {liveDeals.length > 0 && (
              <div className="space-y-3">
                {liveDeals.map(deal => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    variant="full"
                    onImpression={() => recordLiveImpression(deal.id, deal.venue_id)}
                    onRedeem={() => redeemLiveDeal(deal.id, deal.venue_id)}
                    onSnooze={snoozeLiveDeal}
                  />
                ))}
              </div>
            )}
          </div>
        );
      case "following":
        return <FollowingFeed posts={followingPosts} loading={followingLoading} />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="customer-modal-overlay fixed inset-0 z-50"
          />
          
          {/* Full-screen Panel */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 bg-[var(--customer-modal-surface)] text-[var(--customer-modal-text)] z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--customer-modal-line)]">
              <div className="flex items-center gap-2">
                <Compass className="w-6 h-6 text-cyan" />
                <h2 className="text-lg font-bold text-[var(--customer-modal-text)]">{t("common:navigation.explore")}</h2>
              </div>
              <button
                onClick={handleClose}
                className="customer-modal-secondary w-8 h-8 p-0 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--customer-modal-faint)]" />
                <Input
                  placeholder={t("common:app.search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="customer-modal-field pl-10"
                />
              </div>
            </div>

            {/* Tabs */}
            <ExploreTabs activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Content */}
            <div className="flex-1 overflow-y-auto pb-20 scrollbar-hide">
              <div className="p-4">
                {renderTabContent()}
              </div>
            </div>
          </motion.div>

          {/* Back swipe hint - shows for 5 seconds on first open */}
          <SwipeHintFinger 
            direction="left" 
            storageKey={EXPLORE_BACK_HINT_KEY}
            show={showBackHint}
          />
        </>
      )}
    </AnimatePresence>
  );
};

export default ExplorePanel;

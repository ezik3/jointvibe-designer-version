import { Flame, Compass, Trophy, Building2, Map, Bell, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import ExplorePanel from "@/components/Customer/Explore/ExplorePanel";
import { useTranslation } from 'react-i18next';

const FeedHeader = () => {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const location = useLocation();
  const [exploreOpen, setExploreOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread notification count (includes messages)
  useEffect(() => {
    const fetchUnreadCount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { count } = await supabase
        .from("customer_notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      
      setUnreadCount(count || 0);
    };
    
    fetchUnreadCount();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(createRealtimeChannelTopic("header-notifications-count"))
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_notifications" }, fetchUnreadCount)
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, []);

  const navItems = [
    { icon: Flame, label: t("common:navigation.feed"), path: "/app/feed", action: () => navigate("/app/feed") },
    { icon: Compass, label: t("common:navigation.explore"), path: null, action: () => setExploreOpen(true) },
    { icon: Trophy, label: t("common:navigation.top10"), path: "/app/top10", action: () => navigate("/app/top10") },
    { icon: Building2, label: t("common:navigation.venues"), path: "/app/venues", action: () => navigate("/app/venues") },
    { icon: Map, label: t("common:navigation.maps"), path: "/app/maps", action: () => navigate("/app/maps") },
    { icon: Bell, label: t("common:navigation.alerts"), path: "/app/notifications", action: () => navigate("/app/notifications"), badge: unreadCount > 0 ? unreadCount : undefined },
    { icon: User, label: t("common:navigation.profile"), path: "/app/profile", action: () => navigate("/app/profile") },
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between px-2 py-2 max-w-2xl mx-auto overflow-x-auto scrollbar-hide">
          {navItems.map((item, index) => {
            const isActive = item.path && location.pathname === item.path;
            return (
              <button
                key={item.label}
                onClick={item.action}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-200 relative min-w-fit ${
                  isActive 
                    ? "bg-gradient-to-r from-neon-cyan/20 to-neon-purple/20 text-neon-cyan" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="relative">
                  <item.icon className={`w-5 h-5 ${isActive ? "drop-shadow-[0_0_8px_hsl(var(--neon-cyan))]" : ""}`} />
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-2 bg-neon-pink text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? "text-neon-cyan" : ""}`}>
                  {item.label}
                </span>
                {isActive && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-neon-cyan to-neon-purple rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
      
      {/* Explore Panel */}
      <ExplorePanel 
        isOpen={exploreOpen} 
        onClose={() => setExploreOpen(false)} 
      />
    </>
  );
};

export default FeedHeader;

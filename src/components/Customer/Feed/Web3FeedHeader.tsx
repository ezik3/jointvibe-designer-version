import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  Home, 
  Trophy, 
  Building2, 
  Map, 
  Bell, 
  User,
  Wallet,
  Footprints
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { useJVCoinWallet } from "@/hooks/useJVCoinWallet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import jvLogo from "@/assets/jv-logo.png";
import "../mobile-feed-navigation.css";

interface Web3FeedHeaderProps {
  visible?: boolean;
  onCreatePost?: () => void;
}

const Web3FeedHeader = ({ visible = true, onCreatePost }: Web3FeedHeaderProps) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { t } = useTranslation("common");
  const [alertCount, setAlertCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { formatCurrency, jvcToLocal } = useCurrency();
  const { balance } = useJVCoinWallet();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from("customer_profiles")
          .select("avatar_url")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      }
    };
    getUser();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const fetchUnreadCount = async () => {
      const { count, error } = await supabase
        .from("customer_notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false);

      if (!error && count !== null) {
        setAlertCount(count);
      }
    };

    fetchUnreadCount();

    // StrictMode can replay this effect before Supabase finishes removing the
    // previous channel, so each subscription needs its own topic.
    const subscriptionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`header-notifications-${userId}-${subscriptionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
  
  if (!isMobile) return null;

  const navItems = [
    { icon: Home,       key: "feed",    path: "/app/feed/immersive", badge: null },
    { icon: Trophy,     key: "top10",   path: "/app/top10",          badge: null },
    { icon: Building2,  key: "venues",  path: "/app/venues",         badge: null },
    { icon: Map,        key: "map",     path: "/app/maps",           badge: null },
    { icon: Bell,       key: "alerts",  path: "/app/notifications",  badge: alertCount > 0 ? alertCount : null },
    { icon: Footprints, key: "runner",  path: "/app/runner/request", badge: null },
  ];

  return (
    <nav
      className="customer-mobile-feed-header"
      style={{ transform: visible ? "translateY(0)" : "translateY(-100%)" }}
    >
      <div className="customer-mobile-feed-header__inner">
          <Link to="/app/feed/immersive" className="customer-mobile-feed-header__brand" aria-label="JointVibe home">
            <img src={jvLogo} alt="" />
            <span className="customer-mobile-feed-header__brand-label">JointVibe</span>
          </Link>

          <div className="customer-mobile-feed-header__links">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              const label = t(`navigation.${item.key}`);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`customer-mobile-feed-header__link${isActive ? " customer-mobile-feed-header__link--active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <div className="relative">
                    <Icon aria-hidden="true" />
                    {item.badge !== null && (
                      <span className="customer-mobile-feed-header__badge">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          <div className="customer-mobile-feed-header__actions">
            <Link 
              to="/app/wallet"
              className="customer-mobile-feed-header__wallet"
            >
              <Wallet aria-hidden="true" />
              <span>
                {formatCurrency(jvcToLocal(balance.jvc))}
              </span>
            </Link>

            <Link 
              to="/app/profile"
              className="customer-mobile-feed-header__profile"
              aria-label="Open profile"
            >
              <Avatar>
                {avatarUrl ? <AvatarImage src={avatarUrl} /> : null}
                <AvatarFallback><User aria-hidden="true" /></AvatarFallback>
              </Avatar>
            </Link>
          </div>
      </div>
    </nav>
  );
};

export default Web3FeedHeader;

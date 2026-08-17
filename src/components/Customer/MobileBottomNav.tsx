import { Link, useLocation } from "react-router-dom";
import { Sparkles, Compass, MapPin, Radio, Users } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "react-i18next";
import "./mobile-feed-navigation.css";

interface MobileBottomNavProps {
  visible?: boolean;
}

const tabs = [
  { id: "foryou",    key: "for_you",   icon: Sparkles, path: "/app/explore?tab=foryou" },
  { id: "explore",   key: "explore",   icon: Compass,  path: "/app/explore?tab=explore" },
  { id: "city",      key: "city",      icon: MapPin,   path: "/app/explore?tab=city" },
  { id: "live",      key: "live",      icon: Radio,    path: "/app/explore?tab=live" },
  { id: "following", key: "following", icon: Users,    path: "/app/explore?tab=following" },
];

const MobileBottomNav = ({ visible = true }: MobileBottomNavProps) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { t } = useTranslation();

  if (!isMobile) return null;

  const searchParams = new URLSearchParams(location.search);
  const currentTab = location.pathname === "/app/explore" ? (searchParams.get("tab") || "explore") : null;

  return (
    <nav
      className="customer-mobile-bottom-nav"
      style={{
        transform: visible ? "translateY(0)" : "translateY(100%)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="customer-mobile-bottom-nav__items">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          const isLive = tab.id === "live";

          return (
            <Link
              key={tab.id}
              to={tab.path}
              className={`customer-mobile-bottom-nav__item${isActive ? " customer-mobile-bottom-nav__item--active" : ""}`}
            >
              <div className="relative">
                <Icon aria-hidden="true" />
                {isLive && (
                  <span className="customer-mobile-bottom-nav__live-dot" />
                )}
              </div>
              <span>{t(`navigation.${tab.key}`)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;

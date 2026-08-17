import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Package, Clock, User, Settings } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface DriverLayoutProps {
  children: ReactNode;
}

const navItems = [
  { icon: Home, key: "dashboard", path: "/driver/dashboard" },
  { icon: Package, key: "deliveries", path: "/driver/deliveries" },
  { icon: Clock, key: "history", path: "/driver/history" },
  { icon: User, key: "profile", path: "/driver/profile" },
];

const DriverLayout = ({ children }: DriverLayoutProps) => {
  const { t } = useTranslation('common');
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Main Content */}
      <main className="flex-1 pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t border-border safe-area-inset-bottom">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className="relative flex flex-col items-center justify-center w-16 h-full"
              >
                {isActive && (
                  <motion.div
                    layoutId="driver-nav-indicator"
                    className="absolute -top-0.5 w-8 h-1 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <Icon 
                  className={`w-5 h-5 transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`} 
                />
                <span className={`text-xs mt-1 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {t(`driver.nav.${item.key}`)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default DriverLayout;

import { useState } from "react";
import { NavLink as RouterNavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Store,
  Wallet,
  Coins,
  ArrowUpDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  Snowflake,
  FileText,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Megaphone,
  Flag,
  Gift,
  Footprints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import jvLogo from "@/assets/jv-logo.png";
import { useTranslation } from 'react-i18next';

const navItems = [
  { icon: LayoutDashboard, key: "dashboard", href: "/admin/dashboard" },
  { icon: Users, key: "users", href: "/admin/users" },
  { icon: Store, key: "venues", href: "/admin/venues" },
  { icon: Flag, key: "venue_reports", href: "/admin/venue-reports" },
  { icon: Gift, key: "referrals", href: "/admin/referrals" },
  { icon: Megaphone, key: "ad_campaigns", href: "/admin/ad-campaigns" },
  { icon: Wallet, key: "treasury", href: "/admin/treasury" },
  { icon: ArrowUpDown, key: "mint_burn", href: "/admin/mint-burn" },
  { icon: Coins, key: "transactions", href: "/admin/transactions" },
  { icon: ArrowDownToLine, key: "deposits", href: "/admin/deposits" },
  { icon: ArrowUpFromLine, key: "withdrawals", href: "/admin/withdrawals" },
  { icon: Snowflake, key: "wallet_freezes", href: "/admin/wallet-freezes" },
  { icon: FileText, key: "audit_log", href: "/admin/audit-log" },
  { icon: Shield, key: "roles", href: "/admin/roles" },
  { icon: Settings, key: "settings", href: "/admin/settings" },
  { icon: Store, key: "venue_tiers", href: "/admin/venue-tiers" },
  { icon: Footprints, key: "runner_analytics", href: "/admin/runner-analytics" },
];

export default function AdminSidebar() {
  const { t } = useTranslation('admin');
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("jv_admin_token");
    navigate("/admin/login");
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <img src={jvLogo} alt="" className="h-6 w-6 rounded-md object-cover" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground text-sm">Joint Vibe</h1>
              <p className="text-[10px] text-muted-foreground">{t('sidebar.portal_subtitle')}</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <img src={jvLogo} alt="" className="h-6 w-6 rounded-md object-cover" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "p-1.5 rounded-md hover:bg-accent transition-colors",
            collapsed && "absolute -right-3 top-6 bg-sidebar border border-sidebar-border"
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <RouterNavLink
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-accent hover:text-foreground transition-all duration-200",
                isActive && "bg-primary/10 text-primary border-l-2 border-primary"
              )}
            >
              <item.icon className={cn("w-5 h-5 shrink-0", isActive && "text-primary")} />
              {!collapsed && <span className="truncate">{t(`nav.${item.key}`)}</span>}
            </RouterNavLink>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-sidebar-border">
        <div className={cn(
          "flex items-center gap-3 p-2 rounded-lg",
          collapsed ? "justify-center" : ""
        )}>
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-primary">SA</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{t('sidebar.super_admin')}</p>
              <p className="text-xs text-muted-foreground truncate">owner@jointvibe.com</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            "w-full mt-2 text-destructive hover:bg-destructive/10",
            collapsed ? "justify-center px-0" : "justify-start"
          )}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="ml-3">{t('sidebar.logout')}</span>}
        </Button>
      </div>
    </aside>
  );
}

import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  LayoutDashboard, 
  Megaphone, 
  Plus, 
  CreditCard, 
  BarChart3, 
  Settings,
  LogOut,
  Building2,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

const navItems = [
  { path: "/advertiser", icon: LayoutDashboard, key: "dashboard", exact: true },
  { path: "/advertiser/campaigns", icon: Megaphone, key: "campaigns" },
  { path: "/advertiser/campaigns/new", icon: Plus, key: "new_campaign" },
  { path: "/advertiser/analytics", icon: BarChart3, key: "analytics" },
  { path: "/advertiser/billing", icon: CreditCard, key: "billing" },
  { path: "/advertiser/settings", icon: Settings, key: "settings" },
];

export default function AdvertiserLayout() {
  const { t } = useTranslation('common');
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [advertiser, setAdvertiser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/advertiser/login");
      return;
    }

    // Only fetch once, not on every route change
    if (advertiser) {
      setLoading(false);
      return;
    }

    const fetchAdvertiser = async () => {
      const { data, error } = await supabase
        .from("advertisers")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        // Redirect to onboarding if no advertiser profile
        if (location.pathname !== "/advertiser/onboarding") {
          navigate("/advertiser/onboarding");
        }
      } else {
        setAdvertiser(data);
      }
      setLoading(false);
    };

    fetchAdvertiser();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/advertiser/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Allow onboarding page without advertiser profile
  if (location.pathname === "/advertiser/onboarding") {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform lg:transform-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border flex items-center justify-between">
            <Link to="/advertiser" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-bold text-foreground">JV Ads</h1>
                <p className="text-xs text-muted-foreground">{t('advertiser.portal_subtitle')}</p>
              </div>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = item.exact 
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path);
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{t(`advertiser.nav.${item.key}`)}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 px-4 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {advertiser?.company_name?.[0] || user?.email?.[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {advertiser?.company_name || t('advertiser.advertiser')}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
              {t('advertiser.sign_out')}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-background border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <Link to="/advertiser" className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <span className="font-bold">JV Ads</span>
            </Link>
            <div className="w-10" />
          </div>
        </header>

      {/* Page content - no remount on navigation */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
            <Outlet context={{ advertiser, setAdvertiser }} />
        </main>
      </div>
    </div>
  );
}

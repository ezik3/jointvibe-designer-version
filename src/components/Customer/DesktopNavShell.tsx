import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  BellRing,
  ChevronDown,
  Compass,
  Footprints,
  Map as MapIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Rss,
  Trophy,
  User,
  Wallet,
  WalletCards,
  Building2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useJVCoinWallet } from '@/hooks/useJVCoinWallet';
import { useUserTier } from '@/hooks/useUserTier';
import TierBadge from '@/components/Tier/TierBadge';
import CustomerNotificationsMenu from '@/components/Customer/CustomerNotificationsMenu';
import jvLogo from '@/assets/jv-logo.png';
import { useTranslation } from 'react-i18next';
import './desktop-nav-shell.css';

const NAV_ITEMS = [
  { icon: Rss, key: 'feed', fallback: 'Feed', path: '/app/feed/immersive', isAlerts: false },
  { icon: Compass, key: 'explore', fallback: 'Explore', path: '/app/explore', isAlerts: false },
  { icon: Trophy, key: 'top10', fallback: 'Top 10', path: '/app/top10', isAlerts: false },
  { icon: Building2, key: 'venues', fallback: 'Venues', path: '/app/venues', isAlerts: false },
  { icon: MapIcon, key: 'map', fallback: 'Map', path: '/app/maps', isAlerts: false },
  { icon: BellRing, key: 'alerts', fallback: 'Alerts', path: '/app/notifications', isAlerts: true },
  { icon: WalletCards, key: 'wallet', fallback: 'Wallet', path: '/app/wallet', isAlerts: false },
] as const;

interface DesktopNavShellProps {
  children: ReactNode;
  mobilePresentation?: boolean;
}

const DesktopNavShell = ({ children, mobilePresentation = false }: DesktopNavShellProps) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { balance } = useJVCoinWallet();
  const { formatCurrency, jvcToLocal } = useCurrency();
  const { currentTier } = useUserTier();
  const isDashboardPresentation = new URLSearchParams(location.search).get('presentation') === 'dashboard';
  const searchRef = useRef<HTMLInputElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('jointvibe-sidebar-collapsed') === 'true');
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    display_name?: string;
    avatar_url?: string;
  } | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    void supabase
      .from('customer_profiles')
      .select('display_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCurrentUserProfile(data);
      });
  }, [user]);

  const handleUnreadCountChange = useCallback((count: number) => {
    setAlertCount(count);
  }, []);

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || target?.matches('input, textarea, [contenteditable="true"]')) return;

      event.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((collapsed) => {
      const nextValue = !collapsed;
      localStorage.setItem('jointvibe-sidebar-collapsed', String(nextValue));
      return nextValue;
    });
  };

  const navigationPath = (path: string) => {
    if (!isDashboardPresentation) return path;

    const [pathname, search = ''] = path.split('?');
    const params = new URLSearchParams(search);
    params.set('presentation', 'dashboard');
    return `${pathname}?${params.toString()}`;
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    const query = searchQuery.trim();
    navigate(navigationPath(query ? `/app/venues?search=${encodeURIComponent(query)}` : "/app/venues"));
  };

  const userName = currentUserProfile?.display_name || user?.email?.split('@')[0] || 'Your profile';

  return (
    <div className={`customer-app-shell${isCollapsed ? ' customer-app-shell--collapsed' : ''}${mobilePresentation ? ' customer-app-shell--mobile-dashboard' : ''}${mobileMenuOpen ? ' customer-app-shell--menu-open' : ''}`}>
      <button
        className="customer-app-sidebar__backdrop"
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileMenuOpen(false)}
      />
      <aside className="customer-app-sidebar" aria-label="End user navigation">
        <div className="customer-app-sidebar__header">
          <Link className="customer-app-brand" to={navigationPath('/app/feed/immersive')} aria-label="JointVibe home" onClick={() => setMobileMenuOpen(false)}>
            <img src={jvLogo} alt="" />
            <span>JointVibe</span>
          </Link>
          <button
            className="customer-app-sidebar__collapse"
            type="button"
            aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={toggleCollapsed}
          >
            {isCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>

        <nav className="customer-app-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = item.path === '/app/venues'
              ? location.pathname === '/app/venues' || location.pathname.startsWith('/app/venue/')
              : location.pathname.startsWith(item.path);
            const Icon = item.icon;
            const translatedLabel = t(`navigation.${item.key}`);
            const label = item.key === 'alerts'
              ? 'Alters'
              : translatedLabel === `navigation.${item.key}` ? item.fallback : translatedLabel;

            return (
              <Link
                key={item.key}
                className={`customer-app-nav__item${isActive ? ' customer-app-nav__item--active' : ''}`}
                to={navigationPath(item.path)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={label}
                title={isCollapsed ? label : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
                {item.isAlerts && alertCount > 0 && <b>{alertCount > 99 ? '99+' : alertCount}</b>}
              </Link>
            );
          })}
        </nav>

        <Link className="customer-app-profile" to={navigationPath('/app/profile')} title={isCollapsed ? userName : undefined} onClick={() => setMobileMenuOpen(false)}>
          <Avatar>
            {currentUserProfile?.avatar_url && <AvatarImage src={currentUserProfile.avatar_url} alt="" />}
            <AvatarFallback><User aria-hidden="true" /></AvatarFallback>
          </Avatar>
          <span>
            <strong>{userName}</strong>
            <small>View profile</small>
          </span>
          <ChevronDown aria-hidden="true" />
        </Link>
      </aside>

      <section className="customer-app-workspace">
        <header className="customer-app-topbar">
          <button
            className="customer-app-mobile-menu"
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <Menu aria-hidden="true" />
          </button>
          <label className="customer-app-search" htmlFor="customer-global-search">
            <Search aria-hidden="true" />
            <Input
              ref={searchRef}
              id="customer-global-search"
              type="search"
              placeholder="Search events, venues, and people"
              aria-label="Search events, venues, and people"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <kbd>/</kbd>
          </label>

          <div className="customer-app-topbar__actions">
            <Link className="customer-app-wallet" to={navigationPath('/app/wallet')} aria-label={`Open wallet. Balance: ${formatCurrency(jvcToLocal(balance.jvc))}`}>
              <Wallet aria-hidden="true" />
              <strong>{formatCurrency(jvcToLocal(balance.jvc))}</strong>
            </Link>
            <Link className="customer-app-icon-action" to={navigationPath('/app/runner/request')} aria-label="Request a JV Runner" title="Request a JV Runner">
              <Footprints aria-hidden="true" />
            </Link>
            <CustomerNotificationsMenu dashboardPresentation={isDashboardPresentation} onUnreadCountChange={handleUnreadCountChange} />
            <Link className="customer-app-topbar-profile" to={navigationPath('/app/profile')} aria-label="Open profile">
              <Avatar>
                {currentUserProfile?.avatar_url && <AvatarImage src={currentUserProfile.avatar_url} alt="" />}
                <AvatarFallback><User aria-hidden="true" /></AvatarFallback>
              </Avatar>
              {currentTier !== 'member' && <TierBadge tier={currentTier} size="sm" showLabel={false} />}
            </Link>
          </div>
        </header>

        <div className="customer-app-content">{children}</div>
      </section>
    </div>
  );
};

export default DesktopNavShell;

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  FlaskConical,
  Home,
  LogOut,
  Menu as MenuIcon,
  MessageSquare,
  Monitor,
  NotebookTabs,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Truck,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useVenueModulesOptional } from '@/hooks/useVenueModules';
import { useVenueStatus } from '@/hooks/useVenueStatus';
import { type VenueTierName } from '@/hooks/useVenueTier';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { useTranslation } from 'react-i18next';
import jvLogo from '@/assets/jv-logo.png';
import VenueTierUpCelebrationModal from './VenueTierUpCelebrationModal';
import VenueNotificationToast from './VenueNotificationToast';
import VenueNotificationsMenu from './VenueNotificationsMenu';
import { useVenueRealNotifications } from '@/hooks/useVenueRealNotifications';
import { useVenueNotificationPreferences } from '@/hooks/useVenueNotificationPreferences';
import { useVenuePendingOrdersCount } from '@/hooks/useVenuePendingOrdersCount';
import GoLiveGateModal from './GoLiveGateModal';
import SubscriptionCheckoutModal from './SubscriptionCheckoutModal';
import './venue-dialog.css';
import './venue-layout.css';

interface VenueLayoutProps {
  children?: ReactNode;
  suppressWorkspaceChrome?: boolean;
  activeNavigationKey?: string;
}

type VenueNavGroup = 'workspace' | 'manage' | 'footer';

interface VenueNavItem {
  key: string;
  url: string;
  icon: LucideIcon;
  module: string | null;
  group: VenueNavGroup;
}

interface VenueTierScoreClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { current_tier?: string } | null }>;
      };
    };
  };
}

const venueNavItems: VenueNavItem[] = [
  { key: 'home', url: '/venue/home', icon: Home, module: null, group: 'workspace' },
  { key: 'operations', url: '/venue/operations', icon: Shield, module: null, group: 'workspace' },
  { key: 'menu', url: '/venue/menu', icon: NotebookTabs, module: 'menu', group: 'workspace' },
  { key: 'orders', url: '/venue/orders', icon: ShoppingCart, module: 'orders', group: 'workspace' },
  { key: 'reservations', url: '/venue/reservations', icon: CalendarDays, module: 'reservations', group: 'workspace' },
  { key: 'deliveries', url: '/venue/deliveries', icon: Truck, module: 'deliveries', group: 'workspace' },
  { key: 'wallet', url: '/venue/wallet', icon: Wallet, module: 'wallet', group: 'workspace' },
  { key: 'staff', url: '/venue/assign', icon: Users, module: 'staff', group: 'manage' },
  { key: 'notifications', url: '/venue/notifications', icon: Bell, module: null, group: 'manage' },
  { key: 'messages', url: '/venue/messages', icon: MessageSquare, module: 'messaging', group: 'manage' },
  { key: 'settings', url: '/venue/settings', icon: Settings, module: null, group: 'footer' },
];

const onboardingStepRoutes: Record<string, string> = {
  essentials: '/venue/verification',
  utility_bill: '/venue/video-walkthrough',
  video: '/venue/id-verification',
  id_verification: '/venue/facial-recognition',
  facial_recognition: '/venue/profile-setup',
};

export default function VenueLayout({
  children,
  suppressWorkspaceChrome = false,
  activeNavigationKey,
}: VenueLayoutProps) {
  const { t } = useTranslation('venue');
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const modulesContext = useVenueModulesOptional();
  const searchRef = useRef<HTMLInputElement>(null);
  const lastSeenTierRef = useRef<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('jointvibe-venue-sidebar-collapsed') === 'true');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [celebrationTier, setCelebrationTier] = useState<VenueTierName | null>(null);
  const [venueName, setVenueName] = useState('');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueCountryCode, setVenueCountryCode] = useState('US');
  const [venueVerifiedAt, setVenueVerifiedAt] = useState<string | null>(null);
  const [venueRegistrationStep, setVenueRegistrationStep] = useState<string | null>(null);
  const [showGoLiveGate, setShowGoLiveGate] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const venueStatusData = useVenueStatus(venueId);
  const notificationPreferences = useVenueNotificationPreferences();
  const pendingOrdersCount = useVenuePendingOrdersCount(venueId);
  const isVenueVerified = Boolean(venueVerifiedAt);
  const userId = user?.id;

  useVenueRealNotifications({ venueId, enabled: Boolean(venueId) && notificationPreferences.notificationsEnabled });

  useEffect(() => {
    if (!userId) return;

    let isCurrent = true;
    let tierChannel: ReturnType<typeof supabase.channel> | null = null;

    const fetchVenueAndSubscribe = async () => {
      const { data: venue } = await supabase
        .from('venues')
        .select('id, name, country_code, verified_at, registration_step')
        .eq('owner_user_id', userId)
        .maybeSingle();

      if (!isCurrent || !venue) return;

      setVenueName(venue.name || '');
      setVenueId(venue.id);
      setVenueCountryCode((venue as { country_code?: string }).country_code || 'US');
      setVenueVerifiedAt((venue as { verified_at?: string | null }).verified_at || null);
      setVenueRegistrationStep((venue as { registration_step?: string | null }).registration_step || null);

      const venueTierScoresClient = supabase as unknown as VenueTierScoreClient;
      const { data: scores } = await venueTierScoresClient
        .from('venue_tier_scores')
        .select('current_tier')
        .eq('venue_id', venue.id)
        .maybeSingle();

      if (!isCurrent) return;

      if (scores) {
        lastSeenTierRef.current = scores.current_tier;
      }

      tierChannel = supabase
        .channel(createRealtimeChannelTopic(`venue_tier_celebration_${venue.id}`))
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'venue_tier_scores',
            filter: `venue_id=eq.${venue.id}`,
          },
          (payload) => {
            if (!isCurrent) return;

            const nextTier = (payload.new as { current_tier?: string }).current_tier;
            const previousTier = lastSeenTierRef.current;
            const tierOrder = ['bronze', 'silver', 'gold', 'diamond', 'platinum'];

            if (previousTier && nextTier && tierOrder.indexOf(nextTier) > tierOrder.indexOf(previousTier)) {
              setCelebrationTier(nextTier as VenueTierName);
            }
            lastSeenTierRef.current = nextTier || previousTier;
          },
        )
        .subscribe();
    };

    void fetchVenueAndSubscribe();

    return () => {
      isCurrent = false;
      if (tierChannel) {
        supabase.removeChannel(tierChannel);
      }
    };
  }, [userId]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || target?.matches('input, textarea, [contenteditable="true"]')) return;

      event.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await signOut();
    navigate('/');
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const nextValue = !collapsed;
      localStorage.setItem('jointvibe-venue-sidebar-collapsed', String(nextValue));
      return nextValue;
    });
  };

  const visibleNavItems = venueNavItems.filter((item) => {
    if (!modulesContext || modulesContext.loading || !item.module) return true;
    return modulesContext.isModuleEnabled(item.module);
  });

  const finalNavItems = visibleNavItems;

  const workspaceItems = finalNavItems.filter((item) => item.group === 'workspace');
  const manageItems = finalNavItems.filter((item) => item.group === 'manage');
  const footerItems = finalNavItems.filter((item) => item.group === 'footer');
  const showGlobalTopbar = !suppressWorkspaceChrome && location.pathname !== '/venue/menu';
  const isPatronInspection = location.pathname === '/venue/patron-inspection';
  const isStaffManagement = location.pathname === '/venue/assign';
  const globalSearchPlaceholder = isPatronInspection
    ? 'Search patrons'
    : isStaffManagement
      ? 'Search employees'
      : 'Search venue dashboard';
  const venueLabel = venueName || 'Venue dashboard';
  const venueInitial = venueLabel.trim().charAt(0).toUpperCase() || 'V';

  const getNavLabel = (item: VenueNavItem) => t(`nav.${item.key}`);

  const renderNavItem = (item: VenueNavItem) => {
    const ItemIcon = item.icon;
    const label = getNavLabel(item);
    const isHashLink = item.url.includes('#');
    const isActive = activeNavigationKey
      ? item.key === activeNavigationKey
      : item.key === 'operations' && isPatronInspection
      ? true
      : isHashLink
        ? `${location.pathname}${location.hash}` === item.url
        : location.pathname === item.url && !(item.key === 'settings' && location.hash === '#test-users');

    return (
      <Link
        key={item.url}
        to={item.url}
        onClick={() => setMobileMenuOpen(false)}
        className={`venue-shell-nav__item${isActive ? ' venue-shell-nav__item--active' : ''}`}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        title={sidebarCollapsed ? label : undefined}
      >
        <ItemIcon aria-hidden="true" />
        <span>{label}</span>
        {item.key === 'orders' && pendingOrdersCount > 0 && (
          <b className="venue-shell-nav__badge">{pendingOrdersCount > 99 ? '99+' : pendingOrdersCount}</b>
        )}
        {item.key === 'notifications' && notificationUnreadCount > 0 && (
          <b className="venue-shell-nav__badge">{notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}</b>
        )}
      </Link>
    );
  };

  const handleVerifyVenue = () => {
    navigate(onboardingStepRoutes[venueRegistrationStep ?? ''] ?? '/venue/essentials');
  };

  return (
    <>
      <div className={`venue-shell${sidebarCollapsed ? ' venue-shell--collapsed' : ''}${mobileMenuOpen ? ' venue-shell--menu-open' : ''}`}>
        <button
          className="venue-shell__backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
        <aside className="venue-shell-sidebar" aria-label="Venue navigation">
          <div className="venue-shell-sidebar__header">
            <NavLink className="venue-shell-brand" to="/venue/home" aria-label="JointVibe venue home">
              <img src={jvLogo} alt="" />
              <span>JointVibe</span>
            </NavLink>
            <button
              className="venue-shell-icon-button venue-shell-sidebar__toggle"
              type="button"
              aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            </button>
          </div>

          <NavLink className="venue-shell-identity" to="/venue/account" title={sidebarCollapsed ? venueLabel : undefined}>
            <span>{venueInitial}</span>
            <div>
              <strong>{venueLabel}</strong>
              <small>Venue dashboard</small>
            </div>
            <ChevronDown aria-hidden="true" />
          </NavLink>

          <nav className="venue-shell-nav">
            <p className="venue-shell-nav__label">WORKSPACE</p>
            {workspaceItems.map(renderNavItem)}
            {manageItems.length > 0 && <p className="venue-shell-nav__label venue-shell-nav__label--secondary">MANAGE</p>}
            {manageItems.map(renderNavItem)}
          </nav>

          <footer className="venue-shell-sidebar__footer">
            {footerItems.map(renderNavItem)}
          </footer>
        </aside>

        <section className="venue-shell-workspace">
          {!suppressWorkspaceChrome && venueStatusData.isTesting && venueId && (
            <div className="venue-shell-testing-banner">
              <p>
                <FlaskConical aria-hidden="true" />
                <strong>Testing mode</strong>
                <span>Your venue is hidden from customers. {venueStatusData.testUserCount}/{venueStatusData.maxTestUsers} test users</span>
              </p>
              <button className="venue-shell-primary-button venue-shell-primary-button--compact" type="button" onClick={isVenueVerified ? () => setShowGoLiveGate(true) : handleVerifyVenue}>
                {isVenueVerified ? <Rocket aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                <span>{isVenueVerified ? 'Go live' : 'Verify venue'}</span>
              </button>
            </div>
          )}

          {showGlobalTopbar ? (
            <header className="venue-shell-topbar">
              <button
                className="venue-shell-icon-button venue-shell-mobile-menu"
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((open) => !open)}
              >
                <MenuIcon aria-hidden="true" />
              </button>
              <label className="venue-shell-search" htmlFor="venue-global-search">
                <Search aria-hidden="true" />
                <input ref={searchRef} id="venue-global-search" type="search" placeholder={globalSearchPlaceholder} />
                <kbd>/</kbd>
              </label>
              <div className="venue-shell-topbar__actions">
                <NavLink className="venue-shell-primary-button venue-shell-pos-button" to="/venue/pos/new-order">
                  <Monitor aria-hidden="true" />
                  <span>POS</span>
                </NavLink>
                <VenueNotificationsMenu venueId={venueId} onUnreadCountChange={setNotificationUnreadCount} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="venue-shell-profile-button" type="button" aria-label="Open account menu">
                      <span>{venueInitial}</span>
                      <ChevronDown aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="venue-shell-profile-menu">
                    <div className="venue-shell-profile-menu__identity">
                      <strong>{venueLabel}</strong>
                      <span>{user?.email}</span>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/venue/account')}>
                      <User aria-hidden="true" />
                      Account
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/venue/settings')}>
                      <Settings aria-hidden="true" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="venue-shell-profile-menu__logout" onClick={handleLogout}>
                      <LogOut aria-hidden="true" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
          ) : (
            <button
              className="venue-shell-icon-button venue-shell-mobile-menu venue-shell-menu-mobile-trigger"
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <MenuIcon aria-hidden="true" />
            </button>
          )}

          <main className="venue-shell-content">
            <div key={location.pathname} className="animate-page-in motion-reduce:animate-none">
              {children ?? <Outlet />}
            </div>
          </main>
        </section>
      </div>

      <VenueNotificationToast />
      {celebrationTier && (
        <VenueTierUpCelebrationModal
          open={Boolean(celebrationTier)}
          onClose={() => setCelebrationTier(null)}
          newTier={celebrationTier}
          venueName={venueName}
        />
      )}
      <GoLiveGateModal
        open={showGoLiveGate}
        onClose={() => setShowGoLiveGate(false)}
        onGoLive={() => {
          setShowGoLiveGate(false);
          setShowSubscriptionModal(true);
        }}
        venueCountryCode={venueCountryCode}
      />
      {venueId && (
        <SubscriptionCheckoutModal
          open={showSubscriptionModal}
          onClose={() => setShowSubscriptionModal(false)}
          venueId={venueId}
          venueCountryCode={venueCountryCode}
        />
      )}
    </>
  );
}

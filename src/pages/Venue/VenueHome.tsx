import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Users, ShoppingCart, DollarSign, Clock, Star, TrendingUp,
  Utensils, MessageCircle, Radio, Activity, Bot, Menu as MenuIcon,
  ChevronRight, Bell, Settings, Eye, Megaphone, Truck, Calendar,
  Monitor, Wallet, ChefHat, Table2, Zap
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import LiveChatOverlay from "@/components/Venue/LiveChatOverlay";
import NotificationSettingsModal from "@/components/Venue/NotificationSettingsModal";
import VenueNotificationToast from "@/components/Venue/VenueNotificationToast";
import GoLiveVideoPopup from "@/components/Venue/GoLiveVideoPopup";
import DealCreatorModal, { type DealPrefillData, DEAL_DRAFT_STORAGE_KEY } from "@/components/Venue/DealCreatorModal";
import UnifiedDealCreator from "@/components/Venue/UnifiedDealCreator";
import TablesPopup from "@/components/Venue/TablesPopup";
import OwnerAIHelper from "@/components/Venue/OwnerAIHelper";
import ControlCenterPanel from "@/components/Venue/ControlCenterPanel";
import VibeRadar from "@/components/Venue/VibeRadar";
import VibeCreator from "@/components/Venue/VibeCreator";
import OrbCustomizer from "@/components/Venue/OrbCustomizer";
import TwoRingOrbLayout from "@/components/Venue/TwoRingOrbLayout";
import { useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import { useVenueDeliveryOrders } from "@/hooks/useVenueDeliveryOrders";
import { useDeliveryNotification } from "@/hooks/useDeliveryNotification";
import { useVenueRealNotifications } from "@/hooks/useVenueRealNotifications";
import { useVenueModulesOptional } from "@/hooks/useVenueModules";
import { useVenueVibes } from "@/hooks/useVenueVibes";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import { SIMULATION_MODE } from "@/config/paymentConfig";
import { useIsMobile } from "@/hooks/use-mobile";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import { useVenueSimulatedPayments } from "@/hooks/useSimulatedPayments";
import { VenuePreset, venuePresets } from "@/config/venueModules";
import { useVenueTier } from "@/hooks/useVenueTier";
import { useVenueStatus } from "@/hooks/useVenueStatus";
import VenueTierBadge from "@/components/Venue/VenueTierBadge";
import VenueTierDashboardCard from "@/components/Venue/VenueTierDashboardCard";
import VenueControlCenterHome from "@/components/Venue/VenueControlCenterHome";
import { type VenueHomeMode } from "@/components/Venue/VenueHomeModeToggle";
import VenueClassicHome from "@/components/Venue/VenueClassicHome";
import VenueFoundersPopup from "@/components/Venue/VenueFoundersPopup";
import { useTranslation } from 'react-i18next';

interface CheckedInUser {
  id: string;
  name: string;
  avatar: string;
  table: string;
  tier?: string;
}

// Orb configuration mapping
const orbIconMap: Record<string, any> = {
  pos: Monitor,
  orders: ShoppingCart,
  deliveries: Truck,
  kitchen: ChefHat,
  tables: Table2,
  messages: MessageCircle,
  ai_assistant: Bot,
  push_deals: Megaphone,
  wallet: Wallet,
  reservations: Calendar,
};

// Orb gradient colors as inline styles to prevent Tailwind purge issues
const orbColorStyleMap: Record<string, { from: string; to: string }> = {
  pos: { from: "hsl(var(--primary))", to: "#06b6d4" },
  orders: { from: "#ef4444", to: "#dc2626" },
  deliveries: { from: "#f97316", to: "#ea580c" },
  kitchen: { from: "#22c55e", to: "#16a34a" },
  tables: { from: "#3b82f6", to: "#2563eb" },
  messages: { from: "#eab308", to: "#ca8a04" },
  ai_assistant: { from: "#06b6d4", to: "#0891b2" },
  push_deals: { from: "#ec4899", to: "#db2777" },
  wallet: { from: "#14b8a6", to: "#0d9488" },
  reservations: { from: "#a855f7", to: "#9333ea" },
};

const orbColorMap: Record<string, string> = {
  pos: "from-primary to-cyan-500",
  orders: "from-orange-500 to-red-500",
  deliveries: "from-amber-500 to-orange-500",
  kitchen: "from-green-500 to-emerald-500",
  tables: "from-blue-500 to-cyan-500",
  messages: "from-yellow-500 to-orange-500",
  ai_assistant: "from-cyan-500 to-blue-500",
  push_deals: "from-pink-500 to-rose-500",
  wallet: "from-emerald-500 to-teal-500",
  reservations: "from-purple-500 to-violet-500",
};

const orbLabelMap: Record<string, string> = {
  pos: "Open POS",
  orders: "Live Orders",
  deliveries: "Deliveries",
  kitchen: "Kitchen",
  tables: "Tables",
  messages: "Messages",
  ai_assistant: "JV Assistant",
  push_deals: "Push Deal",
  wallet: "Wallet",
  reservations: "Reservations",
};

const AmbientParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(40)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-2 h-2 bg-primary/50 rounded-full"
        style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
        animate={{ y: [-20, -100], opacity: [0, 0.8, 0] }}
        transition={{ duration: 4 + Math.random() * 3, repeat: Infinity, delay: Math.random() * 3, ease: "easeOut" }}
      />
    ))}
  </div>
);

// All available orbs for customizer
const allAvailableOrbs = [
  'orders', 'kitchen', 'tables', 'messages', 'ai_assistant', 
  'push_deals', 'wallet', 'deliveries', 'reservations', 'pos'
];

const VENUE_HOME_MODE_STORAGE_KEY = "jv_venue_home_mode";

const getRequestedVenueHomeMode = (search: string): VenueHomeMode | null => {
  const mode = new URLSearchParams(search).get("mode");
  return mode === "classic" || mode === "control_center" ? mode : null;
};

// Quick Sell simplified dashboard component
const QuickSellDashboard = ({ 
  todayRevenue, 
  ordersCompleted, 
  pendingOrders,
  onOpenPOS,
  onPushDeal,
  onOpenWallet,
  onOpenOrders,
}: {
  todayRevenue: number;
  ordersCompleted: number;
  pendingOrders: number;
  onOpenPOS: () => void;
  onPushDeal: () => void;
  onOpenWallet: () => void;
  onOpenOrders: () => void;
}) => (
  <div className="relative z-10 px-6 space-y-6">
    {/* Revenue Hero */}
    <motion.div 
      className="text-center py-8"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
    >
      <p className="text-slate-400 text-lg mb-2">Today's Revenue</p>
      <h2 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
        ${todayRevenue.toLocaleString()}
      </h2>
    </motion.div>

    {/* Quick Stats */}
    <div className="grid grid-cols-2 gap-4">
      <Card className="bg-slate-800/80 backdrop-blur-xl border-slate-700">
        <CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-white">{ordersCompleted}</div>
          <p className="text-sm text-slate-400">Orders Completed</p>
        </CardContent>
      </Card>
      <Card className="bg-slate-800/80 backdrop-blur-xl border-slate-700 cursor-pointer hover:border-orange-500/50 transition-colors" onClick={onOpenOrders}>
        <CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-orange-400">{pendingOrders}</div>
          <p className="text-sm text-slate-400">Pending Orders</p>
        </CardContent>
      </Card>
    </div>

    {/* Large Open POS Button */}
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2 }}
    >
      <Button 
        onClick={onOpenPOS}
        className="w-full h-20 text-xl font-bold bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90"
      >
        <Monitor className="w-8 h-8 mr-3" />
        Open POS
      </Button>
    </motion.div>

    {/* Quick Actions */}
    <div className="grid grid-cols-2 gap-4">
      <Button 
        variant="outline" 
        className="h-14 border-slate-600 text-white hover:bg-slate-700"
        onClick={onOpenWallet}
      >
        <Wallet className="w-5 h-5 mr-2" />
        Wallet
      </Button>
      <Button 
        className="h-14 bg-gradient-to-r from-pink-500 to-rose-500"
        onClick={onPushDeal}
      >
        <Megaphone className="w-5 h-5 mr-2" />
        Push Deal
      </Button>
    </div>
  </div>
);

export default function VenueHome() {
  const { t } = useTranslation('venue');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [homeMode, setHomeMode] = useState<VenueHomeMode>(() => {
    if (typeof window === "undefined") return "control_center";
    const requestedMode = getRequestedVenueHomeMode(window.location.search);
    if (requestedMode) return requestedMode;
    const savedMode = localStorage.getItem(VENUE_HOME_MODE_STORAGE_KEY);
    return savedMode === "classic" ? "classic" : "control_center";
  });
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [showDealCreator, setShowDealCreator] = useState(false);
  const [showUnifiedCreator, setShowUnifiedCreator] = useState(false);
  const [unifiedCreatorIntent, setUnifiedCreatorIntent] = useState<string | undefined>(undefined);
  const [showTablesPopup, setShowTablesPopup] = useState(false);
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [showControlCenter, setShowControlCenter] = useState(false);
  const [showVibeCreator, setShowVibeCreator] = useState(false);
  const [showVibeRadar, setShowVibeRadar] = useState(false);
  const [linkedVibeId, setLinkedVibeId] = useState<string | null>(null);
  const [showOrbCustomizer, setShowOrbCustomizer] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [showFoundersPopup, setShowFoundersPopup] = useState(false);
  const [foundersCitySlug, setFoundersCitySlug] = useState<string | null>(null);
  const [pendingDealDraft, setPendingDealDraft] = useState<{ headline: string; discount: string; description: string } | null>(null);
  const [pendingMenuItemImageUrl, setPendingMenuItemImageUrl] = useState<string | undefined>(undefined);
  const [checkedInUsers, setCheckedInUsers] = useState<CheckedInUser[]>([]);
  const [canViewInternalPatrons, setCanViewInternalPatrons] = useState(true);
  const [recentReservations, setRecentReservations] = useState<any[]>([]);
  const [venueInterestCounts, setVenueInterestCounts] = useState({
    currentlyAt: 0,
    headingThere: 0,
    maybeGoing: 0,
  });
  const venueStatus = useVenueStatus(venueId);

  useEffect(() => {
    localStorage.setItem(VENUE_HOME_MODE_STORAGE_KEY, homeMode);
  }, [homeMode]);

  useEffect(() => {
    const requestedMode = getRequestedVenueHomeMode(searchParams.toString());
    if (requestedMode) setHomeMode(requestedMode);
  }, [searchParams]);

  const handleHomeModeChange = (nextMode: VenueHomeMode) => {
    setHomeMode(nextMode);
    const nextParams = new URLSearchParams(searchParams);

    if (nextMode === "classic") {
      nextParams.set("mode", "classic");
    } else {
      nextParams.delete("mode");
    }

    setSearchParams(nextParams, { replace: true });
  };
  
  // Handle Stripe subscription success redirect
  useEffect(() => {
    if (searchParams.get('subscription') === 'success') {
      toast.success("You're live! Your venue is now visible to all JointVibe customers.", {
        duration: 8000,
      });
      searchParams.delete('subscription');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // Get venue modules context
  const venueModulesContext = useVenueModulesOptional();
  // IMPORTANT:
  // During brand-new onboarding, the venue_modules row can be briefly unavailable.
  // We must NOT default to full_suite in that case, or the UI will "flip" after refresh.
  const storedPreset = useMemo<VenuePreset | null>(() => {
    try {
      const raw = localStorage.getItem('jv_venue_data');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const p = parsed?.venuePreset;
      if (p === 'quick_sell' || p === 'counter_service' || p === 'full_suite') return p;
      return null;
    } catch {
      return null;
    }
  }, []);

  const isModulesReady = !!venueModulesContext && !venueModulesContext.loading && !!venueModulesContext.modules;
  const effectivePreset: VenuePreset =
    (venueModulesContext?.modules?.preset as VenuePreset | undefined) ?? storedPreset ?? 'full_suite';
  const isQuickSell = effectivePreset === 'quick_sell';
  const getEnabledOrbs = venueModulesContext?.getEnabledOrbs;
  const isModuleEnabled = venueModulesContext?.isModuleEnabled;
  
  // Venue data state
  const [venueData, setVenueData] = useState({
    name: localStorage.getItem('jv_current_venue_name') || "Loading...",
    vibeLevel: "🔥 Lit",
    currentOccupancy: 0,
    maxCapacity: 250,
    avgWaitTime: 12,
    rating: 4.8,
    imageUrl: null as string | null,
  });

  // Fetch venue data from database
  useEffect(() => {
    const fetchVenueData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: venue, error } = await supabase
        .from('venues')
        .select('*')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (venue && !error) {
        setVenueId(venue.id);
        setVenueData({
          name: venue.name,
          vibeLevel: "🔥 Lit",
          currentOccupancy: venue.current_occupancy || 0,
          maxCapacity: venue.capacity || 250,
          avgWaitTime: 12,
          rating: (venue.vibe_score || 48) / 10,
          imageUrl: venue.image_url,
        });
        localStorage.setItem('jv_current_venue_name', venue.name);
        localStorage.setItem('jv_current_venue_id', venue.id);
      }
    };

    fetchVenueData();
  }, []);

  // Founders Pass popup trigger
  useEffect(() => {
    if (!venueId) return;
    if (localStorage.getItem('jv_founders_dismissed_venue') === 'true') return;
    if (sessionStorage.getItem('jv_founders_popup_shown_venue') === 'true') return;

    const citySlug = localStorage.getItem('jv_venue_city_slug');
    if (!citySlug) return;

    const checkFoundersEligibility = async () => {
      // Check if there's an active city product with remaining passes
      const { data: product } = await supabase
        .from('city_products')
        .select('sold_count, total_supply')
        .eq('slug', citySlug)
        .eq('pass_type', 'venue')
        .eq('is_active', true)
        .maybeSingle();

      if (!product || product.sold_count >= product.total_supply) return;

      // Check if user already owns a venue founders pass
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: entitlement } = await supabase
        .from('founder_entitlements')
        .select('id')
        .eq('user_id', user.id)
        .eq('pass_type', 'venue')
        .in('status', ['active', 'pending_kyc', 'pending_claim'])
        .maybeSingle();

      if (entitlement) return;

      setFoundersCitySlug(citySlug);
      setShowFoundersPopup(true);
      sessionStorage.setItem('jv_founders_popup_shown_venue', 'true');
    };

    checkFoundersEligibility();
  }, [venueId]);

  // Fetch real checked-in users
  useEffect(() => {
    if (!venueId) return;

    const fetchCheckedInUsers = async () => {
      const { data: hasAccess, error: accessError } = await (supabase as any).rpc(
        "can_view_venue_internal_patrons",
        { p_venue_id: venueId },
      );

      if (accessError || !hasAccess) {
        if (accessError) {
          console.error("[VenueHome] internal patron access check failed:", accessError);
        }
        setCanViewInternalPatrons(false);
        setCheckedInUsers([]);
        return;
      }

      setCanViewInternalPatrons(true);

      const { data: internalPatrons, error } = await (supabase as any).rpc(
        "get_venue_internal_patron_presence",
        { p_venue_id: venueId },
      );

      if (error) {
        console.error("[VenueHome] internal patron presence query error:", error);
        setCheckedInUsers([]);
        return;
      }

      if (!internalPatrons?.length) {
        setCheckedInUsers([]);
        setVenueData((prev) => ({ ...prev, currentOccupancy: 0 }));
        return;
      }

      const users: CheckedInUser[] = internalPatrons.map((patron: any) => {
        return {
          id: patron.user_id,
          name: patron.display_name || "Guest",
          avatar: patron.avatar_url || "",
          table: patron.table_number || "?",
          tier: patron.current_tier || "member",
        };
      });

      setCheckedInUsers(users);
      setVenueData((prev) => ({ ...prev, currentOccupancy: users.length }));
    };

    fetchCheckedInUsers();

    const channel = supabase
      .channel(createRealtimeChannelTopic(`checkins-${venueId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins', filter: `venue_id=eq.${venueId}` }, () => fetchCheckedInUsers())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [venueId]);

  // Fetch recent reservations
  useEffect(() => {
    if (!venueId) return;

    const fetchReservations = async () => {
      const { data, error } = await supabase
        .from('table_reservations')
        .select('*')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setRecentReservations(data);
      }
    };

    fetchReservations();

    const channel = supabase
      .channel(createRealtimeChannelTopic(`reservations-home-${venueId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_reservations', filter: `venue_id=eq.${venueId}` }, () => fetchReservations())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [venueId]);

  // Read-only venue momentum counts from aggregation RPC
  useEffect(() => {
    if (!venueId) return;

    const fetchVenueInterestCounts = async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_venue_interest_signal_counts",
        { p_venue_id: venueId },
      );

      if (error) {
        console.error("[VenueHome] interest signal counts query error:", error);
        setVenueInterestCounts({ currentlyAt: 0, headingThere: 0, maybeGoing: 0 });
        return;
      }

      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setVenueInterestCounts({
        currentlyAt: Number(row?.currently_at_count ?? 0),
        headingThere: Number(row?.heading_there_count ?? 0),
        maybeGoing: Number(row?.maybe_going_count ?? 0),
      });
    };

    fetchVenueInterestCounts();

    const checkInsChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-home-interest-checkins-${venueId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "check_ins", filter: `venue_id=eq.${venueId}` },
        () => fetchVenueInterestCounts(),
      )
      .subscribe();

    const signalsChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-home-interest-signals-${venueId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "venue_interest_signals", filter: `venue_id=eq.${venueId}` },
        () => fetchVenueInterestCounts(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(checkInsChannel);
      supabase.removeChannel(signalsChannel);
    };
  }, [venueId]);

  const { orders, stats, getRecentOrders } = useVenueOrdersDB(venueId);
  const { deliveryOrders } = useVenueDeliveryOrders(venueId);
  const simulatedPayments = useVenueSimulatedPayments(venueId);
  
  useEffect(() => {
    if (SIMULATION_MODE && venueId) {
      simulatedPayments.refreshBalance();
    }
  }, [venueId]);
  
  useDeliveryNotification({ venueId, enabled: true });
  // Venue notifications now handled globally in VenueLayout — no duplicate here

  // Vibes hook for demand testing
  const { activeVibe, vibeCredits, sendVibe, convertToDeal, expireVibe } = useVenueVibes(venueId);
  const venueTierData = useVenueTier(venueId);
  const isMobile = useIsMobile();

  // Compute time remaining for active vibe
  const vibeTimeLeft = activeVibe ? Math.max(0, Math.floor((new Date(activeVibe.expires_at).getTime() - Date.now()) / 60000)) : 0;

  const activeDeliveryCount = Array.from(deliveryOrders.values()).filter(
    d => d.status !== "delivered" && d.status !== "cancelled"
  ).length;
  
  const occupancyPercent = (venueData.currentOccupancy / venueData.maxCapacity) * 100;
  
  const todayRevenue = SIMULATION_MODE 
    ? simulatedPayments.balance 
    : orders.filter(o => ["preparing", "ready", "served"].includes(o.status)).reduce((sum, o) => sum + o.total, 0);
  
  const activeOrders = stats.pending + stats.preparing;
  const completedOrders = stats.servedToday;

  // Build orb counts map
  const orbCounts: Record<string, number | null> = {
    orders: activeOrders,
    deliveries: activeDeliveryCount,
    kitchen: stats.pending,
    tables: checkedInUsers.length,
    messages: 5,
    ai_assistant: null,
    push_deals: null,
    wallet: null,
    pos: null,
    reservations: recentReservations.filter(r => r.status === 'pending').length,
  };

  // Dynamic control orbs based on enabled modules
  // IMPORTANT: If modules aren't ready yet, fall back to the preset defaults (NOT full_suite).
  const controlOrbs = useMemo(() => {
    let enabledOrbKeys: string[];

    if (getEnabledOrbs && isModulesReady) {
      enabledOrbKeys = getEnabledOrbs();
    } else {
      enabledOrbKeys = venuePresets[effectivePreset]?.homeOrbs || venuePresets.full_suite.homeOrbs;
    }
    
    return enabledOrbKeys.map(orbKey => {
      const colorStyle = orbColorStyleMap[orbKey];
      return {
        id: orbKey,
        icon: orbIconMap[orbKey] || ShoppingCart,
        label: orbLabelMap[orbKey] || orbKey,
        color: orbColorMap[orbKey] || 'from-gray-500 to-gray-600',
        gradientStyle: colorStyle 
          ? { background: `linear-gradient(to bottom right, ${colorStyle.from}, ${colorStyle.to})` }
          : undefined,
        count: orbCounts[orbKey] ?? null,
      };
    });
  }, [getEnabledOrbs, isModulesReady, effectivePreset, activeOrders, activeDeliveryCount, stats.pending, checkedInUsers.length, recentReservations]);

  // Live activity from real orders AND reservations
  const recentOrders = getRecentOrders(4);
  
  const recentActivity = useMemo(() => {
    const orderActivities = recentOrders.map(order => {
      const deliveryInfo = deliveryOrders.get(order.id);
      const isDelivery = !!deliveryInfo;
      const isPreorder = order.isPreorder;
      
      let actionText = `Order #${order.orderNumber} - ${order.status}`;
      if (isDelivery) {
        actionText = `🚚 Delivery #${order.orderNumber} - ${deliveryInfo?.status || order.status}`;
      } else if (isPreorder) {
        actionText = `🍽️ Dine-In Pre-Order #${order.orderNumber} - ${order.status === 'pending' ? 'awaiting acceptance' : order.status}`;
      }
      
      return {
        time: formatDistanceToNow(new Date(order.createdAt), { addSuffix: true }),
        timestamp: new Date(order.createdAt).getTime(),
        action: actionText,
        type: isDelivery ? "delivery" : isPreorder ? "preorder" : "order" as const,
        user: isDelivery ? "Delivery" : order.customerName || order.tableNumber || "Customer",
        isDelivery,
        isPreorder,
        isReservation: false,
      };
    });

    const orderReservationIds = new Set(recentOrders.filter(o => o.reservationId).map(o => o.reservationId));
    const reservationActivities = recentReservations
      .filter(r => !orderReservationIds.has(r.id))
      .slice(0, 4)
      .map(reservation => {
        const scheduledDate = `${reservation.reservation_date} at ${reservation.start_time}`;
        let statusText = reservation.status;
        if (reservation.status === 'pending') statusText = 'awaiting acceptance';
        if (reservation.status === 'confirmed') statusText = 'accepted';
        
        return {
          time: formatDistanceToNow(new Date(reservation.created_at), { addSuffix: true }),
          timestamp: new Date(reservation.created_at).getTime(),
          action: `📅 Reservation for ${scheduledDate} - ${statusText}`,
          type: "reservation" as const,
          user: reservation.customer_name || "Guest",
          isDelivery: false,
          isPreorder: false,
          isReservation: true,
        };
      });

    return [...orderActivities, ...reservationActivities]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);
  }, [recentOrders, recentReservations, deliveryOrders]);

  const handleOrbClick = (orbId: string) => {
    switch (orbId) {
      case 'chat':
      case 'messages':
        setShowChat(true);
        break;
      case 'tables':
        setShowTablesPopup(true);
        break;
      case 'kitchen':
        navigate('/venue/pos/kitchen');
        break;
      case 'orders':
        navigate('/venue/orders');
        break;
      case 'deliveries':
        navigate('/venue/deliveries');
        break;
      case 'pos':
        navigate('/venue/pos/new-order');
        break;
      case 'wallet':
        navigate('/venue/wallet');
        break;
      case 'push_deals':
        setUnifiedCreatorIntent(undefined);
        setShowUnifiedCreator(true);
        break;
      case 'ai_assistant':
        // Open AI assistant modal
        setShowAIHelper(true);
        break;
      case 'reservations':
        navigate('/venue/reservations');
        break;
    }
  };

  const readinessItems = [
    {
      id: "payouts",
      title: "Payout account",
      description: "Confirm Stripe Connect and withdrawal security settings.",
      status: "todo" as const,
      actionLabel: "Open settings",
      onAction: () => navigate("/venue/settings"),
    },
    {
      id: "menu",
      title: "Menu readiness",
      description: "Keep menu items updated for orders and POS.",
      status: "done" as const,
      actionLabel: "Open menu",
      onAction: () => navigate("/venue/menu"),
    },
    {
      id: "staff",
      title: "Staff access",
      description: "Verify staff assignments and access levels.",
      status: (checkedInUsers.length > 0 ? "done" : "warning") as "done" | "warning",
      actionLabel: "Open staff",
      onAction: () => navigate("/venue/assign"),
    },
    {
      id: "deals",
      title: "Deal promotion",
      description: "Create or schedule push deals to drive traffic.",
      status: "todo" as const,
      actionLabel: "Open wallet",
      onAction: () => navigate("/venue/wallet"),
    },
  ];

  const growthOpportunities = [
    {
      id: "push-deal",
      title: "Launch a push deal",
      description: "Turn idle capacity into orders with targeted deal pushes.",
      ctaLabel: "Create deal",
      onClick: () => { setUnifiedCreatorIntent(undefined); setShowUnifiedCreator(true); },
    },
    {
      id: "vibes",
      title: "Run a vibe poll",
      description: "Collect live demand signals before launching an offer.",
      ctaLabel: "Send vibe",
      onClick: () => { setUnifiedCreatorIntent("test_demand"); setShowUnifiedCreator(true); },
    },
    {
      id: "referrals",
      title: "Grow through referrals",
      description: "Track referral performance and optimize partner outreach.",
      ctaLabel: "View referrals",
      onClick: () => navigate("/venue/referrals"),
    },
  ];

  const quickAccessItems = controlOrbs.slice(0, 8).map((orb) => ({
    id: orb.id,
    label: orb.label,
    count: orb.count,
    onClick: () => handleOrbClick(orb.id),
  }));

  const controlCenterActivity = recentActivity.map((activity, index) => ({
    id: `${activity.type}-${index}`,
    action: activity.action,
    user: activity.user,
    time: activity.time,
  }));

  const revenueComparisonLabel = useMemo(() => {
    const now = new Date();
    return now.getDay() === 5 || now.getDay() === 6 ? "same weekday last week" : "yesterday";
  }, []);

  const revenueComparisonBase = useMemo(() => {
    const utilizationSignal = Math.min(0.25, checkedInUsers.length * 0.01 + activeOrders * 0.008);
    const baselineFactor = Math.max(0.7, Math.min(1.2, 0.88 + utilizationSignal));
    return Math.max(1, Math.round(todayRevenue * baselineFactor));
  }, [todayRevenue, checkedInUsers.length, activeOrders]);

  const creatorCheckIns = useMemo(
    () => checkedInUsers.filter((user) => user.tier && user.tier !== "member").length,
    [checkedInUsers],
  );

  const nearbyCreators = useMemo(
    () => Math.max(0, Math.round(creatorCheckIns + checkedInUsers.length * 0.25)),
    [creatorCheckIns, checkedInUsers.length],
  );

  const activeLiveStreams = useMemo(() => (venueStatus.isLive ? 1 : 0), [venueStatus.isLive]);

  const controlCenterLastUpdated = useMemo(
    () => formatDistanceToNow(new Date(), { addSuffix: true }),
    [todayRevenue, activeOrders, stats.pending, checkedInUsers.length, recentReservations.length],
  );

  return (
    <div className="min-h-full">
      {/* VenueNotificationToast now rendered globally in VenueLayout */}
      <LiveChatOverlay isOpen={showChat} onClose={() => setShowChat(false)} />
      <NotificationSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <GoLiveVideoPopup 
        isLive={isLive} 
        onClose={() => setIsLive(false)} 
        streamerName={venueData.name}
        viewerCount={47}
      />
      <DealCreatorModal
        isOpen={showDealCreator}
        onClose={() => { setShowDealCreator(false); setPendingDealDraft(null); setPendingMenuItemImageUrl(undefined); setLinkedVibeId(null); }}
        venueId={venueId || undefined}
        prefillData={pendingDealDraft}
        menuItemImageUrl={pendingMenuItemImageUrl}
        linkedVibeId={linkedVibeId || undefined}
        onBuyCredits={() => {
          setShowDealCreator(false);
          navigate('/venue/wallet?open_buy=true&resume_deal=true');
        }}
      />
      <UnifiedDealCreator
        isOpen={showUnifiedCreator}
        onClose={() => { setShowUnifiedCreator(false); setUnifiedCreatorIntent(undefined); setLinkedVibeId(null); }}
        venueId={venueId || undefined}
        defaultIntent={unifiedCreatorIntent}
        linkedVibeId={linkedVibeId || undefined}
        onBuyCredits={() => {
          setShowUnifiedCreator(false);
          navigate('/venue/wallet?open_buy=true&resume_deal=true');
        }}
      />

      {/* Vibe Radar */}
      <VibeRadar
        isOpen={showVibeRadar}
        onClose={() => setShowVibeRadar(false)}
        vibe={activeVibe ? {
          id: activeVibe.id,
          message: activeVibe.message,
          expiresAt: new Date(activeVibe.expires_at),
          status: activeVibe.status,
          responseSummary: activeVibe.response_summary,
        } : null}
        onConvertToDeal={async (vibeId) => {
          await convertToDeal(vibeId);
          setShowVibeRadar(false);
          setLinkedVibeId(vibeId);
          setUnifiedCreatorIntent(undefined);
          setShowUnifiedCreator(true);
        }}
        onLetExpire={(vibeId) => {
          expireVibe(vibeId);
          setShowVibeRadar(false);
        }}
      />

      <TablesPopup
        isOpen={showTablesPopup}
        onClose={() => setShowTablesPopup(false)}
        venueId={venueId}
      />

      {venueId && (
        <OwnerAIHelper
          venueId={venueId}
          venueName={venueData.name}
          isOpen={showAIHelper}
          onClose={() => setShowAIHelper(false)}
        />
      )}

      {/* Orb Customizer */}
      <OrbCustomizer
        isOpen={showOrbCustomizer}
        onClose={() => setShowOrbCustomizer(false)}
        activeOrbs={controlOrbs.map(o => o.id)}
        availableOrbs={allAvailableOrbs}
        onSave={async (orbs) => {
          if (venueModulesContext?.updateOrbConfig) {
            await venueModulesContext.updateOrbConfig({ orbs });
          }
        }}
      />

      {homeMode === "control_center" && (
          <VenueControlCenterHome
            venueName={venueData.name}
            homeMode={homeMode}
            onHomeModeChange={handleHomeModeChange}
            onOpenVibeRadar={() => setShowVibeRadar(true)}
            isLive={venueStatus.isLive}
            revenueToday={todayRevenue}
            revenueComparisonBase={revenueComparisonBase}
            revenueComparisonLabel={revenueComparisonLabel}
            activeOrders={activeOrders}
            pendingOrders={stats.pending}
            kitchenQueue={stats.pending}
            checkedInCount={checkedInUsers.length}
            maxCapacity={venueData.maxCapacity}
            creatorCheckIns={creatorCheckIns}
            nearbyCreators={nearbyCreators}
            activeLiveStreams={activeLiveStreams}
            currentlyAtCount={venueInterestCounts.currentlyAt}
            headingThereCount={venueInterestCounts.headingThere}
            maybeGoingCount={venueInterestCounts.maybeGoing}
            lastUpdatedAt={controlCenterLastUpdated}
            readinessItems={readinessItems}
            growthOpportunities={growthOpportunities}
            quickAccessItems={quickAccessItems}
            liveActivity={controlCenterActivity}
          />
      )}

      {homeMode === "classic" && (
        <VenueClassicHome
          venueName={venueData.name}
          homeMode={homeMode}
          onHomeModeChange={handleHomeModeChange}
          isLive={venueStatus.isLive}
          revenueToday={todayRevenue}
          revenueComparisonBase={revenueComparisonBase}
          revenueComparisonLabel={revenueComparisonLabel}
          activeOrders={activeOrders}
          pendingOrders={stats.pending}
          averageWaitMinutes={venueData.avgWaitTime}
          checkedInCount={checkedInUsers.length}
          maxCapacity={venueData.maxCapacity}
          activeDeliveryCount={activeDeliveryCount}
          unreadMessageCount={orbCounts.messages || 0}
          queueOrders={orders
            .filter((order) => ["pending", "preparing", "ready"].includes(order.status))
            .slice(0, 3)
            .map((order) => ({
              id: order.id,
              orderNumber: order.orderNumber,
              tableNumber: order.tableNumber,
              customerName: order.customerName,
              status: order.status,
              createdAt: order.createdAt,
            }))}
          liveActivity={controlCenterActivity}
          guests={checkedInUsers}
          canViewInternalPatrons={canViewInternalPatrons}
          lastUpdatedAt={controlCenterLastUpdated}
          onOpenSettings={() => navigate("/venue/settings")}
          onOpenOrders={() => navigate("/venue/orders")}
          onOpenKitchen={() => navigate("/venue/pos/kitchen")}
          onOpenDeliveries={() => navigate("/venue/deliveries")}
          onOpenTables={() => navigate("/venue/pos/tables")}
          onOpenMessages={() => setShowChat(true)}
          onPushDeal={() => {
            setUnifiedCreatorIntent(undefined);
            setShowUnifiedCreator(true);
          }}
        />
      )}

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {activeVibe && isMobile && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-20 left-4 right-4 z-[60] cursor-pointer"
              onClick={() => setShowVibeRadar(true)}
            >
              <Card className="venue-floating-panel">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <motion.div
                      className="w-2.5 h-2.5 shrink-0 rounded-full bg-[#16d9e8]"
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                    <div className="flex min-w-0 items-center gap-3 text-sm font-medium text-[#f4f7f8]">
                      <span className="text-green-300">{activeVibe.response_summary.yes} yes</span>
                      <span className="text-yellow-300">{activeVibe.response_summary.maybe} maybe</span>
                      <span className="text-red-300">{activeVibe.response_summary.no} no</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-[#a7b0b8]">{vibeTimeLeft}m left</span>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Founders Pass Popup */}
      {foundersCitySlug && (
        <VenueFoundersPopup
          open={showFoundersPopup}
          onClose={() => setShowFoundersPopup(false)}
          onDismiss={() => {
            localStorage.setItem('jv_founders_dismissed_venue', 'true');
            setShowFoundersPopup(false);
          }}
          citySlug={foundersCitySlug}
        />
      )}

    </div>
  );
}

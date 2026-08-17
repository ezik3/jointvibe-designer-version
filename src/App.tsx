import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserTierProvider } from "@/hooks/useUserTier";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import OnboardingGuard from "@/components/OnboardingGuard";
import VenueProtectedRoute from "./components/Venue/VenueProtectedRoute";
import AdminProtectedRoute from "./components/Admin/AdminProtectedRoute";
import POSProtectedRoute from "./components/POS/POSProtectedRoute";
// CustomerLayout is static – it wraps every customer route and its chrome
// should appear immediately (nav bar visible while page content loads).
import CustomerLayout from "./components/Customer/CustomerLayout";
import PaymentRequestPopup from "./components/Customer/PaymentRequestPopup";
import { VenueModulesProvider } from "./contexts/VenueModulesContext";
import NotFound from "./pages/NotFound";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "./lib/i18n";
import { LanguageInitializer } from "./components/LanguageInitializer";

// ── Shared spinner fallback ──────────────────────────────────────────────────
// Defined at module scope so it is never recreated on re-render.
const Spinner = ({ bg = "bg-background" }: { bg?: string }) => (
  <div className={`min-h-screen ${bg} flex items-center justify-center`}>
    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

const ContentSpinner = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <div className="animate-spin h-7 w-7 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

const AuthRouteAlias = ({ mode }: { mode?: "signup" }) => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  if (mode) {
    params.set("mode", mode);
  }

  const search = params.toString();
  return <Navigate to={{ pathname: "/auth", search: search ? `?${search}` : "", hash: location.hash }} replace />;
};

const ReferenceRouteAlias = ({
  to,
  query,
  hash,
}: {
  to: string;
  query?: Record<string, string>;
  hash?: string;
}) => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  Object.entries(query ?? {}).forEach(([key, value]) => params.set(key, value));

  return <Navigate to={{ pathname: to, search: params.toString() ? `?${params.toString()}` : "", hash: hash ?? location.hash }} replace />;
};

const ReferenceVenueContextAlias = ({
  normalTo,
  posTo,
  referenceTo,
}: {
  normalTo: string;
  posTo: string;
  referenceTo?: string;
}) => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const target = params.get("context") === "pos" ? posTo : referenceTo ?? normalTo;

  return <Navigate to={{ pathname: target, search: location.search, hash: location.hash }} replace />;
};

const ReferenceVenueAlias = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const venueId = params.get("venueId") ?? params.get("venue_id") ?? params.get("id");

  if (!params.has("presentation")) {
    params.set("presentation", "dashboard");
  }

  if (venueId?.trim()) {
    params.delete("venueId");
    params.delete("venue_id");
    params.delete("id");
    const search = params.toString();

    return <Navigate to={{ pathname: `/app/venue/${encodeURIComponent(venueId)}`, search: search ? `?${search}` : "", hash: location.hash }} replace />;
  }

  const search = params.toString();
  return <Navigate to={{ pathname: "/app/venue/reference", search: search ? `?${search}` : "", hash: location.hash }} replace />;
};

// ── Heavy role-specific layouts (lazy) ──────────────────────────────────────
// These are only downloaded when a user first visits that section.
// CustomerLayout is kept static so the customer chrome renders immediately.
const POSLayout    = lazy(() => import("./components/POS/POSLayout"));
const VenueLayout  = lazy(() => import("./components/Venue/VenueLayout"));
const VenueMenuDualShell = lazy(() => import("./components/Venue/VenueMenuDualShell"));
const AdminLayout  = lazy(() => import("./components/Admin/AdminLayout"));
const DriverLayout = lazy(() => import("./components/Driver/DriverLayout"));

// ── Auth & Registration pages ────────────────────────────────────────────────
const AuthPage               = lazy(() => import("./pages/Auth/AuthPage"));
const ForgotPassword         = lazy(() => import("./pages/Auth/ForgotPassword"));
const ResetPassword          = lazy(() => import("./pages/Auth/ResetPassword"));
const UserVerifyEmail        = lazy(() => import("./pages/Auth/User/VerifyEmail"));
const UserVerifyPhone        = lazy(() => import("./pages/Auth/User/VerifyPhone"));
const UserIDVerification     = lazy(() => import("./pages/Auth/User/IDVerification"));
const UserFacialRecognition  = lazy(() => import("./pages/Auth/User/FacialRecognition"));
const UserProfileSetup       = lazy(() => import("./pages/Auth/User/ProfileSetup"));
const UserVibeSelection      = lazy(() => import("./pages/Auth/User/VibeSelection"));
const VenueSignup            = lazy(() => import("./pages/Auth/Venue/Signup"));
const VenueVerifyEmail       = lazy(() => import("./pages/Auth/Venue/VerifyEmail"));
const VenueVerifyPhone       = lazy(() => import("./pages/Auth/Venue/VerifyPhone"));
const VenueEssentials        = lazy(() => import("./pages/Auth/Venue/VenueEssentials"));
const VenueBusinessDocumentChooser = lazy(() => import("./pages/Auth/Venue/BusinessDocumentChooser"));
const VenueUtilityBillUpload = lazy(() => import("./pages/Auth/Venue/UtilityBillUpload"));
const VenueVideoWalkthrough  = lazy(() => import("./pages/Auth/Venue/VideoWalkthrough"));
const VenueIDVerification    = lazy(() => import("./pages/Auth/Venue/IDVerification"));
const VenueFacialRecognition = lazy(() => import("./pages/Auth/Venue/FacialRecognition"));
const VenueProfileSetup      = lazy(() => import("./pages/Auth/Venue/ProfileSetup"));
const VenueOnboardingComplete = lazy(() => import("./pages/Auth/Venue/VenueOnboardingComplete"));
const VenuePendingApproval   = lazy(() => import("./pages/Auth/Venue/PendingApproval"));
const VenueVibeSelection     = lazy(() => import("./pages/Auth/Venue/VibeSelection"));

// ── Customer pages ────────────────────────────────────────────────────────────
const FeedRoute          = lazy(() => import("./pages/Customer/FeedRoute"));
const ImmersiveVenue     = lazy(() => import("./pages/Customer/ImmersiveVenue"));
const DiscoverNew        = lazy(() => import("./pages/Customer/DiscoverNew"));
const ProfileNew         = lazy(() => import("./pages/Customer/ProfileNew"));
const EditProfile        = lazy(() => import("./pages/Customer/EditProfile"));
const PublicProfile      = lazy(() => import("./pages/Customer/PublicProfile"));
const Wallet             = lazy(() => import("./pages/Customer/Wallet"));
const CityView           = lazy(() => import("./pages/Customer/CityView"));
const PublicPostView     = lazy(() => import("./pages/Customer/PublicPostView"));
const Top10              = lazy(() => import("./pages/Customer/Top10"));
const Notifications      = lazy(() => import("./pages/Customer/Notifications"));
const Explore            = lazy(() => import("./pages/Customer/Explore"));
const Maps               = lazy(() => import("./pages/Customer/Maps"));
const RunnerRequest      = lazy(() => import("./pages/Customer/RunnerRequest"));
const RunnerJobStatus    = lazy(() => import("./pages/Customer/RunnerJobStatus"));
const ScanToPayPage      = lazy(() => import("./pages/Customer/ScanToPayPage"));
const LiveHost           = lazy(() => import("./pages/Customer/Live/LiveHost"));
const LiveWatch          = lazy(() => import("./pages/Customer/Live/LiveWatch"));
const DesktopFeedPreview = lazy(() => import("./pages/Customer/DesktopFeedPreview"));
const ReferralDashboard  = lazy(() => import("./pages/Customer/ReferralDashboard"));
const StaffInviteAccept  = lazy(() => import("./pages/Customer/StaffInviteAccept"));
const SecuritySettings   = lazy(() => import("./pages/Customer/SecuritySettings"));

// ── Founders Pass – Customer ──────────────────────────────────────────────────
const FoundersPassLanding = lazy(() => import("./pages/Customer/FoundersPassLanding"));
const FoundersCities      = lazy(() => import("./pages/Customer/FoundersCities"));
const FoundersCheckout    = lazy(() => import("./pages/Customer/FoundersCheckout"));
const FoundersSuccess     = lazy(() => import("./pages/Customer/FoundersSuccess"));
const FoundersClaim       = lazy(() => import("./pages/Customer/FoundersClaim"));
const FoundersOffer       = lazy(() => import("./pages/Customer/FoundersOffer"));

// ── Founders Pass – Venue ────────────────────────────────────────────────────
const VenueFoundersLanding  = lazy(() => import("./pages/Venue/VenueFoundersLanding"));
const VenueFoundersCities   = lazy(() => import("./pages/Venue/VenueFoundersCities"));
const VenueFoundersCheckout = lazy(() => import("./pages/Venue/VenueFoundersCheckout"));
const VenueFoundersSuccess  = lazy(() => import("./pages/Venue/VenueFoundersSuccessPage"));
const VenueFoundersClaim    = lazy(() => import("./pages/Venue/VenueFoundersClaimPage"));
const VenueFoundersOffer    = lazy(() => import("./pages/Venue/VenueFoundersOffer"));

// ── Legal pages ───────────────────────────────────────────────────────────────
const PrivacyPolicy  = lazy(() => import("./pages/Legal/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/Legal/TermsOfService"));

// ── POS pages ─────────────────────────────────────────────────────────────────
const Dashboard       = lazy(() => import("./pages/POS/Dashboard"));
const NewOrder        = lazy(() => import("./pages/POS/NewOrder"));
const Kitchen         = lazy(() => import("./pages/POS/Kitchen"));
const Orders          = lazy(() => import("./pages/POS/Orders"));
const Menu            = lazy(() => import("./pages/POS/Menu"));
const Inventory       = lazy(() => import("./pages/POS/Inventory"));
const Tables          = lazy(() => import("./pages/POS/Tables"));
const Sales           = lazy(() => import("./pages/POS/Sales"));
const Staff           = lazy(() => import("./pages/POS/Staff"));
const Analytics       = lazy(() => import("./pages/POS/Analytics"));
const Settings        = lazy(() => import("./pages/POS/Settings"));
const FloorplanEditor = lazy(() => import("./pages/POS/FloorplanEditor"));
const EmployeeLogin   = lazy(() => import("./pages/POS/EmployeeLogin"));
const KioskMode       = lazy(() => import("./pages/POS/KioskMode"));

// ── Venue management pages ────────────────────────────────────────────────────
const VenueHome          = lazy(() => import("./pages/Venue/VenueHome"));
const VenueMenu          = lazy(() => import("./pages/Venue/VenueMenu"));
const VenueOrders        = lazy(() => import("./pages/Venue/VenueOrders"));
const VenueCredits       = lazy(() => import("./pages/Venue/VenueCredits"));
const VenueAssign        = lazy(() => import("./pages/Venue/VenueAssign"));
const VenueNotifications = lazy(() => import("./pages/Venue/VenueNotifications"));
const VenueOperationsDashboard = lazy(() => import("./pages/Venue/VenueOperationsDashboard"));
const VenueMessages      = lazy(() => import("./pages/Venue/VenueMessages"));
const VenueAccount       = lazy(() => import("./pages/Venue/VenueAccount"));
const VenueSettings      = lazy(() => import("./pages/Venue/VenueSettings"));
const VenueReservations  = lazy(() => import("./pages/Venue/VenueReservations"));
const VenueDeliveryMap   = lazy(() => import("./pages/Venue/VenueDeliveryMap"));
const SavingsCalculator  = lazy(() => import("./pages/Venue/SavingsCalculator"));
const VenueReferrals     = lazy(() => import("./pages/Venue/VenueReferrals"));

// ── Admin pages ───────────────────────────────────────────────────────────────
const AdminLogin              = lazy(() => import("./pages/Admin/AdminLogin"));
const AdminDashboardPage      = lazy(() => import("./pages/Admin/AdminDashboard"));
const AdminUsersPage          = lazy(() => import("./pages/Admin/AdminUsers"));
const AdminVenuesPage         = lazy(() => import("./pages/Admin/AdminVenues"));
const AdminTreasuryPage       = lazy(() => import("./pages/Admin/AdminTreasury"));
const AdminMintBurnPage       = lazy(() => import("./pages/Admin/AdminMintBurn"));
const AdminReserveTreasuryPage = lazy(() => import("./pages/Admin/AdminReserveTreasury"));
const AdminTransactionsPage   = lazy(() => import("./pages/Admin/AdminTransactions"));
const AdminDepositsPage       = lazy(() => import("./pages/Admin/AdminDeposits"));
const AdminWithdrawalsPage    = lazy(() => import("./pages/Admin/AdminWithdrawals"));
const AdminWalletFreezesPage  = lazy(() => import("./pages/Admin/AdminWalletFreezes"));
const AdminAuditLogPage       = lazy(() => import("./pages/Admin/AdminAuditLog"));
const AdminRolesPage          = lazy(() => import("./pages/Admin/AdminRoles"));
const AdminSettingsPage       = lazy(() => import("./pages/Admin/AdminSettings"));
const AdminAdCampaignsPage    = lazy(() => import("./pages/Admin/AdminAdCampaigns"));
const AdminVenueReportsPage   = lazy(() => import("./pages/Admin/AdminVenueReports"));
const VerificationDiagnostics = lazy(() => import("./pages/Admin/VerificationDiagnostics"));
const AdminReferrals          = lazy(() => import("./pages/Admin/AdminReferrals"));
const AdminVenueTiersPage     = lazy(() => import("./pages/Admin/AdminVenueTiers"));
const AdminVibeTagsPage       = lazy(() => import("./pages/Admin/AdminVibeTags"));
const AdminRunnerAnalyticsPage = lazy(() => import("./pages/Admin/AdminRunnerAnalytics"));

// ── Driver pages ──────────────────────────────────────────────────────────────
const DriverDashboard       = lazy(() => import("./pages/Driver/DriverDashboard"));
const DriverHistory         = lazy(() => import("./pages/Driver/DriverHistory"));
const DriverProfile         = lazy(() => import("./pages/Driver/DriverProfile"));
const DriverEarningsHistory = lazy(() => import("./pages/Driver/DriverEarningsHistory"));

// ── Advertiser pages ──────────────────────────────────────────────────────────
const AdvertiserLayout    = lazy(() => import("./pages/Advertiser/AdvertiserLayout"));
const AdvertiserLogin     = lazy(() => import("./pages/Advertiser/AdvertiserLogin"));
const AdvertiserOnboarding = lazy(() => import("./pages/Advertiser/AdvertiserOnboarding"));
const AdvertiserDashboard  = lazy(() => import("./pages/Advertiser/AdvertiserDashboard"));
const AdvertiserCampaigns  = lazy(() => import("./pages/Advertiser/AdvertiserCampaigns"));
const CampaignCreate      = lazy(() => import("./pages/Advertiser/CampaignCreate"));
const CampaignBooking     = lazy(() => import("./pages/Advertiser/CampaignBooking"));
const CampaignPreview     = lazy(() => import("./pages/Advertiser/CampaignPreview"));
const AdvertiserAnalytics = lazy(() => import("./pages/Advertiser/AdvertiserAnalytics"));
const AdvertiserBilling   = lazy(() => import("./pages/Advertiser/AdvertiserBilling"));
const AdvertiserSettings  = lazy(() => import("./pages/Advertiser/AdvertiserSettings"));

// ── Misc pages ────────────────────────────────────────────────────────────────
const GuestPaySuccess   = lazy(() => import("./pages/GuestPaySuccess"));
const GuestPayCancelled = lazy(() => import("./pages/GuestPayCancelled"));
const JoinLanding       = lazy(() => import("./pages/Join/JoinLanding"));

// ── QueryClient ───────────────────────────────────────────────────────────────
const queryClient = new QueryClient();

// Handles Stripe checkout returns that land on /?checkout_return=wallet&...
// Stripe is directed to the root URL to avoid Amplify path normalisation
// adding a trailing slash to /venue/wallet before the SPA loads.
// This component runs once on mount, detects the param, and does a
// client-side navigate to /venue/wallet with the remaining query params.
function CheckoutReturnHandler() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnTarget = params.get("checkout_return");
    if (returnTarget === "wallet") {
      params.delete("checkout_return");
      const qs = params.toString();
      navigate(`/venue/wallet${qs ? "?" + qs : ""}`, { replace: true });
    } else if (returnTarget === "venue_home") {
      params.delete("checkout_return");
      const qs = params.toString();
      navigate(`/venue/home${qs ? "?" + qs : ""}`, { replace: true });
    } else if (returnTarget === "user_wallet") {
      params.delete("checkout_return");
      const qs = params.toString();
      navigate(`/app/wallet${qs ? "?" + qs : ""}`, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const VenueShell = () => (
  <VenueProtectedRoute>
    <VenueModulesProvider>
      <Suspense fallback={<Spinner />}>
        <VenueLayout />
      </Suspense>
    </VenueModulesProvider>
  </VenueProtectedRoute>
);

const VenueReferenceMenuShell = () => (
  <VenueProtectedRoute>
    <VenueModulesProvider>
      <Suspense fallback={<Spinner />}>
        <VenueMenuDualShell />
      </Suspense>
    </VenueModulesProvider>
  </VenueProtectedRoute>
);

const isAdsPortal = window.location.hostname.startsWith("ads.");

const App = () => {
  // ── Ads subdomain: render ONLY advertiser routes ──────────────────────────
  if (isAdsPortal) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <AppErrorBoundary>
                <Routes>
                {/* Advertiser auth */}
                <Route path="/advertiser/login" element={
                  <Suspense fallback={<Spinner />}><AdvertiserLogin /></Suspense>
                } />
                <Route path="/advertiser/onboarding" element={
                  <ProtectedRoute>
                    <Suspense fallback={<Spinner />}><AdvertiserOnboarding /></Suspense>
                  </ProtectedRoute>
                } />

                {/* Advertiser dashboard (nested) */}
                <Route path="/advertiser" element={
                  <ProtectedRoute>
                    <Suspense fallback={<Spinner />}>
                      <AdvertiserLayout />
                    </Suspense>
                  </ProtectedRoute>
                }>
                  <Route index element={
                    <Suspense fallback={<Spinner />}><AdvertiserDashboard /></Suspense>
                  } />
                  <Route path="campaigns" element={
                    <Suspense fallback={<Spinner />}><AdvertiserCampaigns /></Suspense>
                  } />
                  <Route path="campaigns/new" element={
                    <Suspense fallback={<Spinner />}><CampaignCreate /></Suspense>
                  } />
                  <Route path="campaigns/:campaignId/book" element={
                    <Suspense fallback={<Spinner />}><CampaignBooking /></Suspense>
                  } />
                  <Route path="campaigns/:campaignId/preview" element={
                    <Suspense fallback={<Spinner />}><CampaignPreview /></Suspense>
                  } />
                  <Route path="analytics" element={
                    <Suspense fallback={<Spinner />}><AdvertiserAnalytics /></Suspense>
                  } />
                  <Route path="billing" element={
                    <Suspense fallback={<Spinner />}><AdvertiserBilling /></Suspense>
                  } />
                  <Route path="settings" element={
                    <Suspense fallback={<Spinner />}><AdvertiserSettings /></Suspense>
                  } />
                </Route>

                {/* Shared verification routes needed during advertiser signup */}
                <Route path="/user/verify-email" element={
                  <Suspense fallback={<Spinner />}><UserVerifyEmail /></Suspense>
                } />
                <Route path="/user/verify-phone" element={
                  <Suspense fallback={<Spinner />}><UserVerifyPhone /></Suspense>
                } />
                <Route path="/auth" element={
                  <Suspense fallback={<Spinner />}><AuthPage /></Suspense>
                } />
                <Route path="/auth/forgot-password" element={
                  <Suspense fallback={<Spinner />}><ForgotPassword /></Suspense>
                } />
                <Route path="/auth/reset-password" element={
                  <Suspense fallback={<Spinner />}><ResetPassword /></Suspense>
                } />

                {/* Catch-all: redirect everything else to advertiser login */}
                <Route path="/" element={<Navigate to="/advertiser/login" replace />} />
                <Route path="*" element={<Navigate to="/advertiser/login" replace />} />
                </Routes>
              </AppErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // ── Normal app (jointvibe.app) ────────────────────────────────────────────
  return (
  <I18nextProvider i18n={i18n}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CheckoutReturnHandler />
          <AuthProvider>
            <AppErrorBoundary>
              <UserTierProvider>
                {/* Language Initializer - ensures correct language on app startup */}
                <LanguageInitializer />
                {/* Global Payment Request Popup - runs on all routes when user is logged in */}
                <PaymentRequestPopup />
                <Routes>

            {/* ── Auth Routes ─────────────────────────────────────────────── */}
            <Route path="/auth" element={
              <Suspense fallback={<Spinner />}>
                <AuthPage />
              </Suspense>
            } />
            {/* Redirect /auth/login to /auth – POS login is at /venue/pos/login */}
            <Route path="/auth/login" element={<AuthRouteAlias />} />
            <Route path="/auth/signup" element={<AuthRouteAlias mode="signup" />} />
            <Route path="/auth/forgot-password" element={
              <Suspense fallback={<Spinner />}><ForgotPassword /></Suspense>
            } />
            <Route path="/auth/reset-password" element={
              <Suspense fallback={<Spinner />}><ResetPassword /></Suspense>
            } />

            {/* ── User Registration Flow ──────────────────────────────────── */}
            <Route path="/user/verify-email" element={
              <Suspense fallback={<Spinner />}><UserVerifyEmail /></Suspense>
            } />
            <Route path="/user/verify-phone" element={
              <Suspense fallback={<Spinner />}><UserVerifyPhone /></Suspense>
            } />
            <Route path="/user/id-verification" element={
              <Suspense fallback={<Spinner />}><UserIDVerification /></Suspense>
            } />
            <Route path="/user/facial-recognition" element={
              <Suspense fallback={<Spinner />}><UserFacialRecognition /></Suspense>
            } />
            <Route path="/user/profile-setup" element={
              <Suspense fallback={<Spinner />}><UserProfileSetup /></Suspense>
            } />
            <Route path="/user/vibe-selection" element={
              <Suspense fallback={<Spinner />}><UserVibeSelection /></Suspense>
            } />

            {/* ── Venue Pre-Signup Calculator ─────────────────────────────── */}
            <Route path="/venue/savings-calculator" element={
              <Suspense fallback={<Spinner bg="bg-zinc-950" />}>
                <SavingsCalculator />
              </Suspense>
            } />

            {/* ── Venue Registration Flow ─────────────────────────────────── */}
            <Route path="/venue/signup" element={
              <Suspense fallback={<Spinner />}><VenueSignup /></Suspense>
            } />
            <Route path="/venue/verify-email" element={
              <Suspense fallback={<Spinner />}><VenueVerifyEmail /></Suspense>
            } />
            <Route path="/venue/verify-phone" element={
              <Suspense fallback={<Spinner />}><VenueVerifyPhone /></Suspense>
            } />
            <Route path="/venue/essentials" element={
              <Suspense fallback={<Spinner />}><VenueEssentials /></Suspense>
            } />
            <Route path="/venue/verification" element={
              <Suspense fallback={<Spinner />}><VenueBusinessDocumentChooser /></Suspense>
            } />
            <Route path="/venue/utility-bill" element={
              <Suspense fallback={<Spinner />}><VenueUtilityBillUpload /></Suspense>
            } />
            <Route path="/venue/video-walkthrough" element={
              <Suspense fallback={<Spinner />}><VenueVideoWalkthrough /></Suspense>
            } />
            <Route path="/venue/id-verification" element={
              <Suspense fallback={<Spinner />}><VenueIDVerification /></Suspense>
            } />
            <Route path="/venue/facial-recognition" element={
              <Suspense fallback={<Spinner />}><VenueFacialRecognition /></Suspense>
            } />
            <Route path="/venue/profile-setup" element={
              <Suspense fallback={<Spinner />}><VenueProfileSetup /></Suspense>
            } />
            <Route path="/venue/complete" element={
              <Suspense fallback={<Spinner />}><VenueOnboardingComplete /></Suspense>
            } />
            <Route path="/venue/pending-approval" element={
              <Suspense fallback={<Spinner />}><VenuePendingApproval /></Suspense>
            } />
            <Route path="/venue/vibe-selection" element={
              <Suspense fallback={<Spinner bg="bg-zinc-950" />}><VenueVibeSelection /></Suspense>
            } />

            {/* ── Desktop Feed Preview (isolated test page, no auth) ──────── */}
            <Route path="/app/desktop-preview" element={
              <Suspense fallback={<Spinner bg="bg-zinc-950" />}>
                <DesktopFeedPreview />
              </Suspense>
            } />

            {/* ── Customer App Routes ─────────────────────────────────────── */}
            {/*
              CustomerLayout is static so the nav chrome (bottom tab bar etc.)
              renders instantly. Only the page content is lazy-loaded.
            */}
            <Route path="/app/feed/immersive" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <FeedRoute />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/venue/:id" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <ImmersiveVenue />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/city-view" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <CityView />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/public-post" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <PublicPostView />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/post/:postId" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <PublicPostView />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/explore" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <Explore />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/top10" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <Top10 />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/venues" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <DiscoverNew />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/profile" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <ProfileNew />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/profile/edit" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <EditProfile />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/user/:userId" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <PublicProfile />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/wallet" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <Wallet />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/pay/:token" element={
              <Suspense fallback={<Spinner />}>
                <ScanToPayPage />
              </Suspense>
            } />
            <Route path="/app/messages" element={<Navigate to="/app/notifications" replace />} />
            <Route path="/app/notifications" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <Notifications />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/maps" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <Maps />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/runner/request" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-background" />}>
                    <RunnerRequest />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/runner/jobs/:jobId" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-background" />}>
                    <RunnerJobStatus />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/referrals" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-black" />}>
                    <ReferralDashboard />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/settings/security" element={
              <OnboardingGuard>
                <CustomerLayout>
                  <Suspense fallback={<Spinner bg="bg-zinc-950" />}>
                    <SecuritySettings />
                  </Suspense>
                </CustomerLayout>
              </OnboardingGuard>
            } />
            <Route path="/app/staff-invite/:invitationId" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner />}>
                  <StaffInviteAccept />
                </Suspense>
              </OnboardingGuard>
            } />

            {/* ── Live Streaming Routes ───────────────────────────────────── */}
            <Route path="/app/live/host" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner bg="bg-black" />}>
                  <LiveHost />
                </Suspense>
              </OnboardingGuard>
            } />
            <Route path="/app/live/watch/:streamId" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner bg="bg-black" />}>
                  <LiveWatch />
                </Suspense>
              </OnboardingGuard>
            } />
            <Route path="/app/live/:streamId" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner bg="bg-black" />}>
                  <LiveWatch />
                </Suspense>
              </OnboardingGuard>
            } />

            {/* ── Founders Pass Routes – Customer ─────────────────────────── */}
            <Route path="/app/founders" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner />}><FoundersPassLanding /></Suspense>
              </OnboardingGuard>
            } />
            <Route path="/app/founders/cities" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner />}><FoundersCities /></Suspense>
              </OnboardingGuard>
            } />
            <Route path="/app/founders/checkout/:citySlug" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner />}><FoundersCheckout /></Suspense>
              </OnboardingGuard>
            } />
            <Route path="/app/founders/success" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner />}><FoundersSuccess /></Suspense>
              </OnboardingGuard>
            } />
            <Route path="/app/founders/claim" element={
              <OnboardingGuard>
                <Suspense fallback={<Spinner />}><FoundersClaim /></Suspense>
              </OnboardingGuard>
            } />
            <Route path="/app/founders/offer" element={
              <Suspense fallback={<Spinner />}><FoundersOffer /></Suspense>
            } />

            {/* ── Venue Management Routes ─────────────────────────────────── */}
            {/*
              VenueLayout is lazy – venue owners load it once on first visit;
              the chunk is then cached for subsequent venue page navigations.
              VenueModulesProvider is a lightweight context kept static.
            */}
            <Route path="/venue/dashboard" element={<Navigate to="/venue/operations" replace />} />
            <Route path="/venue/reference/menu" element={<VenueReferenceMenuShell />} />

            <Route path="/venue" element={<VenueShell />}>
              <Route index element={<Navigate to="/venue/home" replace />} />
              <Route path="operations" element={<Suspense fallback={<ContentSpinner />}><VenueOperationsDashboard /></Suspense>} />
              <Route path="patron-inspection" element={<Suspense fallback={<ContentSpinner />}><VenueOperationsDashboard presentation="patron-inspection" /></Suspense>} />
              <Route path="home" element={<Suspense fallback={<ContentSpinner />}><VenueHome /></Suspense>} />
              <Route path="menu" element={<Suspense fallback={<ContentSpinner />}><VenueMenu /></Suspense>} />
              <Route path="orders" element={<Suspense fallback={<ContentSpinner />}><VenueOrders /></Suspense>} />
              <Route path="reservations" element={<Suspense fallback={<ContentSpinner />}><VenueReservations /></Suspense>} />
              <Route path="deliveries" element={<Suspense fallback={<ContentSpinner />}><VenueDeliveryMap /></Suspense>} />
              <Route path="wallet" element={<Suspense fallback={<ContentSpinner />}><VenueCredits /></Suspense>} />
              <Route path="credits" element={<Navigate to="/venue/wallet" replace />} />
              <Route path="assign" element={<Suspense fallback={<ContentSpinner />}><VenueAssign /></Suspense>} />
              <Route path="notifications" element={<Suspense fallback={<ContentSpinner />}><VenueNotifications /></Suspense>} />
              <Route path="messages" element={<Suspense fallback={<ContentSpinner />}><VenueMessages /></Suspense>} />
              <Route path="account" element={<Suspense fallback={<ContentSpinner />}><VenueAccount /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<ContentSpinner />}><VenueSettings /></Suspense>} />
              <Route path="referrals" element={<Suspense fallback={<ContentSpinner />}><VenueReferrals /></Suspense>} />
            </Route>

            {/* ── Founders Pass Routes – Venue ─────────────────────────────── */}
            <Route path="/venue/founders/offer" element={
              <Suspense fallback={<Spinner />}><VenueFoundersOffer /></Suspense>
            } />
            <Route path="/venue/founders" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner />}><VenueFoundersLanding /></Suspense>
              </ProtectedRoute>
            } />
            <Route path="/venue/founders/cities" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner />}><VenueFoundersCities /></Suspense>
              </ProtectedRoute>
            } />
            <Route path="/venue/founders/checkout/:citySlug" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner />}><VenueFoundersCheckout /></Suspense>
              </ProtectedRoute>
            } />
            <Route path="/venue/founders/success" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner />}><VenueFoundersSuccess /></Suspense>
              </ProtectedRoute>
            } />
            <Route path="/venue/founders/claim" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner />}><VenueFoundersClaim /></Suspense>
              </ProtectedRoute>
            } />

            {/* ── POS Routes ──────────────────────────────────────────────── */}
            {/*
              POSLayout is lazy – POS staff load it once, non-POS users
              (customers, admins, drivers) never download it at all.
            */}
            <Route path="/venue/pos/login" element={
              <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                <EmployeeLogin />
              </Suspense>
            } />
            <Route path="/venue/pos/dashboard" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Dashboard /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/new-order" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><NewOrder /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/kitchen" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Kitchen /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/orders" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Orders /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/pre-orders" element={
              <POSProtectedRoute>
                <Navigate to="/venue/pos/orders?tab=preorders" replace />
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/menu" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Menu /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/inventory" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Inventory /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/tables" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Tables /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/floorplan" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><FloorplanEditor /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/sales" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Sales /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/staff" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Staff /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/analytics" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Analytics /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/settings" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-slate-900" />}>
                  <POSLayout><Settings /></POSLayout>
                </Suspense>
              </POSProtectedRoute>
            } />
            <Route path="/venue/pos/kiosk" element={
              <POSProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <KioskMode />
                </Suspense>
              </POSProtectedRoute>
            } />

            {/* ── Admin Routes ────────────────────────────────────────────── */}
            {/*
              AdminLayout is lazy – admins load it once; regular users and
              venue owners never download the admin bundle.
            */}
            <Route path="/admin/login" element={
              <Suspense fallback={<Spinner />}><AdminLogin /></Suspense>
            } />
            <Route path="/admin" element={
              <AdminProtectedRoute>
                <Navigate to="/admin/dashboard" replace />
              </AdminProtectedRoute>
            } />
            <Route path="/admin/dashboard" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminDashboardPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminUsersPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/venues" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminVenuesPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/ad-campaigns" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminAdCampaignsPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/treasury" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminTreasuryPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/mint-burn" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminMintBurnPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/reserve-treasury" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminReserveTreasuryPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/transactions" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminTransactionsPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/deposits" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminDepositsPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/withdrawals" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminWithdrawalsPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/wallet-freezes" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminWalletFreezesPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/audit-log" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminAuditLogPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/roles" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminRolesPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/venue-reports" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminVenueReportsPage />
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminSettingsPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/verification-diagnostics" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <VerificationDiagnostics />
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/referrals" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminReferrals /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/venue-tiers" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminVenueTiersPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/vibe-tags" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminVibeTagsPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/runner-analytics" element={
              <AdminProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdminLayout><AdminRunnerAnalyticsPage /></AdminLayout>
                </Suspense>
              </AdminProtectedRoute>
            } />

            {/* ── Driver Routes ───────────────────────────────────────────── */}
            <Route path="/driver/dashboard" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-background" />}>
                  <DriverLayout><DriverDashboard /></DriverLayout>
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/driver/deliveries" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-background" />}>
                  <DriverLayout><DriverDashboard /></DriverLayout>
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/driver/history" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-background" />}>
                  <DriverLayout><DriverHistory /></DriverLayout>
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/driver/profile" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-background" />}>
                  <DriverLayout><DriverProfile /></DriverLayout>
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/driver/earnings" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner bg="bg-background" />}>
                  <DriverLayout><DriverEarningsHistory /></DriverLayout>
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/driver" element={<Navigate to="/driver/dashboard" replace />} />

            {/* ── Advertiser Portal Routes ────────────────────────────────── */}
            <Route path="/advertiser/login" element={
              <Suspense fallback={<Spinner />}><AdvertiserLogin /></Suspense>
            } />
            <Route path="/advertiser/onboarding" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner />}><AdvertiserOnboarding /></Suspense>
              </ProtectedRoute>
            } />
            {/*
              Advertiser uses nested routes with <Outlet> inside AdvertiserLayout.
              The outer Suspense handles the layout loading; per-child Suspense
              keeps AdvertiserLayout visible while each sub-page loads.
            */}
            <Route path="/advertiser" element={
              <ProtectedRoute>
                <Suspense fallback={<Spinner />}>
                  <AdvertiserLayout />
                </Suspense>
              </ProtectedRoute>
            }>
              <Route index element={
                <Suspense fallback={<Spinner />}><AdvertiserDashboard /></Suspense>
              } />
              <Route path="campaigns" element={
                <Suspense fallback={<Spinner />}><AdvertiserCampaigns /></Suspense>
              } />
              <Route path="campaigns/new" element={
                <Suspense fallback={<Spinner />}><CampaignCreate /></Suspense>
              } />
              <Route path="campaigns/:campaignId/book" element={
                <Suspense fallback={<Spinner />}><CampaignBooking /></Suspense>
              } />
              <Route path="campaigns/:campaignId/preview" element={
                <Suspense fallback={<Spinner />}><CampaignPreview /></Suspense>
              } />
              <Route path="analytics" element={
                <Suspense fallback={<Spinner />}><AdvertiserAnalytics /></Suspense>
              } />
              <Route path="billing" element={
                <Suspense fallback={<Spinner />}><AdvertiserBilling /></Suspense>
              } />
              <Route path="settings" element={
                <Suspense fallback={<Spinner />}><AdvertiserSettings /></Suspense>
              } />
            </Route>

            {/* ── Guest Pay Routes (public, no auth required) ─────────────── */}
            <Route path="/guest-pay/success" element={
              <Suspense fallback={<Spinner />}><GuestPaySuccess /></Suspense>
            } />
            <Route path="/guest-pay/cancelled" element={
              <Suspense fallback={<Spinner />}><GuestPayCancelled /></Suspense>
            } />

            {/* ── Join / Referral Landing ─────────────────────────────────── */}
            <Route path="/join" element={
              <Suspense fallback={<Spinner />}><JoinLanding /></Suspense>
            } />

            {/* ── Legal Pages (public, no auth required) ───────────────────── */}
            <Route path="/privacy" element={
              <Suspense fallback={<Spinner />}><PrivacyPolicy /></Suspense>
            } />
            <Route path="/privacy.html" element={
              <Suspense fallback={<Spinner />}><PrivacyPolicy /></Suspense>
            } />
            <Route path="/terms" element={
              <Suspense fallback={<Spinner />}><TermsOfService /></Suspense>
            } />
            <Route path="/terms.html" element={
              <Suspense fallback={<Spinner />}><TermsOfService /></Suspense>
            } />

            {/* End-user reference screen aliases */}
            <Route path="/index.html" element={<ReferenceRouteAlias to="/auth" />} />
            <Route path="/forgot-password.html" element={<ReferenceRouteAlias to="/auth/forgot-password" />} />
            <Route path="/savings-calculator.html" element={<ReferenceRouteAlias to="/venue/savings-calculator" query={{ presentation: "reference" }} />} />
            <Route path="/dashboard.html" element={<ReferenceRouteAlias to="/app/feed/immersive" query={{ presentation: "dashboard" }} />} />
            <Route path="/explore.html" element={<ReferenceRouteAlias to="/app/explore" query={{ presentation: "dashboard" }} />} />
            <Route path="/alters.html" element={<ReferenceRouteAlias to="/app/notifications" query={{ presentation: "dashboard" }} />} />
            <Route path="/map.html" element={<ReferenceRouteAlias to="/app/maps" query={{ presentation: "dashboard" }} />} />
            <Route path="/profile.html" element={<ReferenceRouteAlias to="/app/profile" query={{ presentation: "dashboard" }} />} />
            <Route path="/runner.html" element={<ReferenceRouteAlias to="/app/runner/request" query={{ presentation: "dashboard" }} />} />
            <Route path="/top10.html" element={<ReferenceRouteAlias to="/app/top10" query={{ presentation: "dashboard" }} />} />
            <Route path="/venue.html" element={<ReferenceVenueAlias />} />
            <Route path="/venues.html" element={<ReferenceRouteAlias to="/app/venues" query={{ presentation: "dashboard" }} />} />
            <Route path="/wallet.html" element={<ReferenceRouteAlias to="/app/wallet" query={{ presentation: "dashboard" }} />} />

            {/* Venue reference screen aliases. Kept under /venue so their names do not collide with EndUser routes. */}
            <Route path="/venue/login.html" element={<ReferenceRouteAlias to="/auth" query={{ role: "venue" }} />} />
            <Route path="/venue/signup.html" element={<ReferenceRouteAlias to="/venue/signup" query={{ source: "reference" }} />} />
            <Route path="/venue/verify-email.html" element={<ReferenceRouteAlias to="/venue/verify-email" query={{ source: "reference" }} />} />
            <Route path="/venue/email-verified.html" element={<ReferenceRouteAlias to="/venue/verify-email" query={{ state: "email-verified", source: "reference" }} />} />
            <Route path="/venue/verify-phone.html" element={<ReferenceRouteAlias to="/venue/verify-phone" query={{ source: "reference" }} />} />
            <Route path="/venue/venue-details.html" element={<ReferenceRouteAlias to="/venue/essentials" query={{ source: "reference" }} />} />
            <Route path="/venue/verification.html" element={<ReferenceRouteAlias to="/venue/verification" query={{ source: "reference" }} />} />
            <Route path="/venue/verification-upload.html" element={<ReferenceRouteAlias to="/venue/utility-bill" query={{ source: "reference" }} />} />
            <Route path="/venue/facial-verification.html" element={<ReferenceRouteAlias to="/venue/facial-recognition" query={{ source: "reference" }} />} />
            <Route path="/venue/facial-capture.html" element={<ReferenceRouteAlias to="/venue/facial-recognition" query={{ capture: "1", source: "reference" }} />} />
            <Route path="/venue/profile-setup.html" element={<ReferenceRouteAlias to="/venue/profile-setup" query={{ source: "reference" }} />} />
            <Route path="/venue/complete.html" element={<ReferenceRouteAlias to="/venue/complete" query={{ source: "reference" }} />} />
            <Route path="/venue/founders-offer.html" element={<ReferenceRouteAlias to="/venue/founders/offer" query={{ source: "reference" }} />} />
            <Route path="/venue/index.html" element={<ReferenceRouteAlias to="/venue/home" />} />
            <Route path="/venue/classic.html" element={<ReferenceRouteAlias to="/venue/home" query={{ mode: "classic" }} />} />
            <Route path="/venue/operations.html" element={<ReferenceRouteAlias to="/venue/operations" />} />
            <Route path="/venue/menu.html" element={<ReferenceVenueContextAlias normalTo="/venue/menu" posTo="/venue/pos/menu" referenceTo="/venue/reference/menu" />} />
            <Route path="/venue/orders.html" element={<ReferenceRouteAlias to="/venue/orders" />} />
            <Route path="/venue/reservations.html" element={<ReferenceRouteAlias to="/venue/reservations" />} />
            <Route path="/venue/deliveries.html" element={<ReferenceRouteAlias to="/venue/deliveries" />} />
            <Route path="/venue/wallet.html" element={<ReferenceRouteAlias to="/venue/wallet" />} />
            <Route path="/venue/staff.html" element={<ReferenceVenueContextAlias normalTo="/venue/assign" posTo="/venue/pos/staff" />} />
            <Route path="/venue/patron-inspection.html" element={<ReferenceRouteAlias to="/venue/patron-inspection" />} />
            <Route path="/venue/notifications.html" element={<ReferenceRouteAlias to="/venue/notifications" />} />
            <Route path="/venue/messages.html" element={<ReferenceRouteAlias to="/venue/messages" />} />
            <Route path="/venue/account.html" element={<ReferenceRouteAlias to="/venue/account" query={{ source: "reference" }} />} />
            <Route path="/venue/settings.html" element={<ReferenceRouteAlias to="/venue/settings" />} />
            <Route path="/venue/pos.html" element={<ReferenceRouteAlias to="/venue/pos/new-order" />} />
            <Route path="/venue/pos-dashboard.html" element={<ReferenceRouteAlias to="/venue/pos/dashboard" />} />
            <Route path="/venue/pos-orders.html" element={<ReferenceRouteAlias to="/venue/pos/orders" />} />
            <Route path="/venue/kitchen.html" element={<ReferenceRouteAlias to="/venue/pos/kitchen" />} />
            <Route path="/venue/inventory.html" element={<ReferenceRouteAlias to="/venue/pos/inventory" />} />
            <Route path="/venue/tables.html" element={<ReferenceRouteAlias to="/venue/pos/tables" />} />
            <Route path="/venue/floorplan.html" element={<ReferenceRouteAlias to="/venue/pos/floorplan" />} />
            <Route path="/venue/floorplan-editor.html" element={<ReferenceRouteAlias to="/venue/pos/floorplan" query={{ mode: "editor" }} />} />
            <Route path="/venue/pos-analytics.html" element={<ReferenceRouteAlias to="/venue/pos/analytics" />} />
            <Route path="/venue/pos-settings.html" element={<ReferenceRouteAlias to="/venue/pos/settings" />} />

            {/* ── Redirects ───────────────────────────────────────────────── */}
            {/* Homepage — serves AuthPage so crawlers see real content at / */}
            <Route path="/"         element={<Suspense fallback={<Spinner />}><AuthPage /></Suspense>} />
            <Route path="/app"      element={<Navigate to="/app/feed/immersive" replace />} />
            <Route path="/app/feed" element={<Navigate to="/app/feed/immersive" replace />} />
            <Route path="/venue"    element={<Navigate to="/venue/home" replace />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
                </Routes>
              </UserTierProvider>
            </AppErrorBoundary>
          </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </I18nextProvider>
  );
};

export default App;

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  BellRing,
  Gavel,
  ListChecks,
  LockKeyhole,
  Radio,
  ScanFace,
  Shield,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import VenueNotifications from "./VenueNotifications";
import VenueAssign from "./VenueAssign";
import "./venue-operations.css";

type OperationsModuleId =
  | "alerts"
  | "patron_inspection"
  | "moderation"
  | "incident_timeline"
  | "approval_security"
  | "analytics";

type OperationsPresentation = "embedded" | "patron-inspection";

interface OperationsPermissions {
  canApproveEntry: boolean;
  canManageModeration: boolean;
  canManageCautionPrefs: boolean;
  canViewInternalPatrons: boolean;
  canViewOperationalNotifications: boolean;
}

interface VenueContext {
  id: string;
  name: string;
}

interface ModuleDefinition {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyCopy: string;
  icon: LucideIcon;
}

interface OperationsNavigationProps {
  selectedModule: OperationsModuleId;
  moduleEnabled: Record<OperationsModuleId, boolean>;
  onSelect: (moduleId: OperationsModuleId) => void;
  alertCount?: number | null;
}

type RpcResult<T> = { data: T; error: { message?: string } | null };

const EMPTY_PERMISSIONS: OperationsPermissions = {
  canApproveEntry: false,
  canManageModeration: false,
  canManageCautionPrefs: false,
  canViewInternalPatrons: false,
  canViewOperationalNotifications: false,
};

const MODULES: Record<OperationsModuleId, ModuleDefinition> = {
  alerts: {
    label: "Alerts panel",
    eyebrow: "STAFF ONLY",
    title: "Operational alerts",
    description: "A single place for venue alerts that need staff attention.",
    emptyTitle: "No alerts right now",
    emptyCopy: "Operational notifications will appear here when a staff action is needed.",
    icon: BellRing,
  },
  patron_inspection: {
    label: "Patron inspection",
    eyebrow: "GUEST SAFETY",
    title: "Patron inspection",
    description: "Review patron activity and staff notes when an issue needs follow-up.",
    emptyTitle: "No patron reviews pending",
    emptyCopy: "Patron checks requiring venue review will appear here.",
    icon: ScanFace,
  },
  moderation: {
    label: "Moderation tools",
    eyebrow: "VENUE SAFETY",
    title: "Moderation tools",
    description: "Manage reports and keep the venue experience safe for guests.",
    emptyTitle: "No moderation actions pending",
    emptyCopy: "Reported activity that needs a decision will appear here.",
    icon: Gavel,
  },
  incident_timeline: {
    label: "Incident timeline",
    eyebrow: "ACTIVITY LOG",
    title: "Incident timeline",
    description: "A chronological record of operational events and staff follow-ups.",
    emptyTitle: "No incidents logged",
    emptyCopy: "Incident records will be shown here when they are created.",
    icon: ListChecks,
  },
  approval_security: {
    label: "Approval & security",
    eyebrow: "ACCESS CONTROL",
    title: "Approval & security",
    description: "Review venue approvals and account security requests.",
    emptyTitle: "No approvals pending",
    emptyCopy: "Security and approval requests will appear here.",
    icon: BadgeCheck,
  },
  analytics: {
    label: "Venue analytics",
    eyebrow: "UPGRADE REQUIRED",
    title: "Venue analytics",
    description: "Analytics becomes available when advanced venue reporting is enabled.",
    emptyTitle: "Analytics is locked",
    emptyCopy: "Enable advanced reporting to view operational performance trends.",
    icon: BarChart3,
  },
};

const MODULE_ORDER: OperationsModuleId[] = [
  "alerts",
  "patron_inspection",
  "moderation",
  "incident_timeline",
  "approval_security",
  "analytics",
];

const MODULE_HASHES: Record<OperationsModuleId, string> = {
  alerts: "alerts",
  patron_inspection: "patrons",
  moderation: "moderation",
  incident_timeline: "incidents",
  approval_security: "security",
  analytics: "analytics",
};

const HASH_MODULES: Record<string, OperationsModuleId> = Object.fromEntries(
  Object.entries(MODULE_HASHES).map(([moduleId, hash]) => [hash, moduleId as OperationsModuleId]),
);

function getInitialModule(): OperationsModuleId {
  return HASH_MODULES[window.location.hash.slice(1)] ?? "alerts";
}

function OperationsNavigation({ selectedModule, moduleEnabled, onSelect, alertCount }: OperationsNavigationProps) {
  return (
    <aside className="venue-operations-sidebar" aria-label="Operations navigation">
      <p>OPERATIONS</p>
      <nav>
        {MODULE_ORDER.map((moduleId) => {
          const module = MODULES[moduleId];
          const ModuleIcon = module.icon;
          const isActive = selectedModule === moduleId;
          const isEnabled = moduleEnabled[moduleId];

          return (
            <button
              key={moduleId}
              className={`venue-operations-nav__item${isActive ? " venue-operations-nav__item--active" : ""}`}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(moduleId)}
            >
              <ModuleIcon aria-hidden="true" />
              <span>{module.label}</span>
              {moduleId === "alerts" && alertCount !== null && alertCount !== undefined && (
                <b className="venue-operations-nav__count">{alertCount}</b>
              )}
              {!isEnabled && <LockKeyhole aria-label="Locked" />}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export default function VenueOperationsDashboard({
  presentation = "embedded",
}: {
  presentation?: OperationsPresentation;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [venueContext, setVenueContext] = useState<VenueContext | null>(null);
  const [permissions, setPermissions] = useState<OperationsPermissions>(EMPTY_PERMISSIONS);
  const [operationalUnreadCount, setOperationalUnreadCount] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState<OperationsModuleId>(() => (
    presentation === "patron-inspection" ? "patron_inspection" : getInitialModule()
  ));

  const hasOperationalAccess = useMemo(() => Object.values(permissions).some(Boolean), [permissions]);
  const moduleEnabled = useMemo<Record<OperationsModuleId, boolean>>(
    () => ({
      alerts: permissions.canViewOperationalNotifications,
      patron_inspection: permissions.canViewInternalPatrons || permissions.canManageModeration,
      moderation: permissions.canManageModeration,
      incident_timeline: permissions.canManageModeration,
      approval_security: permissions.canApproveEntry || permissions.canManageCautionPrefs,
      analytics: false,
    }),
    [permissions],
  );

  useEffect(() => {
    const loadDashboardAccess = async () => {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          setPermissions(EMPTY_PERMISSIONS);
          setVenueContext(null);
          return;
        }

        const resolvedVenue = await resolveVenueContext(user.id);
        if (!resolvedVenue) {
          setPermissions(EMPTY_PERMISSIONS);
          setVenueContext(null);
          return;
        }

        setVenueContext(resolvedVenue);
        localStorage.setItem("jv_current_venue_id", resolvedVenue.id);
        localStorage.setItem("jv_current_venue_name", resolvedVenue.name);

        const [approveResult, moderationResult, cautionResult, internalPatronResult, notificationsProbeResult] = await Promise.allSettled([
          supabase.rpc("can_approve_venue_entry", { p_venue_id: resolvedVenue.id }),
          supabase.rpc("can_manage_venue_patron_moderation", { p_venue_id: resolvedVenue.id }),
          supabase.rpc("can_manage_venue_caution_preferences", { p_venue_id: resolvedVenue.id }),
          supabase.rpc("can_view_venue_internal_patrons", { p_venue_id: resolvedVenue.id }),
          supabase.rpc("get_venue_staff_operational_notifications", {
            p_venue_id: resolvedVenue.id,
            p_include_read: false,
            p_limit: 1,
          }),
        ]);

        setPermissions({
          canApproveEntry: rpcBoolean(approveResult),
          canManageModeration: rpcBoolean(moderationResult),
          canManageCautionPrefs: rpcBoolean(cautionResult),
          canViewInternalPatrons: rpcBoolean(internalPatronResult),
          canViewOperationalNotifications: rpcReadableResult(notificationsProbeResult),
        });
      } catch (error) {
        console.error("Failed to load venue operations access", error);
        setPermissions(EMPTY_PERMISSIONS);
        setVenueContext(null);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboardAccess();
  }, []);

  useEffect(() => {
    if (presentation !== "embedded") return;

    const syncModuleFromHash = () => setSelectedModule(getInitialModule());
    window.addEventListener("hashchange", syncModuleFromHash);
    return () => window.removeEventListener("hashchange", syncModuleFromHash);
  }, [presentation]);

  const selectModule = (moduleId: OperationsModuleId) => {
    if (presentation === "patron-inspection") {
      if (moduleId !== "patron_inspection") {
        navigate(`/venue/operations#${MODULE_HASHES[moduleId]}`);
      }
      return;
    }

    setSelectedModule(moduleId);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${MODULE_HASHES[moduleId]}`);
  };

  if (loading) {
    return <OperationsState loading />;
  }

  if (!venueContext || !hasOperationalAccess) {
    return <OperationsState />;
  }

  const selectedDefinition = MODULES[selectedModule];
  const SelectedIcon = selectedDefinition.icon;

  if (presentation === "patron-inspection" && moduleEnabled.patron_inspection) {
    return (
      <div className="venue-operations-page venue-operations-page--patron-inspection">
        <VenueAssign
          headingTitle="Patron inspection"
          headingDescription="Approve entry, manage conduct actions, and review venue safety history."
          navigation={(
            <OperationsNavigation
              selectedModule={selectedModule}
              moduleEnabled={moduleEnabled}
              onSelect={selectModule}
              alertCount={operationalUnreadCount}
            />
          )}
        />
      </div>
    );
  }

  return (
    <div className="venue-operations-page">
      {selectedModule !== "patron_inspection" && (
        <header className="venue-operations-heading">
          <div>
            <h1>Operations</h1>
            <p>Keep staff, guests, and service activity on track.</p>
          </div>
          <span className="venue-operations-status"><Radio aria-hidden="true" />Live monitoring</span>
        </header>
      )}

      <div className="venue-operations-layout">
        <OperationsNavigation
          selectedModule={selectedModule}
          moduleEnabled={moduleEnabled}
          onSelect={selectModule}
          alertCount={operationalUnreadCount}
        />

        <section className="venue-operations-content" aria-live="polite">
          <header className="venue-operations-content__header">
            <div>
              <p>{selectedDefinition.eyebrow}</p>
              <h2>{selectedDefinition.title}</h2>
              <p>{selectedDefinition.description}</p>
            </div>
          </header>

          <div className="venue-operations-module-host">
            {selectedModule === "analytics" ? (
              <OperationsEmpty icon={SelectedIcon} title={selectedDefinition.emptyTitle} copy={selectedDefinition.emptyCopy} />
            ) : !moduleEnabled[selectedModule] ? (
              <OperationsEmpty icon={LockKeyhole} title="Module access is restricted" copy="Your venue role is not authorized to access this module." />
            ) : selectedModule === "alerts" ? (
              <VenueNotifications embedded onUnreadCountChange={setOperationalUnreadCount} />
            ) : selectedModule === "patron_inspection" ? (
              <VenueAssign
                showHeading={false}
                embedded
              />
            ) : (
              <OperationsEmpty icon={SelectedIcon} title={selectedDefinition.emptyTitle} copy={selectedDefinition.emptyCopy} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function OperationsState({ loading = false }: { loading?: boolean }) {
  return (
    <div className="venue-operations-state-page">
      <section className="venue-operations-state" role={loading ? "status" : "alert"}>
        {loading ? <span className="venue-operations-spinner" aria-label="Loading operations" /> : <ShieldAlert aria-hidden="true" />}
        <div>
          <h1>{loading ? "Loading operations" : "Operational access required"}</h1>
          <p>{loading ? "Checking venue permissions and operational modules." : "This internal dashboard is restricted to authorized venue operational roles only."}</p>
        </div>
      </section>
    </div>
  );
}

function OperationsEmpty({ icon: Icon, title, copy }: { icon: LucideIcon; title: string; copy: string }) {
  return (
    <div className="venue-operations-empty">
      <span><Icon aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

async function resolveVenueContext(userId: string): Promise<VenueContext | null> {
  const storedVenueId = localStorage.getItem("jv_current_venue_id");

  if (storedVenueId) {
    const { data } = await supabase.from("venues").select("id, name").eq("id", storedVenueId).maybeSingle();
    if (data?.id) return { id: data.id, name: data.name || "Venue" };
  }

  const { data: ownedVenue } = await supabase
    .from("venues")
    .select("id, name")
    .eq("owner_user_id", userId)
    .eq("approval_status", "approved")
    .maybeSingle();

  if (ownedVenue?.id) return { id: ownedVenue.id, name: ownedVenue.name || "Venue" };

  const { data: employeeLink } = await supabase
    .from("employee_venue_links")
    .select("venue_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!employeeLink?.venue_id) return null;

  const { data: linkedVenue } = await supabase
    .from("venues")
    .select("id, name")
    .eq("id", employeeLink.venue_id)
    .maybeSingle();

  return linkedVenue?.id ? { id: linkedVenue.id, name: linkedVenue.name || "Venue" } : null;
}

function rpcBoolean(result: PromiseSettledResult<RpcResult<boolean>>): boolean {
  return result.status === "fulfilled" && !result.value.error && Boolean(result.value.data);
}

function rpcReadableResult(result: PromiseSettledResult<RpcResult<unknown>>): boolean {
  if (result.status !== "fulfilled") return false;
  const errorMessage = result.value.error?.message?.toLowerCase() || "";
  return !errorMessage.includes("not authorized") && !result.value.error;
}

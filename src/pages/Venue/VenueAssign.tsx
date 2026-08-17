import { type DragEvent, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BellRing, CalendarDays, CheckCircle2, ClipboardList, Plus, Save, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import StaffInviteModal from "@/components/Venue/StaffInviteModal";
import VenueRosterModal from "@/components/Venue/VenueRosterModal";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from 'react-i18next';
import "./venue-assign.css";

interface StaffMember {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

interface PatronCandidate {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface PatronAccessStatus {
  access_status: "allowed" | "deal_suppressed" | "banned" | "kicked_out_tonight";
  is_banned: boolean;
  reason: string | null;
  banned_at: string | null;
}

interface PatronModerationStatus {
  access_status: "allowed" | "deal_suppressed" | "banned" | "kicked_out_tonight";
  is_banned: boolean;
  caution_category: string | null;
  reason: string | null;
  internal_note: string | null;
  status_set_at: string | null;
  status_expires_at: string | null;
}

interface VenueCautionPreference {
  id: string;
  caution_category: string;
  trigger_type: string;
  minimum_threshold: number;
  enabled: boolean;
  notes: string | null;
  updated_at: string;
}

interface VenueCautionAlertEvent {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  caution_category: string;
  trigger_type: string;
  incident_count: number;
  minimum_threshold: number;
  status: "new" | "acknowledged" | "resolved";
  event_source: string;
  event_metadata: Record<string, unknown> | null;
  acknowledged_at: string | null;
  created_at: string;
}

interface VenuePatronTimelineItem {
  timeline_id: string;
  occurred_at: string;
  event_family: string;
  event_type: string;
  source_table: string;
  source_id: string;
  actor_user_id: string | null;
  actor_display_name: string | null;
  summary: string;
  details: Record<string, unknown> | null;
}

interface VenuePatronPresenceConfidence {
  confidence_score: number;
  confidence_band: "high" | "medium" | "low" | "very_low";
  primary_evidence: string;
  active_checkin_id: string | null;
  active_checkin_at: string | null;
  verification_state: string | null;
  checkin_entry_source: string | null;
  has_recent_staff_approval: boolean;
  recent_inside_proof_count: number;
  strongest_inside_proof_source: string | null;
  strongest_inside_proof_score: number | null;
  strongest_inside_proof_at: string | null;
  evaluated_at: string;
}

const stations = [
  { id: "table1", name: "Table 1", type: "Serving", assignedTo: null },
  { id: "table2", name: "Table 2", type: "Serving", assignedTo: null },
  { id: "bar1", name: "Bar 1", type: "Bar", assignedTo: null },
  { id: "kitchen", name: "Kitchen", type: "Kitchen", assignedTo: null },
] as const;

const filterTabs = ["All", "Serving", "Registry", "Bar", "Kitchen"] as const;
type StaffServiceArea = (typeof filterTabs)[number];

function getStaffServiceArea(role: string): Exclude<StaffServiceArea, "All"> {
  const normalizedRole = role.toLowerCase();

  if (normalizedRole.includes("kitchen")) return "Kitchen";
  if (normalizedRole.includes("bar") || normalizedRole.includes("bartender")) return "Bar";
  if (normalizedRole.includes("registry") || normalizedRole.includes("host")) return "Registry";

  return "Serving";
}

function formatIdentifierLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getEntryPolicyLabel(policy: "open_entry" | "security_required" | "hybrid_entry") {
  if (policy === "open_entry") return "Open entry";
  if (policy === "security_required") return "Security required";
  return "Hybrid entry";
}
const moderationActionOptions = ["set_allowed", "set_deal_suppressed", "set_banned", "set_kicked_out_tonight"] as const;
const cautionCategoryOptions = [
  "chargeback_refund_abuse",
  "disruptive_behaviour",
  "abusive_to_staff",
  "harassment",
  "fake_id_entry_fraud",
  "prior_incident",
  "theft_or_damage",
  "other",
] as const;
const cautionPreferenceCategoryOptions = [...cautionCategoryOptions, "kicked_out_tonight", "banned_tonight"] as const;
const cautionTriggerOptions = [
  "staff_verification",
  "checkin_attempt",
  "heading_there",
  "transaction_event",
  "order_event",
] as const;

interface VenueAssignProps {
  showHeading?: boolean;
  headingTitle?: string;
  headingDescription?: string;
  embedded?: boolean;
  navigation?: ReactNode;
}

export default function VenueAssign({
  showHeading = true,
  headingTitle = "Staff management",
  headingDescription = "Approve entry, manage conduct actions, and review venue safety history.",
  embedded = false,
  navigation,
}: VenueAssignProps) {
  const { t } = useTranslation('venue');
  const { user } = useAuth();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [entryControlPolicy, setEntryControlPolicy] = useState<"open_entry" | "security_required" | "hybrid_entry">("open_entry");
  const [securityOperationMode, setSecurityOperationMode] = useState<"always_active" | "scheduled" | "event_based">("always_active");
  const [patronSearch, setPatronSearch] = useState("");
  const [patronCandidates, setPatronCandidates] = useState<PatronCandidate[]>([]);
  const [selectedPatronId, setSelectedPatronId] = useState<string>("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approving, setApproving] = useState(false);
  const [canApproveEntry, setCanApproveEntry] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [patronAccessStatus, setPatronAccessStatus] = useState<PatronAccessStatus | null>(null);
  const [patronAccessLoading, setPatronAccessLoading] = useState(false);
  const [canManageModeration, setCanManageModeration] = useState(false);
  const [canManageCautionPrefs, setCanManageCautionPrefs] = useState(false);

  const [moderationSearch, setModerationSearch] = useState("");
  const [moderationCandidates, setModerationCandidates] = useState<PatronCandidate[]>([]);
  const [selectedModerationPatronId, setSelectedModerationPatronId] = useState("");
  const [moderationStatus, setModerationStatus] = useState<PatronModerationStatus | null>(null);
  const [moderationAction, setModerationAction] = useState<(typeof moderationActionOptions)[number]>("set_deal_suppressed");
  const [moderationCategory, setModerationCategory] = useState<(typeof cautionCategoryOptions)[number]>("disruptive_behaviour");
  const [moderationReason, setModerationReason] = useState("");
  const [moderationInternalNote, setModerationInternalNote] = useState("");
  const [moderationExpiresAt, setModerationExpiresAt] = useState("");
  const [savingModeration, setSavingModeration] = useState(false);

  const [cautionCategory, setCautionCategory] = useState<(typeof cautionPreferenceCategoryOptions)[number]>("prior_incident");
  const [cautionTrigger, setCautionTrigger] = useState<(typeof cautionTriggerOptions)[number]>("staff_verification");
  const [cautionThreshold, setCautionThreshold] = useState(2);
  const [cautionEnabled, setCautionEnabled] = useState(true);
  const [cautionNotes, setCautionNotes] = useState("");
  const [cautionPreferences, setCautionPreferences] = useState<VenueCautionPreference[]>([]);
  const [savingCautionPreference, setSavingCautionPreference] = useState(false);
  const [cautionAlerts, setCautionAlerts] = useState<VenueCautionAlertEvent[]>([]);
  const [loadingCautionAlerts, setLoadingCautionAlerts] = useState(false);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState<string | null>(null);
  const [patronTimeline, setPatronTimeline] = useState<VenuePatronTimelineItem[]>([]);
  const [loadingPatronTimeline, setLoadingPatronTimeline] = useState(false);
  const [patronPresenceConfidence, setPatronPresenceConfidence] = useState<VenuePatronPresenceConfidence | null>(null);
  const [loadingPatronPresenceConfidence, setLoadingPatronPresenceConfidence] = useState(false);

  useEffect(() => {
    const fetchVenueId = async () => {
      if (!user) return;
      const stored = localStorage.getItem("jv_current_venue_id");
      if (stored) {
        setVenueId(stored);
        try {
          const { data: venuePolicy } = await (supabase as any)
            .from("venues")
            .select("entry_control_policy, security_operation_mode")
            .eq("id", stored)
            .maybeSingle();
          if (venuePolicy?.entry_control_policy) {
            setEntryControlPolicy(venuePolicy.entry_control_policy as any);
          }
          if (venuePolicy?.security_operation_mode) {
            setSecurityOperationMode(venuePolicy.security_operation_mode as any);
          }
        } catch (e) {
          console.error("Failed to fetch venue entry policy", e);
        }
        return;
      }
      try {
        const { data } = await (supabase as any)
          .from("venues")
          .select("id, entry_control_policy, security_operation_mode")
          .eq("owner_user_id", user.id)
          .maybeSingle();
        if (data) {
          setVenueId(data.id);
          setEntryControlPolicy((data.entry_control_policy as any) || "open_entry");
          setSecurityOperationMode((data.security_operation_mode as any) || "always_active");
        }
      } catch (e) {
        console.error("Failed to fetch venue ID", e);
      }
    };
    fetchVenueId();
  }, [user]);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!venueId) {
        setCanApproveEntry(false);
        setCanManageModeration(false);
        setCanManageCautionPrefs(false);
        setPermissionLoading(false);
        return;
      }

      setPermissionLoading(true);
      try {
        const { data: approveData, error: approveError } = await (supabase as any).rpc("can_approve_venue_entry", {
          p_venue_id: venueId,
        });
        if (approveError) throw approveError;
        setCanApproveEntry(Boolean(approveData));

        const { data: moderationData, error: moderationError } = await (supabase as any).rpc(
          "can_manage_venue_patron_moderation",
          { p_venue_id: venueId },
        );
        if (moderationError) throw moderationError;
        setCanManageModeration(Boolean(moderationData));

        const { data: cautionData, error: cautionError } = await (supabase as any).rpc(
          "can_manage_venue_caution_preferences",
          { p_venue_id: venueId },
        );
        if (cautionError) throw cautionError;
        setCanManageCautionPrefs(Boolean(cautionData));
      } catch (e) {
        console.error("Failed to fetch staff permissions", e);
        setCanApproveEntry(false);
        setCanManageModeration(false);
        setCanManageCautionPrefs(false);
      } finally {
        setPermissionLoading(false);
      }
    };

    fetchPermissions();
  }, [venueId]);

  // Realtime subscription for employee_venue_links changes
  useEffect(() => {
    if (!venueId) return;
    const channel = supabase
      .channel(createRealtimeChannelTopic(`staff-updates-${venueId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_venue_links", filter: `venue_id=eq.${venueId}` },
        () => {
          // Re-fetch staff when links change
          const refetch = async () => {
            if (!user) return;
            try {
              const { data: links } = await supabase
                .from("employee_venue_links")
                .select("user_id, role")
                .eq("venue_id", venueId)
                .eq("is_active", true);
              const employeeUserIds = (links || []).map(l => l.user_id);
              const allUserIds = [...new Set([user.id, ...employeeUserIds])];
              const { data: profiles } = await supabase
                .from("customer_profiles")
                .select("user_id, display_name, avatar_url")
                .in("user_id", allUserIds);
              const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
              const roleMap = new Map((links || []).map(l => [l.user_id, l.role]));
              const members: StaffMember[] = allUserIds.map(uid => {
                const profile = profileMap.get(uid);
                const isOwner = uid === user.id;
                const name = profile?.display_name || (isOwner ? (user.email?.split("@")[0] || "Owner") : "Staff Member");
                const role = isOwner ? "Owner" : (roleMap.get(uid) || "Staff");
                return { id: uid, name, avatar: profile?.avatar_url || "", role };
              });
              setStaffMembers(members);
            } catch (e) {
              console.error("Realtime staff refetch error", e);
            }
          };
          refetch();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [venueId, user]);

  // Fetch real staff from DB
  const fetchStaff = async () => {
    if (!venueId || !user) return;
    setLoadingStaff(true);
    try {
      const { data: links } = await supabase
        .from("employee_venue_links")
        .select("user_id, role")
        .eq("venue_id", venueId)
        .eq("is_active", true);

      const employeeUserIds = (links || []).map(l => l.user_id);
      const allUserIds = [...new Set([user.id, ...employeeUserIds])];

      const { data: profiles } = await supabase
        .from("customer_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", allUserIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const roleMap = new Map((links || []).map(l => [l.user_id, l.role]));

      const members: StaffMember[] = allUserIds.map(uid => {
        const profile = profileMap.get(uid);
        const isOwner = uid === user.id;
        const name = profile?.display_name || (isOwner ? (user.email?.split("@")[0] || "Owner") : "Staff Member");
        const role = isOwner ? "Owner" : (roleMap.get(uid) || "Staff");
        return {
          id: uid,
          name,
          avatar: profile?.avatar_url || "",
          role,
        };
      });

      setStaffMembers(members);
    } catch (e) {
      console.error("Failed to fetch staff", e);
    } finally {
      setLoadingStaff(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [venueId, user]);

  useEffect(() => {
    if (!venueId || !canApproveEntry || patronSearch.trim().length < 2) {
      setPatronCandidates([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .ilike("display_name", `%${patronSearch.trim()}%`)
          .limit(8);

        if (error) throw error;
        setPatronCandidates((data || []) as PatronCandidate[]);
      } catch (e) {
        console.error("Failed patron search", e);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [venueId, canApproveEntry, patronSearch]);

  useEffect(() => {
    if (!venueId || !canManageModeration || moderationSearch.trim().length < 2) {
      setModerationCandidates([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .ilike("display_name", `%${moderationSearch.trim()}%`)
          .limit(8);

        if (error) throw error;
        setModerationCandidates((data || []) as PatronCandidate[]);
      } catch (e) {
        console.error("Failed moderation patron search", e);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [venueId, canManageModeration, moderationSearch]);

  useEffect(() => {
    const fetchPatronAccessStatus = async () => {
      if (!venueId || !selectedPatronId || !canApproveEntry) {
        setPatronAccessStatus(null);
        return;
      }

      setPatronAccessLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc("get_venue_patron_access_status", {
          p_venue_id: venueId,
          p_user_id: selectedPatronId,
        });

        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          setPatronAccessStatus({
            access_status: "allowed",
            is_banned: false,
            reason: null,
            banned_at: null,
          });
          return;
        }

        setPatronAccessStatus({
          access_status: row.access_status === "banned" ? "banned" : "allowed",
          is_banned: Boolean(row.is_banned),
          reason: row.reason ?? null,
          banned_at: row.banned_at ?? null,
        });
      } catch (e) {
        console.error("Failed to fetch patron access status", e);
        setPatronAccessStatus(null);
      } finally {
        setPatronAccessLoading(false);
      }
    };

    fetchPatronAccessStatus();
  }, [venueId, selectedPatronId, canApproveEntry]);

  useEffect(() => {
    const fetchModerationStatus = async () => {
      if (!venueId || !selectedModerationPatronId || !canManageModeration) {
        setModerationStatus(null);
        return;
      }

      try {
        const { data, error } = await (supabase as any).rpc("get_venue_patron_moderation_status", {
          p_venue_id: venueId,
          p_user_id: selectedModerationPatronId,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          setModerationStatus({
            access_status: "allowed",
            is_banned: false,
            caution_category: null,
            reason: null,
            internal_note: null,
            status_set_at: null,
            status_expires_at: null,
          });
          return;
        }
        setModerationStatus({
          access_status: row.access_status || "allowed",
          is_banned: Boolean(row.is_banned),
          caution_category: row.caution_category ?? null,
          reason: row.reason ?? null,
          internal_note: row.internal_note ?? null,
          status_set_at: row.status_set_at ?? null,
          status_expires_at: row.status_expires_at ?? null,
        });
      } catch (e) {
        console.error("Failed to load moderation status", e);
        setModerationStatus(null);
      }
    };

    fetchModerationStatus();
  }, [venueId, selectedModerationPatronId, canManageModeration]);

  useEffect(() => {
    const fetchCautionPreferences = async () => {
      if (!venueId || !canManageCautionPrefs) {
        setCautionPreferences([]);
        return;
      }

      try {
        const { data, error } = await (supabase as any).rpc("get_venue_caution_alert_preferences", {
          p_venue_id: venueId,
        });
        if (error) throw error;
        setCautionPreferences((data || []) as VenueCautionPreference[]);
      } catch (e) {
        console.error("Failed to load caution preferences", e);
        setCautionPreferences([]);
      }
    };

    fetchCautionPreferences();
  }, [venueId, canManageCautionPrefs]);

  useEffect(() => {
    const fetchCautionAlerts = async () => {
      if (!venueId || !canManageModeration) {
        setCautionAlerts([]);
        return;
      }

      setLoadingCautionAlerts(true);
      try {
        const { data, error } = await (supabase as any).rpc("get_venue_caution_alert_events", {
          p_venue_id: venueId,
          p_limit: 25,
          p_status: "new",
        });
        if (error) throw error;
        setCautionAlerts((data || []) as VenueCautionAlertEvent[]);
      } catch (e) {
        console.error("Failed to load caution alerts", e);
        setCautionAlerts([]);
      } finally {
        setLoadingCautionAlerts(false);
      }
    };

    fetchCautionAlerts();
  }, [venueId, canManageModeration]);

  useEffect(() => {
    const fetchPatronTimeline = async () => {
      if (!venueId || !canManageModeration || !selectedModerationPatronId) {
        setPatronTimeline([]);
        return;
      }

      setLoadingPatronTimeline(true);
      try {
        const { data, error } = await (supabase as any).rpc("get_venue_patron_incident_timeline", {
          p_venue_id: venueId,
          p_user_id: selectedModerationPatronId,
          p_limit: 80,
        });
        if (error) throw error;
        setPatronTimeline((data || []) as VenuePatronTimelineItem[]);
      } catch (e) {
        console.error("Failed to load patron incident timeline", e);
        setPatronTimeline([]);
      } finally {
        setLoadingPatronTimeline(false);
      }
    };

    fetchPatronTimeline();
  }, [venueId, canManageModeration, selectedModerationPatronId]);

  useEffect(() => {
    const fetchPatronPresenceConfidence = async () => {
      if (!venueId || !canManageModeration || !selectedModerationPatronId) {
        setPatronPresenceConfidence(null);
        return;
      }

      setLoadingPatronPresenceConfidence(true);
      try {
        const { data, error } = await (supabase as any).rpc("get_venue_patron_presence_confidence", {
          p_venue_id: venueId,
          p_user_id: selectedModerationPatronId,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        setPatronPresenceConfidence((row || null) as VenuePatronPresenceConfidence | null);
      } catch (e) {
        console.error("Failed to load patron presence confidence", e);
        setPatronPresenceConfidence(null);
      } finally {
        setLoadingPatronPresenceConfidence(false);
      }
    };

    fetchPatronPresenceConfidence();
  }, [venueId, canManageModeration, selectedModerationPatronId]);

  const handleApproveEntry = async () => {
    if (!venueId) {
      toast.error("Venue not loaded");
      return;
    }
    if (!canApproveEntry) {
      toast.error("You are not authorized to approve venue entry.");
      return;
    }
    if (!selectedPatronId) {
      toast.error("Select a patron to approve");
      return;
    }
    if (patronAccessStatus?.is_banned) {
      toast.error("This patron is banned for this venue. Approval is blocked.");
      return;
    }

    setApproving(true);
    try {
      const { data, error } = await (supabase as any).rpc("approve_venue_entry_checkin", {
        p_venue_id: venueId,
        p_user_id: selectedPatronId,
        p_visibility: "private",
        p_notes: approvalNotes.trim() || null,
        p_idempotency_key: `approve-entry:${venueId}:${selectedPatronId}:${Math.floor(Date.now() / 5000)}`,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(
        row?.entry_control_policy === "open_entry"
          ? "Patron check-in approved"
          : "Patron approved and checked in via staff verification",
      );
      setSelectedPatronId("");
      setApprovalNotes("");
      setPatronSearch("");
      setPatronCandidates([]);
      setPatronAccessStatus(null);
    } catch (e: any) {
      console.error("Failed to approve entry", e);
      toast.error(e?.message || "Failed to approve entry");
    } finally {
      setApproving(false);
    }
  };

  const handleApplyModeration = async () => {
    if (!venueId) {
      toast.error("Venue not loaded");
      return;
    }
    if (!canManageModeration) {
      toast.error("You are not authorized to manage patron moderation.");
      return;
    }
    if (!selectedModerationPatronId) {
      toast.error("Select a patron first");
      return;
    }
    if (moderationAction !== "set_allowed" && !moderationCategory) {
      toast.error("Choose a moderation reason category");
      return;
    }
    if (moderationAction !== "set_allowed" && !moderationReason.trim()) {
      toast.error("Add a short reason");
      return;
    }

    setSavingModeration(true);
    try {
      const expiresAt =
        moderationAction === "set_kicked_out_tonight" && moderationExpiresAt
          ? new Date(moderationExpiresAt).toISOString()
          : null;

      const { data, error } = await (supabase as any).rpc("apply_venue_patron_moderation_action", {
        p_venue_id: venueId,
        p_user_id: selectedModerationPatronId,
        p_action_type: moderationAction,
        p_caution_category: moderationAction === "set_allowed" ? null : moderationCategory,
        p_reason_note: moderationAction === "set_allowed" ? null : moderationReason.trim(),
        p_internal_note: moderationInternalNote.trim() || null,
        p_status_expires_at: expiresAt,
        p_trigger_type: "manual",
        p_idempotency_key: `patron-moderation:${venueId}:${selectedModerationPatronId}:${moderationAction}:${Math.floor(Date.now() / 5000)}`,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      setModerationStatus((prev) => ({
        access_status: row?.access_status || prev?.access_status || "allowed",
        is_banned: Boolean(row?.is_banned),
        caution_category: moderationAction === "set_allowed" ? null : moderationCategory,
        reason: moderationAction === "set_allowed" ? null : moderationReason.trim(),
        internal_note: moderationInternalNote.trim() || null,
        status_set_at: new Date().toISOString(),
        status_expires_at: row?.status_expires_at || null,
      }));
      toast.success("Patron moderation action saved.");
    } catch (e: any) {
      console.error("Failed to apply moderation action", e);
      toast.error(e?.message || "Failed to apply moderation action");
    } finally {
      setSavingModeration(false);
    }
  };

  const handleSaveCautionPreference = async () => {
    if (!venueId) {
      toast.error("Venue not loaded");
      return;
    }
    if (!canManageCautionPrefs) {
      toast.error("You are not authorized to manage caution preferences.");
      return;
    }
    if (!Number.isFinite(cautionThreshold) || cautionThreshold < 1) {
      toast.error("Threshold must be 1 or higher");
      return;
    }

    setSavingCautionPreference(true);
    try {
      const { error } = await (supabase as any).rpc("upsert_venue_caution_alert_preference", {
        p_venue_id: venueId,
        p_caution_category: cautionCategory,
        p_trigger_type: cautionTrigger,
        p_minimum_threshold: Math.max(1, Math.floor(cautionThreshold)),
        p_enabled: cautionEnabled,
        p_notes: cautionNotes.trim() || null,
        p_idempotency_key: `caution-pref:${venueId}:${cautionCategory}:${cautionTrigger}:${Math.floor(Date.now() / 5000)}`,
      });
      if (error) throw error;

      const { data: refreshed, error: refreshError } = await (supabase as any).rpc(
        "get_venue_caution_alert_preferences",
        { p_venue_id: venueId },
      );
      if (refreshError) throw refreshError;

      setCautionPreferences((refreshed || []) as VenueCautionPreference[]);
      toast.success("Caution alert preference saved.");
    } catch (e: any) {
      console.error("Failed to save caution preference", e);
      toast.error(e?.message || "Failed to save caution preference");
    } finally {
      setSavingCautionPreference(false);
    }
  };

  const handleAcknowledgeCautionAlert = async (alertId: string) => {
    if (!canManageModeration) {
      toast.error("You are not authorized to acknowledge caution alerts.");
      return;
    }

    setAcknowledgingAlertId(alertId);
    try {
      const { error } = await (supabase as any).rpc("acknowledge_venue_caution_alert_event", {
        p_alert_id: alertId,
        p_acknowledgement_note: "Acknowledged by staff",
      });
      if (error) throw error;

      setCautionAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      toast.success("Caution alert acknowledged.");
    } catch (e: any) {
      console.error("Failed to acknowledge caution alert", e);
      toast.error(e?.message || "Failed to acknowledge caution alert");
    } finally {
      setAcknowledgingAlertId(null);
    }
  };

  const [activeFilter, setActiveFilter] = useState<StaffServiceArea>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [stationAssignments, setStationAssignments] = useState<Record<string, string>>({});
  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);
  const [draggedOverStationId, setDraggedOverStationId] = useState<string | null>(null);

  useEffect(() => {
    const staffIds = new Set(staffMembers.map((member) => member.id));

    setStationAssignments((currentAssignments) => {
      const nextAssignments = Object.fromEntries(
        Object.entries(currentAssignments).filter(([, employeeId]) => staffIds.has(employeeId)),
      );

      return Object.keys(nextAssignments).length === Object.keys(currentAssignments).length
        ? currentAssignments
        : nextAssignments;
    });
  }, [staffMembers]);

  const assignedEmployeeIds = new Set(Object.values(stationAssignments));
  const staffById = new Map(staffMembers.map((member) => [member.id, member]));

  const filteredEmployees = staffMembers.filter((employee) => {
    const matchesSearch = employee.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesServiceArea = activeFilter === "All" || getStaffServiceArea(employee.role) === activeFilter;

    return matchesSearch && matchesServiceArea && !assignedEmployeeIds.has(employee.id);
  });

  const handleEmployeeDragStart = (event: DragEvent<HTMLDivElement>, employeeId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", employeeId);
    setDraggedEmployeeId(employeeId);
  };

  const handleEmployeeDragEnd = () => {
    setDraggedEmployeeId(null);
    setDraggedOverStationId(null);
  };

  const handleStationDrop = (event: DragEvent<HTMLDivElement>, stationId: string) => {
    event.preventDefault();
    const employeeId = event.dataTransfer.getData("text/plain") || draggedEmployeeId;
    setDraggedOverStationId(null);

    if (!employeeId || !staffById.has(employeeId)) return;

    setStationAssignments((currentAssignments) => {
      const nextAssignments = Object.fromEntries(
        Object.entries(currentAssignments).filter(([assignedStationId, assignedEmployeeId]) => (
          assignedStationId !== stationId && assignedEmployeeId !== employeeId
        )),
      );

      return { ...nextAssignments, [stationId]: employeeId };
    });
    setDraggedEmployeeId(null);
  };

  const headingActions = (
    <div className="venue-assign-heading__actions">
      <Button
        type="button"
        variant="outline"
        className="venue-assign-button venue-assign-button--secondary"
        onClick={() => setShowRosterModal(true)}
      >
        <CalendarDays aria-hidden="true" />
        <span>View roster</span>
      </Button>
      <Button
        type="button"
        className="venue-assign-button venue-assign-button--primary"
        onClick={() => setShowInviteModal(true)}
      >
        <Plus aria-hidden="true" />
        <span>Create employee</span>
      </Button>
      <span className="venue-assign-heading__status"><ShieldCheck aria-hidden="true" />Staff only</span>
    </div>
  );

  return (
    <div className={`venue-assign-page${embedded ? " venue-assign-page--embedded" : ""}${navigation ? " venue-assign-page--with-navigation" : ""}`}>
      {showHeading && (
        <header className="venue-assign-heading">
          <div>
            <h1>{headingTitle}</h1>
            <p>{headingDescription}</p>
          </div>
          {headingActions}
        </header>
      )}

      {!showHeading && embedded && (
        <div className="venue-assign-embedded-actions">
          {headingActions}
        </div>
      )}

      <StaffInviteModal isOpen={showInviteModal} onClose={() => { setShowInviteModal(false); fetchStaff(); }} />
      <VenueRosterModal isOpen={showRosterModal} onClose={() => setShowRosterModal(false)} venueId={venueId} />

      {navigation && <div className="venue-assign-navigation">{navigation}</div>}
      <div className="venue-assign-content">
        {/* Entry Approval */}
        <Card className="venue-assign-card">
          <CardContent className="venue-assign-card__content">
            <div className="venue-assign-card-heading">
              <div>
              <h2 className="text-lg font-semibold">Entry approval</h2>
              {!permissionLoading && !canApproveEntry && (
                <p className="text-xs text-amber-400 mt-1">
                  Your venue role is not authorized for entry approvals.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Check in an approved patron privately. They choose whether to become visible on their device.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Policy: <span className="font-medium text-foreground">{getEntryPolicyLabel(entryControlPolicy)}</span>
                {entryControlPolicy !== "open_entry" ? ` - Security mode: ${formatIdentifierLabel(securityOperationMode)}` : ""}
              </p>
              {selectedPatronId && !patronAccessLoading && patronAccessStatus?.is_banned && (
                <p className="text-xs text-red-400 mt-2">
                  Patron is marked as banned for this venue. Approval is blocked.
                  {patronAccessStatus.reason ? ` Reason: ${patronAccessStatus.reason}` : ""}
                </p>
              )}
              </div>
              <span className="venue-assign-policy-label">{getEntryPolicyLabel(entryControlPolicy)}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Find Patron</Label>
                <div className="venue-assign-patron-search">
                  <Search aria-hidden="true" />
                  <Input
                    placeholder="Search display name..."
                    value={patronSearch}
                    onChange={(e) => setPatronSearch(e.target.value)}
                    disabled={permissionLoading || !canApproveEntry}
                  />
                </div>
                {patronCandidates.length > 0 && (
                  <div className="rounded-md border border-border bg-background/70 max-h-40 overflow-auto">
                    {patronCandidates.map((patron) => (
                      <button
                        key={patron.user_id}
                        type="button"
                        onClick={() => setSelectedPatronId(patron.user_id)}
                        className={`w-full text-left px-3 py-2 hover:bg-secondary/40 ${
                          selectedPatronId === patron.user_id ? "bg-secondary/50" : ""
                        }`}
                      >
                        <p className="text-sm font-medium">{patron.display_name || "Unnamed user"}</p>
                        <p className="text-[11px] text-muted-foreground">{patron.user_id}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label>Visibility handling</Label>
                <p className="text-sm text-muted-foreground border border-border rounded-md px-3 py-2">
                  Approved patrons are checked in privately first. They can choose public/private on their device.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Approval Notes (optional)</Label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Door verification note (optional)"
                className="min-h-[72px]"
                disabled={permissionLoading || !canApproveEntry}
              />
            </div>

            <Button
              className="venue-assign-action venue-assign-action--primary"
              onClick={handleApproveEntry}
              disabled={
                approving ||
                !selectedPatronId ||
                permissionLoading ||
                !canApproveEntry ||
                patronAccessLoading ||
                Boolean(patronAccessStatus?.is_banned)
              }
            >
              <CheckCircle2 aria-hidden="true" />
              <span>{approving ? "Approving..." : "Approve entry and check in"}</span>
            </Button>
          </CardContent>
        </Card>

        {/* Patron Moderation (staff-only) */}
        <Card className="venue-assign-card">
          <CardContent className="venue-assign-card__content">
            <div>
              <h2 className="text-lg font-semibold">Moderation controls</h2>
              {!permissionLoading && !canManageModeration && (
                <p className="text-xs text-amber-400 mt-1">
                  Your venue role is not authorized for patron moderation actions.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Apply venue-scoped restrictions only when staff intervention is needed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Find Patron</Label>
                <div className="venue-assign-patron-search">
                  <Search aria-hidden="true" />
                  <Input
                    placeholder="Search display name..."
                    value={moderationSearch}
                    onChange={(e) => setModerationSearch(e.target.value)}
                    disabled={permissionLoading || !canManageModeration}
                  />
                </div>
                {moderationCandidates.length > 0 && (
                  <div className="rounded-md border border-border bg-background/70 max-h-40 overflow-auto">
                    {moderationCandidates.map((patron) => (
                      <button
                        key={patron.user_id}
                        type="button"
                        onClick={() => setSelectedModerationPatronId(patron.user_id)}
                        className={`w-full text-left px-3 py-2 hover:bg-secondary/40 ${
                          selectedModerationPatronId === patron.user_id ? "bg-secondary/50" : ""
                        }`}
                      >
                        <p className="text-sm font-medium">{patron.display_name || "Unnamed user"}</p>
                        <p className="text-[11px] text-muted-foreground">{patron.user_id}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label>Current Status</Label>
                <p className="text-sm text-muted-foreground border border-border rounded-md px-3 py-2">
                  {selectedModerationPatronId
                    ? `Status: ${formatIdentifierLabel(moderationStatus?.access_status || "allowed")}${
                        moderationStatus?.status_expires_at ? ` (expires ${new Date(moderationStatus.status_expires_at).toLocaleString()})` : ""
                      }`
                    : "Select a patron to view current moderation status."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Action</Label>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={moderationAction}
                  onChange={(e) => setModerationAction(e.target.value as (typeof moderationActionOptions)[number])}
                  disabled={permissionLoading || !canManageModeration}
                >
                  {moderationActionOptions.map((action) => (
                    <option key={action} value={action}>
                      {formatIdentifierLabel(action)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label>Reason Category</Label>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={moderationCategory}
                  onChange={(e) => setModerationCategory(e.target.value as (typeof cautionCategoryOptions)[number])}
                  disabled={permissionLoading || !canManageModeration || moderationAction === "set_allowed"}
                >
                  {cautionCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {formatIdentifierLabel(category)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Reason</Label>
                <Input
                  value={moderationReason}
                  onChange={(e) => setModerationReason(e.target.value)}
                  placeholder="Operational reason for this action"
                  disabled={permissionLoading || !canManageModeration || moderationAction === "set_allowed"}
                />
              </div>
              <div className="space-y-1">
                <Label>Kicked-Out Expiry (optional)</Label>
                <Input
                  type="datetime-local"
                  value={moderationExpiresAt}
                  onChange={(e) => setModerationExpiresAt(e.target.value)}
                  disabled={permissionLoading || !canManageModeration || moderationAction !== "set_kicked_out_tonight"}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Internal Note (optional)</Label>
              <Textarea
                value={moderationInternalNote}
                onChange={(e) => setModerationInternalNote(e.target.value)}
                placeholder="Internal staff-only note"
                className="min-h-[72px]"
                disabled={permissionLoading || !canManageModeration}
              />
            </div>

            <Button
              className="venue-assign-action venue-assign-action--secondary"
              onClick={handleApplyModeration}
              disabled={permissionLoading || !canManageModeration || !selectedModerationPatronId || savingModeration}
              variant="outline"
            >
              <ShieldAlert aria-hidden="true" />
              <span>{savingModeration ? "Saving..." : "Apply moderation action"}</span>
            </Button>
          </CardContent>
        </Card>

        {/* Caution Alert Preferences (staff-only) */}
        <Card className={`venue-assign-card venue-assign-card--timeline${!selectedModerationPatronId ? " venue-assign-card--empty" : ""}`}>
          <CardContent className="venue-assign-card__content">
            <div>
              <h2 className="text-lg font-semibold">Patron incident timeline</h2>
              {!permissionLoading && !canManageModeration && (
                <p className="text-xs text-amber-400 mt-1">
                  Your venue role is not authorized to view internal patron incident history.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Venue-scoped history is available after selecting a patron for inspection.
              </p>
            </div>

            {selectedModerationPatronId && (
              <div className="rounded-md border border-border bg-secondary/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Presence confidence</span>
                  {loadingPatronPresenceConfidence ? (
                    <span className="text-sm text-muted-foreground">{t("common:app.loading")}</span>
                  ) : patronPresenceConfidence ? (
                    <>
                      <span className="text-sm font-medium">
                        {patronPresenceConfidence.confidence_score}/100 ({patronPresenceConfidence.confidence_band})
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Primary evidence: {patronPresenceConfidence.primary_evidence}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">No confidence summary available.</span>
                  )}
                </div>
                {!loadingPatronPresenceConfidence && patronPresenceConfidence && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Verification: {patronPresenceConfidence.verification_state || "-"} | Entry source:{" "}
                    {patronPresenceConfidence.checkin_entry_source || "-"} | Inside-proof events (24h):{" "}
                    {patronPresenceConfidence.recent_inside_proof_count}
                  </p>
                )}
              </div>
            )}

            {!selectedModerationPatronId ? (
              <div className="venue-assign-empty-state">
                <ClipboardList aria-hidden="true" />
                <span>No patron selected</span>
              </div>
            ) : loadingPatronTimeline ? (
              <p className="text-sm text-muted-foreground">Loading timeline...</p>
            ) : patronTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No incident timeline entries found for this patron at this venue.</p>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40">
                    <tr>
                      <th className="text-left px-3 py-2">When</th>
                      <th className="text-left px-3 py-2">Family</th>
                      <th className="text-left px-3 py-2">Event</th>
                      <th className="text-left px-3 py-2">Summary</th>
                      <th className="text-left px-3 py-2">Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patronTimeline.map((item) => (
                      <tr key={item.timeline_id} className="border-t border-border">
                        <td className="px-3 py-2">{new Date(item.occurred_at).toLocaleString()}</td>
                        <td className="px-3 py-2">{item.event_family}</td>
                        <td className="px-3 py-2">{item.event_type}</td>
                        <td className="px-3 py-2">{item.summary}</td>
                        <td className="px-3 py-2">{item.actor_display_name || item.actor_user_id || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="venue-assign-card">
          <CardContent className="venue-assign-card__content">
            <div>
              <h2 className="text-lg font-semibold">Caution alert preference</h2>
              {!permissionLoading && !canManageCautionPrefs && (
                <p className="text-xs text-amber-400 mt-1">
                  Your venue role is not authorized to configure caution alert preferences.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Set the venue threshold that prompts staff to review a patron.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={cautionCategory}
                  onChange={(e) => setCautionCategory(e.target.value as (typeof cautionPreferenceCategoryOptions)[number])}
                  disabled={permissionLoading || !canManageCautionPrefs}
                >
                  {cautionPreferenceCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {formatIdentifierLabel(category)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label>Trigger</Label>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={cautionTrigger}
                  onChange={(e) => setCautionTrigger(e.target.value as (typeof cautionTriggerOptions)[number])}
                  disabled={permissionLoading || !canManageCautionPrefs}
                >
                  {cautionTriggerOptions.map((trigger) => (
                    <option key={trigger} value={trigger}>
                      {formatIdentifierLabel(trigger)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label>Min Threshold</Label>
                <Input
                  type="number"
                  min={1}
                  value={cautionThreshold}
                  onChange={(e) => setCautionThreshold(Number(e.target.value) || 1)}
                  disabled={permissionLoading || !canManageCautionPrefs}
                />
              </div>

              <div className="space-y-1">
                <Label>Enabled</Label>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={cautionEnabled ? "true" : "false"}
                  onChange={(e) => setCautionEnabled(e.target.value === "true")}
                  disabled={permissionLoading || !canManageCautionPrefs}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea
                value={cautionNotes}
                onChange={(e) => setCautionNotes(e.target.value)}
                placeholder="Internal notes for this alert preference"
                className="min-h-[72px]"
                disabled={permissionLoading || !canManageCautionPrefs}
              />
            </div>

            <Button
              className="venue-assign-action venue-assign-action--secondary"
              onClick={handleSaveCautionPreference}
              disabled={permissionLoading || !canManageCautionPrefs || savingCautionPreference}
              variant="outline"
            >
              <Save aria-hidden="true" />
              <span>{savingCautionPreference ? "Saving..." : "Save caution preference"}</span>
            </Button>

            {cautionPreferences.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40">
                    <tr>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Trigger</th>
                      <th className="text-left px-3 py-2">Threshold</th>
                      <th className="text-left px-3 py-2">Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cautionPreferences.map((pref) => (
                      <tr key={pref.id} className="border-t border-border">
                        <td className="px-3 py-2">{pref.caution_category}</td>
                        <td className="px-3 py-2">{pref.trigger_type}</td>
                        <td className="px-3 py-2">{pref.minimum_threshold}</td>
                        <td className="px-3 py-2">{pref.enabled ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`venue-assign-card venue-assign-card--timeline${!loadingCautionAlerts && cautionAlerts.length === 0 ? " venue-assign-card--empty" : ""}`}>
          <CardContent className="venue-assign-card__content">
            <div>
              <h2 className="text-lg font-semibold">Operational caution alerts</h2>
              {!permissionLoading && !canManageModeration && (
                <p className="text-xs text-amber-400 mt-1">
                  Your venue role is not authorized to view operational caution alerts.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Alerts are triggered by staff-only operational events, including verification, check-in, heading intent, and POS activity.
              </p>
            </div>

            {loadingCautionAlerts ? (
              <p className="text-sm text-muted-foreground">Loading alerts...</p>
            ) : cautionAlerts.length === 0 ? (
              <div className="venue-assign-empty-state">
                <BellRing aria-hidden="true" />
                <span>No active caution alerts</span>
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40">
                    <tr>
                      <th className="text-left px-3 py-2">Patron</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Trigger</th>
                      <th className="text-left px-3 py-2">Count</th>
                      <th className="text-left px-3 py-2">When</th>
                      <th className="text-left px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cautionAlerts.map((alert) => (
                      <tr key={alert.id} className="border-t border-border">
                        <td className="px-3 py-2">{alert.display_name || alert.user_id}</td>
                        <td className="px-3 py-2">{alert.caution_category}</td>
                        <td className="px-3 py-2">{alert.trigger_type}</td>
                        <td className="px-3 py-2">
                          {alert.incident_count}/{alert.minimum_threshold}
                        </td>
                        <td className="px-3 py-2">{new Date(alert.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canManageModeration || acknowledgingAlertId === alert.id}
                            onClick={() => handleAcknowledgeCautionAlert(alert.id)}
                          >
                            {acknowledgingAlertId === alert.id ? "Saving..." : "Acknowledge"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <section className="venue-assign-roster" aria-labelledby="venue-assign-roster-title">
          <div className="venue-assign-roster__heading">
            <div>
              <h2 id="venue-assign-roster-title">Staff roster</h2>
              <p>Assign available employees to service areas for the current shift.</p>
            </div>
            <div className="venue-assign-roster__filters" role="group" aria-label="Filter employee service areas">
              {filterTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveFilter(tab)}
                  className={activeFilter === tab ? "venue-assign-filter--active" : ""}
                  aria-pressed={activeFilter === tab}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="venue-assign-roster__grid">
            <Card className="venue-assign-roster-panel venue-assign-employee-panel">
              <CardContent className="venue-assign-roster-panel__content">
                <div className="venue-assign-employee-search">
                  <Search aria-hidden="true" />
                  <Input
                    placeholder="Search employees"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="venue-assign-input"
                  />
                </div>

                <div className="venue-assign-employee-list">
                  {loadingStaff ? (
                    <p className="venue-assign-muted-message">Loading staff...</p>
                  ) : filteredEmployees.length === 0 ? (
                    <p className="venue-assign-muted-message">No employees found. Invite staff to get started.</p>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <div
                        key={employee.id}
                        className="venue-assign-employee-card"
                        draggable
                        onDragStart={(event) => handleEmployeeDragStart(event, employee.id)}
                        onDragEnd={handleEmployeeDragEnd}
                      >
                        <Avatar className="venue-assign-employee-avatar">
                          <AvatarImage src={employee.avatar} />
                          <AvatarFallback>
                            {employee.name.split(" ").map((name) => name[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <strong>{employee.name}</strong>
                          <small>{employee.role}</small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="venue-assign-roster-panel venue-assign-zone-panel">
              <CardContent className="venue-assign-roster-panel__content">
                <div className="venue-assign-station-grid">
                  {stations.map((station) => {
                      const assignedEmployee = stationAssignments[station.id]
                        ? staffById.get(stationAssignments[station.id])
                        : null;

                      return (
                        <div
                          key={station.id}
                          className={`venue-assign-station${assignedEmployee ? " venue-assign-station--assigned" : ""}${draggedOverStationId === station.id ? " venue-assign-station--drop-target" : ""}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDragEnter={() => setDraggedOverStationId(station.id)}
                          onDragLeave={() => setDraggedOverStationId((currentStationId) => currentStationId === station.id ? null : currentStationId)}
                          onDrop={(event) => handleStationDrop(event, station.id)}
                        >
                          <strong>{station.name}</strong>
                          {assignedEmployee ? (
                            <div
                              className="venue-assign-employee-card venue-assign-employee-card--assigned"
                              draggable
                              onDragStart={(event) => handleEmployeeDragStart(event, assignedEmployee.id)}
                              onDragEnd={handleEmployeeDragEnd}
                            >
                              <Avatar className="venue-assign-employee-avatar">
                                <AvatarImage src={assignedEmployee.avatar} />
                                <AvatarFallback>
                                  {assignedEmployee.name.split(" ").map((name) => name[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <strong>{assignedEmployee.name}</strong>
                                <small>{assignedEmployee.role}</small>
                              </div>
                            </div>
                          ) : (
                            <span>Drop employee here</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}

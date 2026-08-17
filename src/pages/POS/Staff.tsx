import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  DollarSign,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import StaffInviteModal from "@/components/Venue/StaffInviteModal";
import { getRoleColor, getRoleGlow, useRosterData } from "@/hooks/useRosterData";
import { usePOS } from "@/contexts/POSContext";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";
import VenueAssign from "@/pages/Venue/VenueAssign";
import { toast } from "sonner";
import "./pos-staff.css";

interface StaffMember {
  id: string;
  name: string;
  avatar: string;
  role: string;
  status: "active" | "break" | "off";
  clockedIn: boolean;
  sales: number;
  orders: number;
  performance: number;
  hoursWeek: number;
}

type StaffTab = "management" | "roster" | "performance";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getStatusLabel(status: StaffMember["status"]) {
  if (status === "active") return "On shift";
  if (status === "break") return "On break";
  return "Off duty";
}

export default function Staff() {
  const [searchParams] = useSearchParams();

  // Venue/staff.html?context=pos keeps the reference staff-management surface
  // and swaps only its navigation rail. POSLayout already supplies that rail.
  if (searchParams.get("context") === "pos") {
    return <VenueAssign />;
  }

  return <POSStaffWorkspace />;
}

function POSStaffWorkspace() {
  const { venueId } = usePOS();
  const { user } = useAuth();
  const {
    employees: rosterEmployees,
    loading: rosterLoading,
    updateShift,
    deleteShift,
    addShift,
    DAYS,
    DAY_SHORT,
    formatTime12,
  } = useRosterData(venueId || null);
  const [activeTab, setActiveTab] = useState<StaffTab>("management");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [realStaff, setRealStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [editingShift, setEditingShift] = useState<{
    rosterId: string | null;
    employeeUserId: string;
    day: string;
    startTime: string;
    endTime: string;
    isNew: boolean;
  } | null>(null);

  useEffect(() => {
    if (!venueId || !user) {
      setRealStaff([]);
      setLoadingStaff(false);
      return;
    }

    const fetchStaff = async () => {
      setLoadingStaff(true);
      try {
        const { data: links } = await supabase
          .from("employee_venue_links")
          .select("user_id, role")
          .eq("venue_id", venueId)
          .eq("is_active", true);

        const employeeUserIds = (links || []).map((link) => link.user_id);
        const allUserIds = [...new Set([user.id, ...employeeUserIds])];

        const { data: profiles } = await supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", allUserIds);

        const { data: shiftData } = await supabase
          .from("employee_shifts")
          .select("employee_id, status, total_sales, orders_served")
          .eq("venue_id", venueId)
          .in("status", ["active", "break"]);

        const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
        const roleMap = new Map((links || []).map((link) => [link.user_id, link.role]));
        const shiftMap = new Map((shiftData || []).map((shift) => [shift.employee_id, shift]));

        const members: StaffMember[] = allUserIds.map((userId) => {
          const profile = profileMap.get(userId);
          const isOwner = userId === user.id;
          const activeShift = shiftMap.get(userId);
          const clockedIn = Boolean(activeShift);

          return {
            id: userId,
            name: profile?.display_name || (isOwner ? user.email?.split("@")[0] || "Owner" : "Staff member"),
            avatar: profile?.avatar_url || "",
            role: isOwner ? "Owner" : roleMap.get(userId) || "Staff",
            status: activeShift ? (activeShift.status === "break" ? "break" : "active") : "off",
            clockedIn,
            sales: activeShift?.total_sales || 0,
            orders: activeShift?.orders_served || 0,
            performance: Math.floor(Math.random() * 15) + 85,
            hoursWeek: 0,
          };
        });

        setRealStaff(members);
      } catch (error) {
        console.error("Failed to fetch staff", error);
      } finally {
        setLoadingStaff(false);
      }
    };

    void fetchStaff();
  }, [venueId, user]);

  useEffect(() => {
    if (!venueId || !user) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`pos-staff-updates-${venueId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_venue_links", filter: `venue_id=eq.${venueId}` },
        () => {
          const refetch = async () => {
            try {
              const { data: links } = await supabase
                .from("employee_venue_links")
                .select("user_id, role")
                .eq("venue_id", venueId)
                .eq("is_active", true);
              const employeeUserIds = (links || []).map((link) => link.user_id);
              const allUserIds = [...new Set([user.id, ...employeeUserIds])];
              const { data: profiles } = await supabase
                .from("customer_profiles")
                .select("user_id, display_name, avatar_url")
                .in("user_id", allUserIds);
              const { data: shiftData } = await supabase
                .from("employee_shifts")
                .select("employee_id, status, total_sales, orders_served")
                .eq("venue_id", venueId)
                .in("status", ["active", "break"]);
              const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
              const roleMap = new Map((links || []).map((link) => [link.user_id, link.role]));
              const shiftMap = new Map((shiftData || []).map((shift) => [shift.employee_id, shift]));

              setRealStaff(
                allUserIds.map((userId) => {
                  const profile = profileMap.get(userId);
                  const isOwner = userId === user.id;
                  const activeShift = shiftMap.get(userId);

                  return {
                    id: userId,
                    name: profile?.display_name || (isOwner ? user.email?.split("@")[0] || "Owner" : "Staff member"),
                    avatar: profile?.avatar_url || "",
                    role: isOwner ? "Owner" : roleMap.get(userId) || "Staff",
                    status: activeShift ? (activeShift.status === "break" ? "break" : "active") : "off",
                    clockedIn: Boolean(activeShift),
                    sales: activeShift?.total_sales || 0,
                    orders: activeShift?.orders_served || 0,
                    performance: Math.floor(Math.random() * 15) + 85,
                    hoursWeek: 0,
                  };
                }),
              );
            } catch (error) {
              console.error("Realtime POS staff refetch error", error);
            }
          };

          void refetch();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, user]);

  const activeStaff = useMemo(() => realStaff.filter((staff) => staff.clockedIn), [realStaff]);
  const totalSales = useMemo(() => activeStaff.reduce((sum, staff) => sum + staff.sales, 0), [activeStaff]);
  const totalOrders = useMemo(() => activeStaff.reduce((sum, staff) => sum + staff.orders, 0), [activeStaff]);
  const onBreakCount = useMemo(() => realStaff.filter((staff) => staff.status === "break").length, [realStaff]);
  const offDutyCount = useMemo(() => realStaff.filter((staff) => staff.status === "off").length, [realStaff]);
  const roles = useMemo(() => Array.from(new Set(realStaff.map((staff) => staff.role))).sort(), [realStaff]);
  const venueLabel = localStorage.getItem("jv_current_venue_name") || "Venue";

  const filteredStaff = realStaff.filter((member) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = !normalizedQuery || member.name.toLowerCase().includes(normalizedQuery) || member.role.toLowerCase().includes(normalizedQuery);
    const matchesRole = roleFilter === "all" || member.role === roleFilter;
    const matchesStatus = statusFilter === "all" || member.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const openShiftEditor = (
    employeeUserId: string,
    day: string,
    shift?: { roster_id: string; start_time: string; end_time: string },
  ) => {
    setEditingShift({
      rosterId: shift?.roster_id || null,
      employeeUserId,
      day,
      startTime: shift?.start_time || "09:00",
      endTime: shift?.end_time || "17:00",
      isNew: !shift,
    });
  };

  return (
    <div className="pos-staff-page">
      <header className="pos-staff-topbar">
        <div>
          <span>{venueLabel}</span>
          <strong>Point of Sale</strong>
        </div>
        <span><ShieldCheck aria-hidden="true" />Staff workspace</span>
      </header>

      <section className="pos-staff-heading">
        <div>
          <h1>Staff management</h1>
          <p>Keep your team, shifts, and current-service activity in one place.</p>
        </div>
        <div className="pos-staff-heading__actions">
          <button className="pos-staff-button pos-staff-button--secondary pos-staff-button--compact" type="button" onClick={() => setActiveTab("roster")}>
            <CalendarDays aria-hidden="true" />
            <span>View roster</span>
          </button>
          <button className="pos-staff-button pos-staff-button--primary pos-staff-button--compact" type="button" onClick={() => setShowInviteModal(true)}>
            <UserPlus aria-hidden="true" />
            <span>Create employee</span>
          </button>
          <span className="pos-staff-heading__status"><CheckCircle2 aria-hidden="true" />Staff only</span>
        </div>
      </section>

      <section className="pos-staff-summary" aria-label="Current staff summary">
        <article>
          <span><UsersRound aria-hidden="true" />On shift</span>
          <strong>{activeStaff.length}</strong>
          <small>{onBreakCount} on break</small>
        </article>
        <article>
          <span><Clock3 aria-hidden="true" />Off duty</span>
          <strong>{offDutyCount}</strong>
          <small>{realStaff.length} total staff</small>
        </article>
        <article>
          <span><DollarSign aria-hidden="true" />Shift sales</span>
          <strong>${totalSales.toFixed(2)}</strong>
          <small>Across active shifts</small>
        </article>
        <article>
          <span><TrendingUp aria-hidden="true" />Orders served</span>
          <strong>{totalOrders}</strong>
          <small>During this shift</small>
        </article>
      </section>

      <div className="pos-staff-tabs" role="tablist" aria-label="Staff views">
        <button className={activeTab === "management" ? "is-active" : undefined} type="button" role="tab" aria-selected={activeTab === "management"} onClick={() => setActiveTab("management")}>Staff directory</button>
        <button className={activeTab === "roster" ? "is-active" : undefined} type="button" role="tab" aria-selected={activeTab === "roster"} onClick={() => setActiveTab("roster")}>Weekly roster</button>
        <button className={activeTab === "performance" ? "is-active" : undefined} type="button" role="tab" aria-selected={activeTab === "performance"} onClick={() => setActiveTab("performance")}>Performance</button>
      </div>

      {activeTab === "management" && (
        <section className="pos-staff-roster" aria-labelledby="pos-staff-directory-title">
          <header className="pos-staff-roster__heading">
            <div>
              <h2 id="pos-staff-directory-title">Staff roster</h2>
              <p>Review available employees and their current service activity.</p>
            </div>
            <div className="pos-staff-roster__filters" role="group" aria-label="Filter staff by role">
              <button className={roleFilter === "all" ? "is-active" : undefined} type="button" onClick={() => setRoleFilter("all")}>All</button>
              {roles.map((role) => (
                <button key={role} className={roleFilter === role ? "is-active" : undefined} type="button" onClick={() => setRoleFilter(role)}>{role}</button>
              ))}
            </div>
          </header>

          <div className="pos-staff-roster__grid">
            <section className="pos-staff-employee-panel" aria-label="Employees">
              <label className="pos-staff-search" htmlFor="pos-staff-search">
                <Search aria-hidden="true" />
                <input id="pos-staff-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search employees" />
              </label>
              <label className="pos-staff-status-filter" htmlFor="pos-staff-status">
                <span>Status</span>
                <select id="pos-staff-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="active">On shift</option>
                  <option value="break">On break</option>
                  <option value="off">Off duty</option>
                </select>
              </label>

              <div className="pos-staff-employee-list" aria-live="polite">
                {loadingStaff ? <p className="pos-staff-empty">Loading staff...</p> : filteredStaff.length === 0 ? <p className="pos-staff-empty">No staff match these filters.</p> : filteredStaff.map((staff) => (
                  <article className="pos-staff-employee-card" key={staff.id}>
                    {staff.avatar ? <img src={staff.avatar} alt="" /> : <span className="pos-staff-employee-avatar">{getInitials(staff.name)}</span>}
                    <div className="pos-staff-employee-card__copy">
                      <strong>{staff.name}</strong>
                      <small>{staff.role}</small>
                    </div>
                    <span className={`pos-staff-status pos-staff-status--${staff.status}`}>{getStatusLabel(staff.status)}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="pos-staff-service-panel" aria-label="Current shift service activity">
              <div className="pos-staff-service-panel__heading">
                <div>
                  <h3>Current shift</h3>
                  <p>Live activity from clocked-in employees.</p>
                </div>
                <span>{activeStaff.length} active</span>
              </div>
              <div className="pos-staff-service-grid">
                <article>
                  <span>On shift</span>
                  <strong>{activeStaff.length}</strong>
                  <small>Ready for service</small>
                </article>
                <article>
                  <span>On break</span>
                  <strong>{onBreakCount}</strong>
                  <small>Temporarily unavailable</small>
                </article>
                <article>
                  <span>Shift sales</span>
                  <strong>${totalSales.toFixed(2)}</strong>
                  <small>Active staff total</small>
                </article>
                <article>
                  <span>Orders</span>
                  <strong>{totalOrders}</strong>
                  <small>Orders served</small>
                </article>
              </div>

              <div className="pos-staff-live-list">
                {activeStaff.length === 0 ? <p className="pos-staff-empty">No employees are clocked in.</p> : activeStaff.map((staff) => (
                  <div className="pos-staff-live-list__item" key={staff.id}>
                    <span className="pos-staff-live-list__avatar">{getInitials(staff.name)}</span>
                    <div><strong>{staff.name}</strong><small>{staff.role}</small></div>
                    <span>{staff.sales > 0 ? `$${staff.sales.toFixed(2)}` : getStatusLabel(staff.status)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {activeTab === "roster" && (
        <section className="pos-staff-section pos-staff-section--roster" aria-labelledby="pos-staff-weekly-roster-title">
          <header className="pos-staff-section__heading">
            <span className="pos-staff-section__icon"><CalendarDays aria-hidden="true" /></span>
            <div>
              <h2 id="pos-staff-weekly-roster-title">Weekly roster</h2>
              <p>Select a shift to add it, adjust its hours, or remove it.</p>
            </div>
          </header>

          {rosterLoading ? <p className="pos-staff-empty pos-staff-empty--panel">Loading roster...</p> : rosterEmployees.length === 0 ? <p className="pos-staff-empty pos-staff-empty--panel">No staff rostered yet. Invite employees and assign shifts.</p> : (
            <div className="pos-staff-table-wrap">
              <table className="pos-staff-table">
                <caption className="sr-only">Weekly staff roster</caption>
                <thead>
                  <tr>
                    <th scope="col">Staff member</th>
                    {DAYS.map((day) => <th key={day} scope="col">{DAY_SHORT[day]}</th>)}
                    <th scope="col">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <div className="pos-staff-table__employee"><strong>{employee.name}</strong><span className={getRoleColor(employee.role)}>{employee.role}</span></div>
                      </td>
                      {DAYS.map((day) => {
                        const shift = employee.shifts.find((item) => item.day_of_week === day);
                        return (
                          <td key={day}>
                            <button className={`pos-staff-shift${shift ? ` ${getRoleColor(employee.role)} ${getRoleGlow(employee.role)}` : ""}`} type="button" onClick={() => openShiftEditor(employee.user_id, day, shift)} aria-label={`${shift ? "Edit" : "Add"} ${day} shift for ${employee.name}`}>
                              {shift ? `${formatTime12(shift.start_time)}-${formatTime12(shift.end_time)}` : <Plus aria-hidden="true" />}
                            </button>
                          </td>
                        );
                      })}
                      <td className="pos-staff-table__hours">{employee.totalHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "performance" && (
        <section className="pos-staff-section" aria-labelledby="pos-staff-performance-title">
          <header className="pos-staff-section__heading">
            <span className="pos-staff-section__icon"><TrendingUp aria-hidden="true" /></span>
            <div>
              <h2 id="pos-staff-performance-title">Performance</h2>
              <p>Monitor active employee sales and shift activity.</p>
            </div>
          </header>

          {loadingStaff ? <p className="pos-staff-empty pos-staff-empty--panel">Loading staff...</p> : filteredStaff.length === 0 ? <p className="pos-staff-empty pos-staff-empty--panel">No staff match these filters.</p> : (
            <div className="pos-staff-performance-grid">
              {filteredStaff.map((member) => (
                <article className="pos-staff-performance-card" key={member.id}>
                  <header>
                    {member.avatar ? <img src={member.avatar} alt="" /> : <span>{getInitials(member.name)}</span>}
                    <div><strong>{member.name}</strong><small>{member.role}</small></div>
                    <b className={`pos-staff-status pos-staff-status--${member.status}`}>{getStatusLabel(member.status)}</b>
                  </header>
                  <div className="pos-staff-performance-card__score">
                    <span><small>Performance score</small><strong>{member.performance}%</strong></span>
                    <i><b style={{ width: `${member.performance}%` }} /></i>
                  </div>
                  <div className="pos-staff-performance-card__metrics">
                    <span><small>Hours/week</small><strong>{member.hoursWeek}h</strong></span>
                    <span><small>Shift sales</small><strong>${member.sales.toFixed(0)}</strong></span>
                    <span><small>Orders</small><strong>{member.orders}</strong></span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <StaffInviteModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />

      {editingShift && (
        <div className="pos-staff-shift-modal" role="presentation" onMouseDown={() => setEditingShift(null)}>
          <section className="pos-staff-shift-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-staff-shift-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2 id="pos-staff-shift-dialog-title">{editingShift.isNew ? "Add shift" : "Edit shift"}</h2>
                <p>{editingShift.day}</p>
              </div>
              <button className="pos-staff-icon-button" type="button" aria-label="Close shift editor" onClick={() => setEditingShift(null)}><X aria-hidden="true" /></button>
            </header>
            <label>
              <span>Start time</span>
              <input type="time" value={editingShift.startTime} onChange={(event) => setEditingShift({ ...editingShift, startTime: event.target.value })} />
            </label>
            <label>
              <span>End time</span>
              <input type="time" value={editingShift.endTime} onChange={(event) => setEditingShift({ ...editingShift, endTime: event.target.value })} />
            </label>
            <footer>
              {!editingShift.isNew && <button className="pos-staff-button pos-staff-button--danger" type="button" onClick={async () => {
                if (editingShift.rosterId) {
                  const error = await deleteShift(editingShift.rosterId);
                  if (error) toast.error("Failed to delete shift");
                  else toast.success("Shift deleted");
                }
                setEditingShift(null);
              }}><Trash2 aria-hidden="true" /><span>Delete</span></button>}
              <button className="pos-staff-button pos-staff-button--primary" type="button" onClick={async () => {
                const error = editingShift.isNew
                  ? await addShift(editingShift.employeeUserId, editingShift.day, editingShift.startTime, editingShift.endTime)
                  : editingShift.rosterId
                    ? await updateShift(editingShift.rosterId, editingShift.startTime, editingShift.endTime)
                    : null;
                if (error) toast.error(editingShift.isNew ? "Failed to add shift" : "Failed to update shift");
                else toast.success(editingShift.isNew ? "Shift added" : "Shift updated");
                setEditingShift(null);
              }}><Pencil aria-hidden="true" /><span>Save shift</span></button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

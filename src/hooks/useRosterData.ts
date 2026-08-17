import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";

export interface RosterEmployee {
  id: string;
  user_id: string;
  name: string;
  role: string;
  shifts: RosterShift[];
  totalHours: number;
}

export interface RosterShift {
  id: string;
  roster_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  station: string | null;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun"
};
const DAY_LABEL: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday"
};

export const getRoleColor = (role: string) => {
  const r = role.toLowerCase();
  if (r.includes("manager")) return "bg-purple-500/20 border-purple-500/40 text-purple-300";
  if (r.includes("bartender") || r.includes("bar")) return "bg-blue-500/20 border-blue-500/40 text-blue-300";
  if (r.includes("server") || r.includes("waiter") || r.includes("waitress")) return "bg-green-500/20 border-green-500/40 text-green-300";
  if (r.includes("kitchen") || r.includes("chef") || r.includes("cook")) return "bg-orange-500/20 border-orange-500/40 text-orange-300";
  if (r.includes("host")) return "bg-pink-500/20 border-pink-500/40 text-pink-300";
  return "bg-cyan-500/20 border-cyan-500/40 text-cyan-300";
};

export const getRoleGlow = (role: string) => {
  const r = role.toLowerCase();
  if (r.includes("manager")) return "shadow-purple-500/30";
  if (r.includes("bartender") || r.includes("bar")) return "shadow-blue-500/30";
  if (r.includes("server") || r.includes("waiter")) return "shadow-green-500/30";
  if (r.includes("kitchen") || r.includes("chef")) return "shadow-orange-500/30";
  if (r.includes("host")) return "shadow-pink-500/30";
  return "shadow-cyan-500/30";
};

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // overnight
  return diff / 60;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${m > 0 ? `:${m.toString().padStart(2, "0")}` : ""}${ampm}`;
}

export function useRosterData(venueId: string | null | undefined) {
  const [employees, setEmployees] = useState<RosterEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoster = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);

    // Fetch venue to get owner
    const { data: venueData } = await supabase
      .from("venues")
      .select("owner_user_id, name")
      .eq("id", venueId)
      .single();

    // Fetch employees linked to venue
    const { data: links } = await supabase
      .from("employee_venue_links")
      .select("id, user_id, role")
      .eq("venue_id", venueId)
      .eq("is_active", true);

    // Build combined list: owner + employees
    const allStaff: { id: string; user_id: string; role: string }[] = [];

    // Add owner first (if not already in employee_venue_links)
    if (venueData?.owner_user_id) {
      const ownerAlreadyLinked = links?.some(l => l.user_id === venueData.owner_user_id);
      if (!ownerAlreadyLinked) {
        allStaff.push({ id: `owner-${venueData.owner_user_id}`, user_id: venueData.owner_user_id, role: "Owner" });
      }
    }

    if (links) {
      allStaff.push(...links);
    }

    if (allStaff.length === 0) {
      setEmployees([]);
      setLoading(false);
      return;
    }

    // Fetch profiles for display names
    const userIds = allStaff.map(l => l.user_id);
    const { data: profiles } = await supabase
      .from("customer_profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);

    // Fetch roster entries
    const { data: rosterEntries } = await supabase
      .from("employee_roster")
      .select("*")
      .eq("venue_id", venueId);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

    const result: RosterEmployee[] = allStaff.map(link => {
      const shifts: RosterShift[] = (rosterEntries || [])
        .filter(r => r.employee_id === link.user_id)
        .map(r => ({
          id: r.id,
          roster_id: r.id,
          day_of_week: r.day_of_week.toLowerCase(),
          start_time: r.start_time,
          end_time: r.end_time,
          station: r.station,
        }));

      const totalHours = shifts.reduce((sum, s) => sum + calcHours(s.start_time, s.end_time), 0);

      // For owner, fall back to venue name if no profile
      const displayName = profileMap.get(link.user_id) || (link.role === "Owner" ? venueData?.name || "Owner" : "Unknown");

      return {
        id: link.id,
        user_id: link.user_id,
        name: displayName,
        role: link.role,
        shifts,
        totalHours: Math.round(totalHours * 10) / 10,
      };
    });

    setEmployees(result);
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Realtime subscription for roster AND employee links
  useEffect(() => {
    if (!venueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`roster-${venueId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_roster", filter: `venue_id=eq.${venueId}` },
        () => { fetchRoster(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_venue_links", filter: `venue_id=eq.${venueId}` },
        () => { fetchRoster(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [venueId, fetchRoster]);

  const updateShift = async (rosterId: string, startTime: string, endTime: string) => {
    const { error } = await supabase
      .from("employee_roster")
      .update({ start_time: startTime, end_time: endTime, updated_at: new Date().toISOString() })
      .eq("id", rosterId);

    if (!error) {
      // Send notification to employee
      const entry = employees.flatMap(e => e.shifts).find(s => s.roster_id === rosterId);
      const emp = employees.find(e => e.shifts.some(s => s.roster_id === rosterId));
      if (emp && entry) {
        await supabase.from("customer_notifications").insert({
          user_id: emp.user_id,
          type: "shift_update",
          title: "Shift Updated",
          message: `Your ${DAY_LABEL[entry.day_of_week] || entry.day_of_week} shift has been updated to ${formatTime12(startTime)} - ${formatTime12(endTime)}`,
          reference_id: venueId,
          reference_type: "venue",
        });
      }
      await fetchRoster();
    }
    return error;
  };

  const deleteShift = async (rosterId: string) => {
    const entry = employees.flatMap(e => e.shifts).find(s => s.roster_id === rosterId);
    const emp = employees.find(e => e.shifts.some(s => s.roster_id === rosterId));

    const { error } = await supabase
      .from("employee_roster")
      .delete()
      .eq("id", rosterId);

    if (!error && emp && entry) {
      await supabase.from("customer_notifications").insert({
        user_id: emp.user_id,
        type: "shift_update",
        title: "Shift Removed",
        message: `Your ${DAY_LABEL[entry.day_of_week] || entry.day_of_week} shift has been removed`,
        reference_id: venueId,
        reference_type: "venue",
      });
      await fetchRoster();
    }
    return error;
  };

  const addShift = async (employeeUserId: string, dayOfWeek: string, startTime: string, endTime: string) => {
    if (!venueId) return;

    const { error } = await supabase
      .from("employee_roster")
      .insert({
        employee_id: employeeUserId,
        venue_id: venueId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      });

    if (!error) {
      await supabase.from("customer_notifications").insert({
        user_id: employeeUserId,
        type: "shift_update",
        title: "New Shift Added",
        message: `You've been rostered for ${DAY_LABEL[dayOfWeek] || dayOfWeek}: ${formatTime12(startTime)} - ${formatTime12(endTime)}`,
        reference_id: venueId,
        reference_type: "venue",
      });
      await fetchRoster();
    }
    return error;
  };

  return {
    employees,
    loading,
    fetchRoster,
    updateShift,
    deleteShift,
    addShift,
    DAYS,
    DAY_SHORT,
    DAY_LABEL,
    formatTime12,
  };
}

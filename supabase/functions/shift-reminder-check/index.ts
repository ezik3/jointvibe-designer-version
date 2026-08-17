import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all enabled reminders joined with roster entries and venue timezone
    const { data: reminders, error } = await supabase
      .from("shift_reminders")
      .select(`
        id,
        employee_id,
        venue_id,
        roster_id,
        day_of_week,
        reminder_minutes_before,
        enabled
      `)
      .eq("enabled", true);

    if (error) throw error;
    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get unique venue IDs to fetch timezones
    const venueIds = [...new Set(reminders.map(r => r.venue_id))];
    const { data: venues } = await supabase
      .from("venues")
      .select("id, name, timezone")
      .in("id", venueIds);

    const venueMap = new Map(venues?.map(v => [v.id, v]) || []);

    // Get roster entries for start times
    const rosterIds = [...new Set(reminders.map(r => r.roster_id))];
    const { data: rosterEntries } = await supabase
      .from("employee_roster")
      .select("id, start_time, end_time, day_of_week")
      .in("id", rosterIds);

    const rosterMap = new Map(rosterEntries?.map(r => [r.id, r]) || []);

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    let sentCount = 0;

    for (const reminder of reminders) {
      const venue = venueMap.get(reminder.venue_id);
      const roster = rosterMap.get(reminder.roster_id);
      if (!venue || !roster) continue;

      // Get current time in venue timezone
      const tz = venue.timezone || "UTC";
      const now = new Date();
      const venueNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));

      const currentDay = dayNames[venueNow.getDay()];
      if (currentDay !== reminder.day_of_week) continue;

      // Calculate shift start time today in venue TZ
      const [sh, sm] = roster.start_time.split(":").map(Number);
      const shiftStartMinutes = sh * 60 + sm;
      const currentMinutes = venueNow.getHours() * 60 + venueNow.getMinutes();

      const minutesUntilShift = shiftStartMinutes - currentMinutes;

      // Check if we're within a 2-minute window of when the reminder should fire
      if (Math.abs(minutesUntilShift - reminder.reminder_minutes_before) <= 1) {
        const h12 = sh === 0 ? 12 : sh > 12 ? sh - 12 : sh;
        const ampm = sh >= 12 ? "PM" : "AM";
        const timeStr = `${h12}${sm > 0 ? `:${sm.toString().padStart(2, "0")}` : ""}${ampm}`;

        await supabase.from("customer_notifications").insert({
          user_id: reminder.employee_id,
          type: "shift_reminder",
          title: "⏰ Shift Reminder",
          message: `Your shift at ${venue.name} starts in ${reminder.reminder_minutes_before >= 60 ? `${Math.round(reminder.reminder_minutes_before / 60)} hour(s)` : `${reminder.reminder_minutes_before} min`} (${timeStr})`,
          reference_id: reminder.venue_id,
          reference_type: "venue",
        });

        sentCount++;
      }
    }

    return new Response(JSON.stringify({ sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Shift reminder error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

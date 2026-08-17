import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Reminder intervals in hours before reservation
const REMINDER_INTERVALS = [
  { type: '1_day', hoursBeforeStart: 24, minHoursAdvance: 25 }, // Only send if booked 25+ hours in advance
  { type: '8_hours', hoursBeforeStart: 8, minHoursAdvance: 9 },
  { type: '1_hour', hoursBeforeStart: 1, minHoursAdvance: 2 },
  { type: '30_min', hoursBeforeStart: 0.5, minHoursAdvance: 0.5 }, // Always send 30min reminder
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const notifications: any[] = [];

    // Fetch all upcoming reservations that are confirmed and not cancelled
    const { data: reservations, error: resError } = await supabase
      .from("table_reservations")
      .select(`
        id,
        customer_id,
        customer_name,
        reservation_date,
        start_time,
        status,
        venue_id,
        venues (name)
      `)
      .in("status", ["confirmed", "pending"])
      .gte("reservation_date", now.toISOString().split("T")[0]);

    if (resError) {
      console.error("Error fetching reservations:", resError);
      throw resError;
    }

    console.log(`Found ${reservations?.length || 0} upcoming reservations`);

    for (const reservation of reservations || []) {
      // Manual venue bookings have no customer account to notify.
      if (!reservation.customer_id) continue;

      // Parse reservation datetime
      const reservationDateTime = new Date(
        `${reservation.reservation_date}T${reservation.start_time}`
      );
      
      // Calculate hours until reservation
      const hoursUntil = (reservationDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Skip if reservation is in the past
      if (hoursUntil < 0) continue;

      // Check each reminder interval
      for (const interval of REMINDER_INTERVALS) {
        // Check if we're within the window to send this reminder
        // Window is: hoursBeforeStart - 0.25 hours to hoursBeforeStart + 0.25 hours
        const lowerBound = interval.hoursBeforeStart - 0.25;
        const upperBound = interval.hoursBeforeStart + 0.25;
        
        if (hoursUntil >= lowerBound && hoursUntil <= upperBound) {
          // Check if reminder was already sent
          const { data: existingReminder } = await supabase
            .from("reservation_reminders")
            .select("id")
            .eq("reservation_id", reservation.id)
            .eq("reminder_type", interval.type)
            .single();

          if (!existingReminder) {
            // Create the reminder notification
            const venueName = (reservation.venues as any)?.name || "the venue";
            let title = "";
            let message = "";

            switch (interval.type) {
              case "1_day":
                title = "Reservation Tomorrow!";
                message = `Don't forget your reservation at ${venueName} tomorrow at ${reservation.start_time.slice(0, 5)}`;
                break;
              case "8_hours":
                title = "Reservation in 8 Hours";
                message = `Your reservation at ${venueName} is coming up at ${reservation.start_time.slice(0, 5)}`;
                break;
              case "1_hour":
                title = "Reservation in 1 Hour!";
                message = `Your table at ${venueName} will be ready at ${reservation.start_time.slice(0, 5)}. See you soon!`;
                break;
              case "30_min":
                title = "Almost Time!";
                message = `Your reservation at ${venueName} starts in 30 minutes. Time to head over!`;
                break;
            }

            // Insert notification
            const { error: notifError } = await supabase
              .from("customer_notifications")
              .insert({
                user_id: reservation.customer_id,
                type: "reservation_reminder",
                title,
                message,
                reference_id: reservation.id,
                reference_type: "reservation",
              });

            if (notifError) {
              console.error("Error creating notification:", notifError);
            } else {
              // Mark reminder as sent
              await supabase.from("reservation_reminders").insert({
                reservation_id: reservation.id,
                reminder_type: interval.type,
              });

              notifications.push({
                reservationId: reservation.id,
                customerId: reservation.customer_id,
                type: interval.type,
              });

              console.log(`Sent ${interval.type} reminder for reservation ${reservation.id}`);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent: notifications.length,
        notifications,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in reservation-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

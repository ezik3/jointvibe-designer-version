import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addMinutes, parse, isAfter, isBefore, addHours, differenceInHours } from "date-fns";
import { extractVenueFloorplanTables, readVenueTablesSync } from "@/lib/venueFloorplanStorage";

interface VenueSettings {
  reservationsEnabled: boolean;
  minBookingLeadMinutes: number;
  maxAdvanceBookingDays: number;
  defaultReservationDurationMinutes: number;
  timeSlotIntervalMinutes: number;
  reservationDepositPercent: number;
  depositRequiredWithinHours: number;
  depositDeadlineHours: number;
}

interface TableInfo {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string | null;
  status: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface Reservation {
  id: string;
  tableId: string;
  startTime: string;
  endTime: string;
}

export function useTableAvailability(venueId: string | null) {
  const [loading, setLoading] = useState(false);
  const [venueSettings, setVenueSettings] = useState<VenueSettings | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const fetchVenueSettings = useCallback(async () => {
    if (!venueId) return null;

    const { data, error } = await supabase
      .from("venues")
      .select(`
        reservations_enabled,
        min_booking_lead_minutes,
        max_advance_booking_days,
        default_reservation_duration_minutes,
        time_slot_interval_minutes,
        reservation_deposit_percent,
        deposit_required_within_hours,
        deposit_deadline_hours
      `)
      .eq("id", venueId)
      .single();

    if (error || !data) return null;

    const settings: VenueSettings = {
      reservationsEnabled: data.reservations_enabled ?? false,
      minBookingLeadMinutes: data.min_booking_lead_minutes ?? 30,
      maxAdvanceBookingDays: data.max_advance_booking_days ?? 30,
      defaultReservationDurationMinutes: data.default_reservation_duration_minutes ?? 90,
      timeSlotIntervalMinutes: data.time_slot_interval_minutes ?? 30,
      reservationDepositPercent: data.reservation_deposit_percent ?? 20,
      depositRequiredWithinHours: data.deposit_required_within_hours ?? 8,
      depositDeadlineHours: data.deposit_deadline_hours ?? 24,
    };

    setVenueSettings(settings);
    return settings;
  }, [venueId]);

  const fetchTables = useCallback(async () => {
    if (!venueId) return [];

    // 1. First check the current venue's floorplan with embedded tables in items JSON.
    const { data: floorplan } = await supabase
      .from("floorplans")
      .select("id, items")
      .eq("venue_id", venueId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (floorplan?.items) {
      const tableData = extractVenueFloorplanTables(floorplan.items);
      if (tableData.length > 0) {
        setTables(tableData);
        return tableData;
      }
    }

    // 2. Try localStorage as fallback (for venue owner's local session)
    const syncedTables = readVenueTablesSync<unknown[]>(venueId);
    const tableData = extractVenueFloorplanTables({ tables: syncedTables });
    if (tableData.length > 0) {
      setTables(tableData);
      return tableData;
    }

    // 3. Last resort: check venue_tables directly
    if (floorplan?.id) {
      const { data, error } = await supabase
        .from("venue_tables")
        .select("id, table_number, capacity, section, status")
        .eq("floorplan_id", floorplan.id);

      if (!error && data && data.length > 0) {
        const tableData: TableInfo[] = data.map(t => ({
          id: t.id,
          tableNumber: t.table_number,
          capacity: t.capacity,
          section: t.section,
          status: t.status || "available",
        }));
        setTables(tableData);
        return tableData;
      }
    }

    setTables([]);
    return [];
  }, [venueId]);

  const fetchReservationsForDate = useCallback(async (date: Date) => {
    if (!venueId) return [];

    const dateStr = format(date, "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("table_reservations")
      .select("id, table_id, start_time, end_time")
      .eq("venue_id", venueId)
      .eq("reservation_date", dateStr)
      .in("status", ["pending", "confirmed", "awaiting_deposit"]);

    if (error || !data) return [];

    const reservationData: Reservation[] = data.map(r => ({
      id: r.id,
      tableId: r.table_id || "",
      startTime: r.start_time,
      endTime: r.end_time,
    }));

    setReservations(reservationData);
    return reservationData;
  }, [venueId]);

  const generateTimeSlots = useCallback((date: Date, settings: VenueSettings): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const now = new Date();
    const interval = settings.timeSlotIntervalMinutes;
    
    // Generate slots from 10:00 to 22:00 (adjust as needed)
    let currentSlot = parse("10:00", "HH:mm", date);
    const endTime = parse("22:00", "HH:mm", date);
    
    while (isBefore(currentSlot, endTime)) {
      const slotTime = format(currentSlot, "HH:mm");
      
      // Check if slot is available (min lead time)
      const slotDateTime = parse(slotTime, "HH:mm", date);
      const minBookingTime = addMinutes(now, settings.minBookingLeadMinutes);
      const available = isAfter(slotDateTime, minBookingTime);
      
      slots.push({
        time: slotTime,
        available,
      });
      
      currentSlot = addMinutes(currentSlot, interval);
    }
    
    return slots;
  }, []);

  const getAvailableTables = useCallback((
    time: string,
    partySize: number,
    reservations: Reservation[],
    tables: TableInfo[],
    durationMinutes: number
  ): TableInfo[] => {
    // Filter tables by capacity
    const suitableTables = tables.filter(t => t.capacity >= partySize && t.status === "available");
    
    // Filter out reserved tables for the given time
    return suitableTables.filter(table => {
      const tableReservations = reservations.filter(r => r.tableId === table.id);
      
      // Check if any reservation overlaps with the requested time
      for (const res of tableReservations) {
        const resStart = parse(res.startTime, "HH:mm:ss", new Date());
        const resEnd = parse(res.endTime, "HH:mm:ss", new Date());
        const reqStart = parse(time, "HH:mm", new Date());
        const reqEnd = addMinutes(reqStart, durationMinutes);
        
        // Check for overlap
        if (
          (isAfter(reqStart, resStart) && isBefore(reqStart, resEnd)) ||
          (isAfter(reqEnd, resStart) && isBefore(reqEnd, resEnd)) ||
          (isBefore(reqStart, resStart) && isAfter(reqEnd, resEnd)) ||
          reqStart.getTime() === resStart.getTime()
        ) {
          return false;
        }
      }
      
      return true;
    });
  }, []);

  const calculateDepositRequirements = useCallback((
    reservationDateTime: Date,
    settings: VenueSettings,
    orderTotal: number
  ): { depositRequired: boolean; depositAmount: number; depositDeadline: Date | null } => {
    const now = new Date();
    const hoursUntilReservation = differenceInHours(reservationDateTime, now);
    
    // If booking within X hours, deposit required immediately
    if (hoursUntilReservation <= settings.depositRequiredWithinHours) {
      return {
        depositRequired: true,
        depositAmount: orderTotal * (settings.reservationDepositPercent / 100),
        depositDeadline: null, // Due immediately
      };
    }
    
    // If booking further out, deposit due 24 hours before
    const depositDeadline = addHours(reservationDateTime, -settings.depositDeadlineHours);
    
    return {
      depositRequired: false, // Not required immediately
      depositAmount: orderTotal * (settings.reservationDepositPercent / 100),
      depositDeadline,
    };
  }, []);

  const loadAvailabilityData = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      await Promise.all([
        fetchVenueSettings(),
        fetchTables(),
        fetchReservationsForDate(date),
      ]);
    } finally {
      setLoading(false);
    }
  }, [fetchVenueSettings, fetchTables, fetchReservationsForDate]);

  return {
    loading,
    venueSettings,
    tables,
    reservations,
    loadAvailabilityData,
    fetchVenueSettings,
    fetchTables,
    fetchReservationsForDate,
    generateTimeSlots,
    getAvailableTables,
    calculateDepositRequirements,
  };
}

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import type { Database } from "@/integrations/supabase/types";
import { format, addMinutes, parse } from "date-fns";
import { toast } from "sonner";
import { updateVenueScoreCounter } from "@/hooks/useVenueTier";

type ReservationRow = Database["public"]["Tables"]["table_reservations"]["Row"];

interface ReservationQueryRow extends ReservationRow {
  venue_tables: { table_number: string } | null;
  orders: { total: number | null } | null;
}

export interface TableReservation {
  id: string;
  venueId: string;
  tableId: string | null;
  customerId: string | null;
  orderId: string | null;
  reservationDate: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: string;
  customerName: string;
  customerPhone: string | null;
  specialRequests: string | null;
  hasPreOrder: boolean;
  depositRequired: boolean;
  depositAmount: number;
  depositPaid: boolean;
  depositPaidAt: string | null;
  depositDeadline: string | null;
  depositForfeited: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  // Joined data
  tableName?: string;
  orderTotal?: number;
}

interface CreateReservationData {
  venueId: string;
  tableId: string;
  customerId: string;
  reservationDate: Date;
  startTime: string;
  partySize: number;
  customerName: string;
  customerPhone?: string;
  specialRequests?: string;
  durationMinutes: number;
  depositRequired: boolean;
  depositAmount: number;
  depositDeadline: Date | null;
}

interface CreateManualReservationData {
  venueId: string;
  tableId?: string | null;
  reservationDate: Date;
  startTime: string;
  partySize: number;
  customerName: string;
  specialRequests?: string;
  durationMinutes?: number;
}

export function useReservations(venueId: string | null) {
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReservations = useCallback(async (dateFilter?: Date) => {
    if (!venueId) return [];

    setLoading(true);
    try {
      let query = supabase
        .from("table_reservations")
        .select(`
          *,
          venue_tables (table_number),
          orders:orders!table_reservations_order_id_fkey(total)
        `)
        .eq("venue_id", venueId)
        .order("reservation_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (dateFilter) {
        query = query.eq("reservation_date", format(dateFilter, "yyyy-MM-dd"));
      }

      const { data, error } = await query;

      if (error) throw error;

      const reservationRows = (data || []) as unknown as ReservationQueryRow[];
      const mapped: TableReservation[] = reservationRows.map((r) => ({
        id: r.id,
        venueId: r.venue_id,
        tableId: r.table_id,
        customerId: r.customer_id,
        orderId: r.order_id,
        reservationDate: r.reservation_date,
        startTime: r.start_time,
        endTime: r.end_time,
        partySize: r.party_size,
        status: r.status,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        specialRequests: r.special_requests,
        hasPreOrder: r.has_pre_order,
        depositRequired: r.deposit_required,
        depositAmount: Number(r.deposit_amount) || 0,
        depositPaid: r.deposit_paid,
        depositPaidAt: r.deposit_paid_at,
        depositDeadline: r.deposit_deadline,
        depositForfeited: r.deposit_forfeited,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        confirmedAt: r.confirmed_at,
        cancelledAt: r.cancelled_at,
        cancellationReason: r.cancellation_reason,
        tableName: r.venue_tables?.table_number,
        orderTotal: r.orders?.total,
      }));

      setReservations(mapped);
      return mapped;
    } catch (error) {
      console.error("Error fetching reservations:", error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  const createReservation = useCallback(async (data: CreateReservationData): Promise<TableReservation | null> => {
    const endTime = format(
      addMinutes(parse(data.startTime, "HH:mm", new Date()), data.durationMinutes),
      "HH:mm:ss"
    );

    // Reservations start as "pending" until venue accepts them
    const status = data.depositRequired ? "awaiting_deposit" : "pending";

    try {
      const payload = {
        venue_id: data.venueId,
        table_id: data.tableId,
        customer_id: data.customerId,
        reservation_date: format(data.reservationDate, "yyyy-MM-dd"),
        start_time: data.startTime + ":00",
        end_time: endTime,
        party_size: data.partySize,
        customer_name: data.customerName,
        customer_phone: data.customerPhone || null,
        special_requests: data.specialRequests || null,
        deposit_required: data.depositRequired,
        deposit_amount: data.depositAmount,
        deposit_deadline: data.depositDeadline?.toISOString() || null,
        status,
      };

      // First attempt: use selected table_id
      let { data: created, error } = await supabase
        .from("table_reservations")
        .insert(payload)
        .select()
        .single();

      // If table_id isn't a real DB table (floorplan/local-only), retry with NULL table_id
      if (error && (error as { code?: string }).code === "23503") {
        const retry = await supabase
          .from("table_reservations")
          .insert({ ...payload, table_id: null })
          .select()
          .single();

        created = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      // Toast is handled by the calling component to avoid duplicate notifications
      return created as unknown as TableReservation;
    } catch (error) {
      console.error("Error creating reservation:", error);
      toast.error("Failed to create reservation");
      return null;
    }
  }, []);

  const createManualReservation = useCallback(async (
    data: CreateManualReservationData,
  ): Promise<TableReservation | null> => {
    const endTime = format(
      addMinutes(parse(data.startTime, "HH:mm", new Date()), data.durationMinutes ?? 90),
      "HH:mm:ss",
    );
    const payload = {
      venue_id: data.venueId,
      table_id: data.tableId || null,
      customer_id: null,
      reservation_date: format(data.reservationDate, "yyyy-MM-dd"),
      start_time: `${data.startTime}:00`,
      end_time: endTime,
      party_size: data.partySize,
      customer_name: data.customerName.trim(),
      special_requests: data.specialRequests?.trim() || null,
      deposit_required: false,
      deposit_amount: 0,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    };

    try {
      let { data: created, error } = await supabase
        .from("table_reservations")
        .insert(payload)
        .select()
        .single();

      // Floorplan-only tables may not have a database row yet.
      if (error && (error as { code?: string }).code === "23503" && payload.table_id) {
        const retry = await supabase
          .from("table_reservations")
          .insert({ ...payload, table_id: null })
          .select()
          .single();

        created = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      await fetchReservations();
      return created as unknown as TableReservation;
    } catch (error) {
      console.error("Error creating manual reservation:", error);
      toast.error("Failed to create reservation");
      return null;
    }
  }, [fetchReservations]);

  const confirmLinkedPreOrder = useCallback(async (reservationId: string) => {
    try {
      const { data: res } = await supabase
        .from("table_reservations")
        .select("order_id, has_pre_order")
        .eq("id", reservationId)
        .maybeSingle();

      let orderId: string | null = res?.order_id ?? null;

      // Fallback: sometimes we have a reservation_id on the order but no order_id on the reservation yet
      if (!orderId && res?.has_pre_order) {
        const { data: order } = await supabase
          .from("orders")
          .select("id")
          .eq("reservation_id", reservationId)
          .eq("is_preorder", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        orderId = order?.id ?? null;
      }

      if (!orderId) return;

      // Move the linked pre-order into "venue_confirmed" so the customer sees confirmation instantly.
      const { error } = await supabase
        .from("orders")
        .update({ status: "venue_confirmed" })
        .eq("id", orderId)
        .in("status", ["pending"]);

      if (error) throw error;
    } catch (error) {
      console.error("Error confirming linked pre-order:", error);
    }
  }, []);

  const updateReservationStatus = useCallback(async (
    reservationId: string,
    status: string,
    reason?: string
  ) => {
    try {
      const updates: Database["public"]["Tables"]["table_reservations"]["Update"] = { status };

      if (status === "confirmed") {
        updates.confirmed_at = new Date().toISOString();
      } else if (status === "cancelled") {
        updates.cancelled_at = new Date().toISOString();
        if (reason) updates.cancellation_reason = reason;
      }

      const { error } = await supabase
        .from("table_reservations")
        .update(updates)
        .eq("id", reservationId);

      if (error) throw error;

      if (status === "confirmed") {
        await confirmLinkedPreOrder(reservationId);
        // Fire-and-forget venue tier counter update for confirmed reservations
        if (venueId) {
          updateVenueScoreCounter(venueId, "reservation_confirmed");
        }
      }

      toast.success(`Reservation ${status}`);
      await fetchReservations();
      return true;
    } catch (error) {
      console.error("Error updating reservation:", error);
      toast.error("Failed to update reservation");
      return false;
    }
  }, [fetchReservations, confirmLinkedPreOrder, venueId]);

  const markDepositPaid = useCallback(async (reservationId: string) => {
    try {
      const { error } = await supabase
        .from("table_reservations")
        .update({
          deposit_paid: true,
          deposit_paid_at: new Date().toISOString(),
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", reservationId);

      if (error) throw error;

      await confirmLinkedPreOrder(reservationId);

      toast.success("Deposit confirmed!");
      await fetchReservations();
      return true;
    } catch (error) {
      console.error("Error marking deposit paid:", error);
      toast.error("Failed to confirm deposit");
      return false;
    }
  }, [fetchReservations, confirmLinkedPreOrder]);

  const linkOrderToReservation = useCallback(async (
    reservationId: string,
    orderId: string
  ) => {
    try {
      // Update reservation with order ID
      const { error: resError } = await supabase
        .from("table_reservations")
        .update({
          order_id: orderId,
          has_pre_order: true,
        })
        .eq("id", reservationId);

      if (resError) throw resError;

      // Update order with reservation ID
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          is_preorder: true,
          reservation_id: reservationId,
        })
        .eq("id", orderId);

      if (orderError) throw orderError;

      return true;
    } catch (error) {
      console.error("Error linking order to reservation:", error);
      return false;
    }
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!venueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`reservations-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "table_reservations",
          filter: `venue_id=eq.${venueId}`,
        },
        () => {
          fetchReservations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, fetchReservations]);

  return {
    reservations,
    loading,
    fetchReservations,
    createReservation,
    createManualReservation,
    updateReservationStatus,
    markDepositPaid,
    linkOrderToReservation,
  };
}

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import {
  extractVenueFloorplanTables,
  readVenueTablesSync,
  writeVenueTablesSync,
} from "@/lib/venueFloorplanStorage";

export type POSTableSource = "floorplan" | "venue_table" | "local";

export interface POSTableInfo {
  id: string;
  tableNumber: string;
  capacity: number;
  section?: string;
  status: "available" | "occupied" | "reserved";
  source: POSTableSource;
}

interface CheckedInCustomer {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  tableNumber?: string;
  checkedInAt: string;
}

export interface POSTableWithCustomer extends POSTableInfo {
  customer?: CheckedInCustomer;
}

interface CreatePOSTableInput {
  tableNumber: string;
  capacity: number;
  section?: string;
}

interface UpdatePOSTableInput {
  tableNumber?: string;
  capacity?: number;
  section?: string;
  status?: POSTableInfo["status"];
}

interface FloorplanRecord {
  id: string;
  items: unknown;
}

const TABLES_UPDATED_EVENT = "jointvibe:venue-tables-updated";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeTableNumber = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");

const normalizeStatus = (value: unknown): POSTableInfo["status"] => (
  value === "occupied" || value === "reserved" ? value : "available"
);

const toLocalTable = (table: POSTableInfo) => ({
  id: table.id,
  tableNumber: table.tableNumber,
  capacity: table.capacity,
  section: table.section || "Main floor",
  status: table.status,
  source: "manual",
});

const readLocalTables = (venueId: string): POSTableInfo[] => {
  const rawTables = readVenueTablesSync<unknown[]>(venueId);
  if (!Array.isArray(rawTables)) return [];

  return rawTables.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];

    const tableNumber = String(entry.tableNumber ?? entry.number ?? `Table ${index + 1}`).trim();
    if (!tableNumber) return [];

    return [{
      id: String(entry.id || `local-table-${index}-${tableNumber}`),
      tableNumber,
      capacity: Number(entry.capacity) > 0 ? Number(entry.capacity) : 4,
      section: String(entry.section ?? entry.sceneName ?? "Main floor"),
      status: normalizeStatus(entry.status),
      source: "local" as const,
    }];
  });
};

const emitTablesUpdated = (venueId: string) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TABLES_UPDATED_EVENT, { detail: { venueId } }));
};

const asFloorplanItems = (items: unknown): Record<string, unknown> => (
  isRecord(items) ? cloneJson(items) : {}
);

const updateFloorplanTableItems = (
  rawItems: unknown,
  tableId: string,
  updates: UpdatePOSTableInput,
) => {
  const items = asFloorplanItems(rawItems);
  const tables = Array.isArray(items.tables) ? cloneJson(items.tables) : [];

  items.tables = tables.map((entry) => {
    if (!isRecord(entry) || String(entry.id || "") !== tableId) return entry;

    return {
      ...entry,
      ...(updates.tableNumber !== undefined ? { tableNumber: updates.tableNumber } : {}),
      ...(updates.capacity !== undefined ? { capacity: updates.capacity } : {}),
      ...(updates.section !== undefined ? { section: updates.section, sceneName: updates.section } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
    };
  });

  if (Array.isArray(items.scenes)) {
    items.scenes = items.scenes.map((scene) => {
      if (!isRecord(scene) || !Array.isArray(scene.hotspots)) return scene;

      return {
        ...scene,
        hotspots: scene.hotspots.map((hotspot) => {
          if (!isRecord(hotspot) || String(hotspot.id || "") !== tableId || hotspot.type !== "table") return hotspot;

          return {
            ...hotspot,
            ...(updates.tableNumber !== undefined ? { tableNumber: updates.tableNumber, text: `Table ${updates.tableNumber}` } : {}),
            ...(updates.capacity !== undefined ? { capacity: updates.capacity } : {}),
            ...(updates.status !== undefined ? { status: updates.status } : {}),
          };
        }),
      };
    });
  }

  return items;
};

const addFloorplanTableItem = (rawItems: unknown, table: POSTableInfo) => {
  const items = asFloorplanItems(rawItems);
  const tables = Array.isArray(items.tables) ? cloneJson(items.tables) : [];

  tables.push({
    ...toLocalTable(table),
    sceneName: table.section || "Main floor",
  });
  items.tables = tables;
  return items;
};

const removeFloorplanTableItem = (rawItems: unknown, tableId: string) => {
  const items = asFloorplanItems(rawItems);

  if (Array.isArray(items.tables)) {
    items.tables = items.tables.filter((entry) => !isRecord(entry) || String(entry.id || "") !== tableId);
  }

  if (Array.isArray(items.scenes)) {
    items.scenes = items.scenes.map((scene) => {
      if (!isRecord(scene) || !Array.isArray(scene.hotspots)) return scene;

      return {
        ...scene,
        hotspots: scene.hotspots.filter((hotspot) => !isRecord(hotspot) || String(hotspot.id || "") !== tableId),
      };
    });
  }

  return items;
};

export function usePOSTableAvailability(venueId: string | null) {
  const [tables, setTables] = useState<POSTableWithCustomer[]>([]);
  const [checkedInCustomers, setCheckedInCustomers] = useState<CheckedInCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTables = useCallback(async () => {
    if (!venueId) {
      setTables([]);
      setCheckedInCustomers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: floorplan } = await supabase
        .from("floorplans")
        .select("id, items")
        .eq("venue_id", venueId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const floorplanTables = extractVenueFloorplanTables(floorplan?.items).map((table) => ({
        id: table.id,
        tableNumber: table.tableNumber,
        capacity: table.capacity,
        section: table.section || "Main floor",
        status: normalizeStatus(table.status),
        source: "floorplan" as const,
      }));

      let persistedTables: POSTableInfo[] = [];
      if (floorplan?.id) {
        const { data: venueTables } = await supabase
          .from("venue_tables")
          .select("id, table_number, capacity, section, status")
          .eq("floorplan_id", floorplan.id);

        persistedTables = (venueTables || []).map((table) => ({
          id: table.id,
          tableNumber: table.table_number,
          capacity: table.capacity || 4,
          section: table.section || "Main floor",
          status: normalizeStatus(table.status),
          source: "venue_table" as const,
        }));
      }

      const localTables = readLocalTables(venueId);
      const combinedTables = [...floorplanTables];
      const knownIds = new Set(combinedTables.map((table) => table.id));
      const knownNumbers = new Set(combinedTables.map((table) => normalizeTableNumber(table.tableNumber)));

      for (const candidate of [...persistedTables, ...localTables]) {
        const numberKey = normalizeTableNumber(candidate.tableNumber);
        if (knownIds.has(candidate.id) || knownNumbers.has(numberKey)) continue;
        combinedTables.push(candidate);
        knownIds.add(candidate.id);
        knownNumbers.add(numberKey);
      }

      const { data: checkIns } = await supabase
        .from("check_ins")
        .select("id, user_id, table_number, checked_in_at")
        .eq("venue_id", venueId)
        .is("checked_out_at", null);

      const userIds = (checkIns || []).map((checkIn) => checkIn.user_id);
      const customerProfiles: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);

        (profiles || []).forEach((profile) => {
          customerProfiles[profile.user_id] = {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          };
        });
      }

      const checkedIn = (checkIns || []).map((checkIn): CheckedInCustomer => ({
        id: checkIn.id,
        userId: checkIn.user_id,
        displayName: customerProfiles[checkIn.user_id]?.display_name || "Guest",
        avatarUrl: customerProfiles[checkIn.user_id]?.avatar_url || undefined,
        tableNumber: checkIn.table_number || undefined,
        checkedInAt: checkIn.checked_in_at || new Date().toISOString(),
      }));
      setCheckedInCustomers(checkedIn);

      const { data: reservations } = await supabase
        .from("table_reservations")
        .select("id, special_requests, start_time, customer_name")
        .eq("venue_id", venueId)
        .eq("reservation_date", new Date().toISOString().split("T")[0])
        .in("status", ["pending", "confirmed"]);

      const reservedTableNumbers = new Set<string>();
      (reservations || []).forEach((reservation) => {
        const match = reservation.special_requests?.match(/Requested table:\s*(\S+)/i);
        if (match) reservedTableNumbers.add(normalizeTableNumber(match[1]));
      });

      const { data: activeOrders } = await supabase
        .from("orders")
        .select("table_number")
        .eq("venue_id", venueId)
        .in("status", ["pending", "preparing", "ready"])
        .neq("table_number", "Takeaway")
        .neq("table_number", "Delivery");

      const occupiedTableNumbers = new Set<string>();
      (activeOrders || []).forEach((order) => {
        if (order.table_number) occupiedTableNumbers.add(normalizeTableNumber(order.table_number));
      });
      checkedIn.forEach((checkIn) => {
        if (checkIn.tableNumber) occupiedTableNumbers.add(normalizeTableNumber(checkIn.tableNumber));
      });

      setTables(combinedTables.map((table) => {
        const tableNumberKey = normalizeTableNumber(table.tableNumber);
        const customer = checkedIn.find((checkIn) => normalizeTableNumber(checkIn.tableNumber || "") === tableNumberKey);
        const status = occupiedTableNumbers.has(tableNumberKey)
          ? "occupied"
          : reservedTableNumbers.has(tableNumberKey) || table.status === "reserved"
            ? "reserved"
            : table.status;

        return { ...table, status, customer };
      }));
    } catch (error) {
      console.error("Error fetching tables:", error);
      setTables([]);
      setCheckedInCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    if (!venueId || typeof window === "undefined") return;

    const handleTableUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ venueId?: string }>).detail;
      if (detail?.venueId === venueId) void fetchTables();
    };

    window.addEventListener(TABLES_UPDATED_EVENT, handleTableUpdate);
    return () => window.removeEventListener(TABLES_UPDATED_EVENT, handleTableUpdate);
  }, [fetchTables, venueId]);

  useEffect(() => {
    if (!venueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`pos-tables-${venueId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "check_ins", filter: `venue_id=eq.${venueId}` },
        () => void fetchTables(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `venue_id=eq.${venueId}` },
        () => void fetchTables(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "floorplans", filter: `venue_id=eq.${venueId}` },
        () => void fetchTables(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, fetchTables]);

  const getFloorplan = useCallback(async (): Promise<FloorplanRecord | null> => {
    if (!venueId) return null;

    const { data } = await supabase
      .from("floorplans")
      .select("id, items")
      .eq("venue_id", venueId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data ? { id: data.id, items: data.items } : null;
  }, [venueId]);

  const persistLocalTables = useCallback((nextTables: POSTableInfo[]) => {
    if (!venueId) return false;
    return writeVenueTablesSync(venueId, nextTables.map(toLocalTable));
  }, [venueId]);

  const createTable = useCallback(async (input: CreatePOSTableInput): Promise<POSTableInfo | null> => {
    if (!venueId) return null;

    const tableNumber = input.tableNumber.trim();
    const capacity = Math.max(1, Math.min(30, Math.floor(input.capacity)) || 4);
    if (!tableNumber) return null;

    const createdTable: POSTableInfo = {
      id: uuidv4(),
      tableNumber,
      capacity,
      section: input.section?.trim() || "Main floor",
      status: "available",
      source: "floorplan",
    };

    let cloudSaved = false;
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        let floorplan = await getFloorplan();
        if (!floorplan) {
          const newItems = addFloorplanTableItem({}, createdTable);
          const { data, error } = await supabase
            .from("floorplans")
            .insert({
              venue_id: venueId,
              name: "Venue floor plan",
              created_by: auth.user.id,
              items: cloneJson(newItems),
            })
            .select("id, items")
            .single();

          if (error) throw error;
          floorplan = data ? { id: data.id, items: data.items } : null;
        } else {
          const nextItems = addFloorplanTableItem(floorplan.items, createdTable);
          const { error } = await supabase
            .from("floorplans")
            .update({ items: cloneJson(nextItems) })
            .eq("id", floorplan.id);
          if (error) throw error;
        }

        if (floorplan) {
          const { error: venueTableError } = await supabase
            .from("venue_tables")
            .insert({
              id: createdTable.id,
              floorplan_id: floorplan.id,
              table_number: createdTable.tableNumber,
              capacity: createdTable.capacity,
              section: createdTable.section,
              status: createdTable.status,
            });

          if (venueTableError) {
            console.warn("Table was saved to the floorplan but not to venue_tables:", venueTableError.message);
          }
        }

        cloudSaved = true;
      }
    } catch (error) {
      console.error("Failed to create table in cloud:", error);
    }

    const localSaved = persistLocalTables([...tables, createdTable]);
    if (!cloudSaved && !localSaved) return null;

    emitTablesUpdated(venueId);
    await fetchTables();
    return createdTable;
  }, [fetchTables, getFloorplan, persistLocalTables, tables, venueId]);

  const updateTable = useCallback(async (tableId: string, updates: UpdatePOSTableInput) => {
    if (!venueId) return false;

    const table = tables.find((entry) => entry.id === tableId);
    if (!table) return false;

    const normalizedUpdates: UpdatePOSTableInput = {
      ...(updates.tableNumber !== undefined ? { tableNumber: updates.tableNumber.trim() } : {}),
      ...(updates.capacity !== undefined ? { capacity: Math.max(1, Math.min(30, Math.floor(updates.capacity))) } : {}),
      ...(updates.section !== undefined ? { section: updates.section.trim() || "Main floor" } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
    };
    let cloudSaved = false;

    try {
      if (table.source === "venue_table") {
        const { error } = await supabase
          .from("venue_tables")
          .update({
            ...(normalizedUpdates.tableNumber !== undefined ? { table_number: normalizedUpdates.tableNumber } : {}),
            ...(normalizedUpdates.capacity !== undefined ? { capacity: normalizedUpdates.capacity } : {}),
            ...(normalizedUpdates.section !== undefined ? { section: normalizedUpdates.section } : {}),
            ...(normalizedUpdates.status !== undefined ? { status: normalizedUpdates.status } : {}),
          })
          .eq("id", table.id);
        if (error) throw error;
        cloudSaved = true;
      } else {
        const floorplan = await getFloorplan();
        if (floorplan) {
          const nextItems = updateFloorplanTableItems(floorplan.items, table.id, normalizedUpdates);
          const { error } = await supabase
            .from("floorplans")
            .update({ items: cloneJson(nextItems) })
            .eq("id", floorplan.id);
          if (error) throw error;

          await supabase
            .from("venue_tables")
            .update({
              ...(normalizedUpdates.tableNumber !== undefined ? { table_number: normalizedUpdates.tableNumber } : {}),
              ...(normalizedUpdates.capacity !== undefined ? { capacity: normalizedUpdates.capacity } : {}),
              ...(normalizedUpdates.section !== undefined ? { section: normalizedUpdates.section } : {}),
              ...(normalizedUpdates.status !== undefined ? { status: normalizedUpdates.status } : {}),
            })
            .eq("id", table.id);
          cloudSaved = true;
        }
      }
    } catch (error) {
      console.error("Failed to update table in cloud:", error);
    }

    const localSaved = persistLocalTables(tables.map((entry) => entry.id === tableId ? {
      ...entry,
      ...normalizedUpdates,
    } : entry));
    if (!cloudSaved && !localSaved) return false;

    emitTablesUpdated(venueId);
    await fetchTables();
    return true;
  }, [fetchTables, getFloorplan, persistLocalTables, tables, venueId]);

  const deleteTable = useCallback(async (tableId: string) => {
    if (!venueId) return false;

    const table = tables.find((entry) => entry.id === tableId);
    if (!table) return false;

    let cloudSaved = false;
    try {
      if (table.source === "venue_table") {
        const { error } = await supabase.from("venue_tables").delete().eq("id", table.id);
        if (error) throw error;
        cloudSaved = true;
      } else {
        const floorplan = await getFloorplan();
        if (floorplan) {
          const nextItems = removeFloorplanTableItem(floorplan.items, table.id);
          const { error } = await supabase
            .from("floorplans")
            .update({ items: cloneJson(nextItems) })
            .eq("id", floorplan.id);
          if (error) throw error;

          await supabase.from("venue_tables").delete().eq("id", table.id);
          cloudSaved = true;
        }
      }
    } catch (error) {
      console.error("Failed to delete table in cloud:", error);
    }

    const localSaved = persistLocalTables(tables.filter((entry) => entry.id !== tableId));
    if (!cloudSaved && !localSaved) return false;

    emitTablesUpdated(venueId);
    await fetchTables();
    return true;
  }, [fetchTables, getFloorplan, persistLocalTables, tables, venueId]);

  const availableTables = tables.filter((table) => table.status === "available");
  const occupiedTables = tables.filter((table) => table.status === "occupied");
  const reservedTables = tables.filter((table) => table.status === "reserved");

  return {
    tables,
    availableTables,
    occupiedTables,
    reservedTables,
    checkedInCustomers,
    loading,
    refresh: fetchTables,
    createTable,
    updateTable,
    deleteTable,
  };
}

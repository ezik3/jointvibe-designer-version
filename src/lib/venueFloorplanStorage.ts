const FLOORPLAN_360_KEY = "venue_floorplan_360";
const TABLES_SYNC_KEY = "venue_tables_sync";
const FLOORPLAN_KEY = "venue_floorplan";
const PENDING_VENUE_KEY = "pending";

export interface VenueFloorplanTable {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string | null;
  status: string;
}

const getVenueKey = (key: string, venueId: string | null | undefined) =>
  `${key}:${encodeURIComponent(venueId?.trim() || PENDING_VENUE_KEY)}`;

const readJson = <T>(key: string): T | null => {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = <T>(key: string, value: T) => {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Local persistence is a fallback; the caller still saves to Supabase when available.
    return false;
  }
};

const remove = (key: string) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage access failures.
  }
};

const readVenueValue = <T>(key: string, venueId: string | null | undefined): T | null => {
  const scopedKey = getVenueKey(key, venueId);
  const stored = readJson<T>(scopedKey);
  if (stored !== null) return stored;

  const normalizedVenueId = venueId?.trim();
  if (normalizedVenueId) {
    const pendingKey = getVenueKey(key, null);
    const pending = readJson<T>(pendingKey);
    if (pending !== null) {
      if (writeJson(scopedKey, pending)) {
        remove(pendingKey);
      }
      return pending;
    }
  }

  const legacy = readJson<T>(key);
  if (legacy !== null) {
    if (writeJson(scopedKey, legacy)) {
      remove(key);
    }
  }

  return legacy;
};

const writeVenueValue = <T>(key: string, venueId: string | null | undefined, value: T) => {
  return writeJson(getVenueKey(key, venueId), value);
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const normalizeTable = (
  value: unknown,
  index: number,
  section: string | null = null,
): VenueFloorplanTable | null => {
  const table = asRecord(value);
  if (!table) return null;

  const rawNumber = table.tableNumber ?? table.number ?? table.table_number ?? table.text ?? index + 1;
  const tableNumber = String(rawNumber).trim() || String(index + 1);
  const rawId = table.id;
  const resolvedSection = section
    ?? (typeof table.sceneName === "string" ? table.sceneName : null)
    ?? (typeof table.section === "string" ? table.section : null);

  return {
    id: typeof rawId === "string" && rawId.trim()
      ? rawId
      : `local-table-${resolvedSection ?? "venue"}-${index}-${tableNumber}`,
    tableNumber,
    capacity: typeof table.capacity === "number" && table.capacity > 0 ? table.capacity : 4,
    section: resolvedSection,
    status: typeof table.status === "string" ? table.status : "available",
  };
};

/** Extracts the saved tables whether a tour stores a flat table list or scene hotspots. */
export const extractVenueFloorplanTables = (floorplan: unknown): VenueFloorplanTable[] => {
  const savedFloorplan = asRecord(floorplan);
  if (!savedFloorplan) return [];

  if (Array.isArray(savedFloorplan.tables) && savedFloorplan.tables.length > 0) {
    return savedFloorplan.tables.flatMap((table, index) => {
      const normalized = normalizeTable(table, index);
      return normalized ? [normalized] : [];
    });
  }

  if (!Array.isArray(savedFloorplan.scenes)) return [];

  return savedFloorplan.scenes.flatMap((scene, sceneIndex) => {
    const savedScene = asRecord(scene);
    if (!savedScene || !Array.isArray(savedScene.hotspots)) return [];

    const section = typeof savedScene.name === "string" ? savedScene.name : null;
    return savedScene.hotspots.flatMap((hotspot, hotspotIndex) => {
      const savedHotspot = asRecord(hotspot);
      if (!savedHotspot || savedHotspot.type !== "table") return [];

      const normalized = normalizeTable(savedHotspot, sceneIndex * 1000 + hotspotIndex, section);
      return normalized ? [normalized] : [];
    });
  });
};

export const readVenueFloorplan360 = <T>(venueId: string | null | undefined) =>
  readVenueValue<T>(FLOORPLAN_360_KEY, venueId);

export const writeVenueFloorplan360 = <T>(venueId: string | null | undefined, value: T) =>
  writeVenueValue(FLOORPLAN_360_KEY, venueId, value);

export const readVenueTablesSync = <T>(venueId: string | null | undefined) =>
  readVenueValue<T>(TABLES_SYNC_KEY, venueId);

export const writeVenueTablesSync = <T>(venueId: string | null | undefined, value: T) =>
  writeVenueValue(TABLES_SYNC_KEY, venueId, value);

export const readVenueFloorplan = <T>(venueId: string | null | undefined) =>
  readVenueValue<T>(FLOORPLAN_KEY, venueId);

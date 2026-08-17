/**
 * Driver Job Filtering — Phase 1.5
 *
 * Tier-based radius filtering + smart time-based escalation.
 * Pure functions only. No side effects, no React, no Supabase.
 *
 * Distance model:
 *   We approximate real travel distance by applying a 1.3× multiplier
 *   to straight-line haversine distance. (Roughly matches urban routing.)
 *   If a Mapbox route distance is later available per-job, callers can pass
 *   it in via `routeKmOverride` to bypass the multiplier.
 */

export type DriverMode = 'car' | 'motorcycle' | 'bicycle' | 'runner';

const ROUTE_MULTIPLIER = 1.3;
const MAX_ESCALATION_RADIUS_KM = 50;

// Tier base radii (km) — driver-side: how far a driver of this tier
// will accept jobs from. Updated per spec (no gaps):
//   runner:     0   – 0.5
//   bicycle:    0.5 – 3
//   motorcycle: 3   – 10
//   car:        3   – 20
const TIER_MAX_RADIUS_KM: Record<DriverMode, number> = {
  runner: 0.5,
  bicycle: 3,
  motorcycle: 10,
  car: 20,
};

// Job tier classification by route distance (km).
// Determines which tier of driver this job is "naturally" for.
export function getJobTier(routeKm: number): DriverMode {
  if (routeKm <= 0.5) return 'runner';
  if (routeKm <= 3) return 'bicycle';
  if (routeKm <= 10) return 'motorcycle';
  return 'car';
}

// Escalation order: who gets the job as time passes.
// 0–2 min  → only matching tier
// 2–3 min  → + next tier up
// 3–5 min  → all tiers
// 5+ min   → all tiers, expanded radius up to 50 km
const TIER_ORDER: DriverMode[] = ['runner', 'bicycle', 'motorcycle', 'car'];

export function getEligibleModes(jobTier: DriverMode, ageMinutes: number): DriverMode[] {
  if (ageMinutes >= 3) return [...TIER_ORDER]; // all tiers
  const baseIdx = TIER_ORDER.indexOf(jobTier);
  if (ageMinutes >= 2) {
    // matching tier + next tier up (one step toward 'car')
    const nextIdx = Math.min(baseIdx + 1, TIER_ORDER.length - 1);
    return Array.from(new Set([jobTier, TIER_ORDER[nextIdx]]));
  }
  return [jobTier];
}

/**
 * Maximum acceptance radius (km) for a driver given their selected modes
 * and the job's age (escalation expands the radius once age ≥ 5 min).
 */
export function getDriverMaxRadiusKm(driverModes: DriverMode[], ageMinutes: number): number {
  if (!driverModes.length) return 0;
  const base = Math.max(...driverModes.map((m) => TIER_MAX_RADIUS_KM[m] ?? 0));
  if (ageMinutes >= 5) return MAX_ESCALATION_RADIUS_KM;
  return base;
}

// Haversine distance in km
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function approxRouteKm(straightLineKm: number): number {
  return straightLineKm * ROUTE_MULTIPLIER;
}

export interface FilterableJob {
  id: string;
  created_at: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  /** Optional: real route distance in km (e.g. from Mapbox) overrides haversine×1.3 */
  routeKmOverride?: number;
  /** Force tier (e.g. rides are always treated as 'car') */
  forceTier?: DriverMode;
}

export interface FilteredJob<T> {
  job: T;
  pickupDistanceKm: number;
  ageMinutes: number;
  jobTier: DriverMode;
}

/**
 * Filter a list of jobs to those visible to a driver, sorted by pickup distance ASC.
 *
 * Safe-fallback: if driver has no location, returns all jobs unfiltered (so we never
 * silently hide jobs from a driver with location off). Caller should surface a hint.
 */
export function filterAndSortJobs<T extends FilterableJob>(
  jobs: T[],
  driverLat: number | null | undefined,
  driverLng: number | null | undefined,
  driverModes: DriverMode[],
  now: Date = new Date(),
): FilteredJob<T>[] {
  // No driver location → return jobs as-is (preserve current behavior).
  if (driverLat == null || driverLng == null || !driverModes.length) {
    return jobs.map((j) => ({
      job: j,
      pickupDistanceKm: 0,
      ageMinutes: 0,
      jobTier: 'car',
    }));
  }

  const result: FilteredJob<T>[] = [];

  for (const job of jobs) {
    const ageMinutes = (now.getTime() - new Date(job.created_at).getTime()) / 60000;

    // Determine job tier
    let jobTier: DriverMode;
    if (job.forceTier) {
      jobTier = job.forceTier;
    } else if (
      job.pickup_latitude != null &&
      job.pickup_longitude != null &&
      (job.delivery_latitude != null || job.destination_latitude != null) &&
      (job.delivery_longitude != null || job.destination_longitude != null)
    ) {
      const dropLat = (job.delivery_latitude ?? job.destination_latitude)!;
      const dropLng = (job.delivery_longitude ?? job.destination_longitude)!;
      const routeKm =
        job.routeKmOverride ??
        approxRouteKm(
          haversineKm(job.pickup_latitude!, job.pickup_longitude!, dropLat, dropLng),
        );
      jobTier = getJobTier(routeKm);
    } else {
      // Missing coords: treat as 'car' tier; only visible after universal phase (≥3 min)
      jobTier = 'car';
    }

    // Eligibility by tier × age
    const eligible = getEligibleModes(jobTier, ageMinutes);
    const driverEligible = driverModes.some((m) => eligible.includes(m));
    if (!driverEligible) continue;

    // Pickup distance check
    let pickupDistanceKm = Infinity;
    if (job.pickup_latitude != null && job.pickup_longitude != null) {
      const straight = haversineKm(
        driverLat,
        driverLng,
        job.pickup_latitude,
        job.pickup_longitude,
      );
      pickupDistanceKm = approxRouteKm(straight);
    } else if (ageMinutes < 3) {
      // No pickup coords and not yet in universal phase → skip
      continue;
    } else {
      pickupDistanceKm = 0; // unknown distance, allow in universal phase
    }

    const maxRadius = getDriverMaxRadiusKm(driverModes, ageMinutes);
    if (pickupDistanceKm > maxRadius) continue;

    result.push({ job, pickupDistanceKm, ageMinutes, jobTier });
  }

  result.sort((a, b) => a.pickupDistanceKm - b.pickupDistanceKm);
  return result;
}

/**
 * Resolve driver modes from a profile, falling back to legacy `vehicle_type`
 * if the new `vehicle_modes` array is empty.
 */
export function resolveDriverModes(profile: {
  vehicle_modes?: string[] | null;
  vehicle_type?: string | null;
}): DriverMode[] {
  const valid: DriverMode[] = ['car', 'motorcycle', 'bicycle', 'runner'];
  const fromArray = (profile.vehicle_modes ?? []).filter((m): m is DriverMode =>
    (valid as string[]).includes(m),
  );
  if (fromArray.length) return fromArray;
  const legacy = profile.vehicle_type;
  if (legacy && (valid as string[]).includes(legacy)) return [legacy as DriverMode];
  return [];
}

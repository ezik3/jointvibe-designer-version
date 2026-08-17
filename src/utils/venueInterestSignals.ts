import { supabase } from "@/integrations/supabase/client";

export type VenueIntentSignalType = "heading_there" | "maybe_going";
export type VenuePostIntentType =
  | "currently_at"
  | "heading_there"
  | "maybe_going"
  | "mention_only";

export interface VenueCheckInPresence {
  isCheckedIn: boolean;
  visibility: "public" | "private" | null;
}

const DEFAULT_COOLDOWN_MS = 2000;
const lastWriteByKey = new Map<string, number>();

export async function isUserCurrentlyCheckedInAtVenue(userId: string, venueId: string): Promise<boolean> {
  const status = await getUserCheckInPresenceAtVenue(userId, venueId);
  return status.isCheckedIn && status.visibility === "public";
}

export async function getUserCheckInPresenceAtVenue(
  userId: string,
  venueId: string,
): Promise<VenueCheckInPresence> {
  const { data, error } = await supabase
    .from("check_ins")
    .select("id, visibility")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .is("checked_out_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return { isCheckedIn: false, visibility: null };
  }

  return {
    isCheckedIn: true,
    visibility: data.visibility === "public" ? "public" : "private",
  };
}

export async function upsertUserVenueIntentSignal(params: {
  userId: string;
  venueId: string;
  signalType: VenueIntentSignalType;
  source?: "manual" | "post" | "system";
  cooldownMs?: number;
}): Promise<{ status: "inserted" | "updated" | "skipped_cooldown" | "unchanged" }> {
  const {
    userId,
    venueId,
    signalType,
    source = "manual",
    cooldownMs = DEFAULT_COOLDOWN_MS,
  } = params;

  const nowMs = Date.now();
  const key = `${userId}:${venueId}`;
  const lastWriteAt = lastWriteByKey.get(key) || 0;
  if (nowMs - lastWriteAt < cooldownMs) {
    return { status: "skipped_cooldown" };
  }

  const idempotencyKey = `${venueId}:${signalType}:${Math.floor(nowMs / Math.max(cooldownMs, 1000))}`;
  const { data, error } = await (supabase as any).rpc("set_user_venue_intent_signal", {
    p_venue_id: venueId,
    p_signal_type: signalType,
    p_source: source,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const status = row?.result_status as "inserted" | "updated" | "skipped_cooldown" | "unchanged" | undefined;
  if (!status) {
    throw new Error("Failed to set venue intent signal");
  }

  lastWriteByKey.set(key, nowMs);
  return { status };
}

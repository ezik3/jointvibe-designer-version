import { supabase } from "@/integrations/supabase/client";

export type VenueInsideProofSource =
  | "pos_order"
  | "payment_request"
  | "venue_transaction"
  | "service_order"
  | "manual_ops";

export type VenueInsideProofConfidenceLevel = "supporting" | "strong";

export interface RecordVenueInsideProofParams {
  venueId: string;
  userId: string;
  proofSource: VenueInsideProofSource;
  confidenceLevel?: VenueInsideProofConfidenceLevel;
  confidenceScore?: number;
  sourceTable?: string | null;
  sourceRecordId?: string | null;
  eventAt?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export async function recordVenueInsideProofEvent(params: RecordVenueInsideProofParams) {
  const { data, error } = await (supabase as any).rpc("record_venue_inside_proof_event", {
    p_venue_id: params.venueId,
    p_user_id: params.userId,
    p_proof_source: params.proofSource,
    p_confidence_level: params.confidenceLevel ?? "strong",
    p_confidence_score: params.confidenceScore ?? 80,
    p_source_table: params.sourceTable ?? null,
    p_source_record_id: params.sourceRecordId ?? null,
    p_event_at: params.eventAt ?? new Date().toISOString(),
    p_metadata: params.metadata ?? {},
    p_idempotency_key:
      params.idempotencyKey ??
      `${params.venueId}:${params.userId}:${params.proofSource}:${Math.floor(Date.now() / 5000)}`,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function getVenuePatronInsideProofSummary(venueId: string, userId: string) {
  const { data, error } = await (supabase as any).rpc("get_venue_patron_inside_proof_summary", {
    p_venue_id: venueId,
    p_user_id: userId,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

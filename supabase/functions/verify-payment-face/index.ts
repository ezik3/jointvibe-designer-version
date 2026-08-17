import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── AWS Signing helpers (copied from verify-identity/index.ts) ──────────────

function sanitizeEnvVar(value: string | undefined, varName: string): string {
  if (!value) return '';
  let sanitized = value.trim();
  if (sanitized.includes('=')) {
    const parts = sanitized.split('=');
    sanitized = parts[parts.length - 1].trim();
  }
  if (sanitized.includes(' ') || sanitized.includes('=')) {
    throw new Error(`Invalid ${varName}: contains spaces or "=".`);
  }
  return sanitized;
}

async function signAWSRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | ArrayBuffer,
  service: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Record<string, string>> {
  const encoder = new TextEncoder();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const headersToSign: Record<string, string> = { ...headers, 'x-amz-date': amzDate };

  const getSignatureKey = async (key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> => {
    const kDate = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", encoder.encode("AWS4" + key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), encoder.encode(dateStamp));
    const kRegion = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", kDate, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), encoder.encode(regionName));
    const kService = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", kRegion, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), encoder.encode(serviceName));
    return await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", kService, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), encoder.encode("aws4_request"));
  };

  const sha256 = async (data: string | ArrayBuffer): Promise<string> => {
    const buffer = typeof data === 'string' ? encoder.encode(data) : data;
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const parsedUrl = new URL(url);
  const canonicalUri = parsedUrl.pathname || '/';
  const canonicalQuerystring = parsedUrl.search.slice(1);
  const payloadHash = await sha256(body);

  const signedHeadersList = Object.keys(headersToSign).map(k => k.toLowerCase()).sort();
  const signedHeadersStr = signedHeadersList.join(';');
  const canonicalHeaders = signedHeadersList
    .map(k => `${k}:${headersToSign[Object.keys(headersToSign).find(key => key.toLowerCase() === k)!].trim()}`)
    .join('\n') + '\n';

  const canonicalRequest = [method, canonicalUri, canonicalQuerystring, canonicalHeaders, signedHeadersStr, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256(canonicalRequest)].join('\n');
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  
  const hmacKey = await crypto.subtle.importKey("raw", signingKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(stringToSign));
  const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    ...headersToSign,
    'authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`
  };
}

// ── Rekognition API calls ───────────────────────────────────────────────────

async function callRekognition(
  action: string,
  requestBody: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<any> {
  const url = `https://rekognition.${region}.amazonaws.com/`;
  const payloadHash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody))
  )).map(b => b.toString(16).padStart(2, '0')).join('');

  const headers: Record<string, string> = {
    'host': `rekognition.${region}.amazonaws.com`,
    'content-type': 'application/x-amz-json-1.1',
    'x-amz-target': `RekognitionService.${action}`,
    'x-amz-content-sha256': payloadHash,
  };

  const signedHeaders = await signAWSRequest('POST', url, headers, requestBody, 'rekognition', region, accessKeyId, secretAccessKey);
  const response = await fetch(url, { method: 'POST', headers: signedHeaders, body: requestBody });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Rekognition ${action} error:`, errText);
    throw new Error(`Rekognition ${action} failed: ${response.status}`);
  }
  return response.json();
}

function calculateLivenessScore(face: any): number {
  let score = 0;
  score += ((face.Confidence || 0) / 100) * 0.30;
  score += (face.EyesOpen?.Value ? (face.EyesOpen.Confidence / 100) : 0) * 0.25;
  score += (face.FaceOccluded?.Value === false ? (face.FaceOccluded.Confidence / 100) : 0.3) * 0.25;
  const quality = face.Quality ? ((face.Quality.Brightness || 50) / 100 + (face.Quality.Sharpness || 50) / 100) / 2 : 0.5;
  score += quality * 0.20;
  return score;
}

async function logVerification(
  supabase: any, userId: string, amount: number | null, method: string,
  success: boolean, reason: string | null, deviceId: string | null,
  faceScore: number | null, livenessScore: number | null, req: Request
) {
  await supabase.from("payment_verification_log").insert({
    user_id: userId,
    transaction_amount: amount,
    verification_method: method,
    face_match_score: faceScore,
    liveness_score: livenessScore,
    success,
    failure_reason: reason,
    device_id: deviceId,
    ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
  });
}

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Not authenticated");

    const { selfie_base64, transaction_amount, device_id } = await req.json();
    if (!selfie_base64) throw new Error("Selfie image required");

    // Get security settings
    const { data: settings } = await supabase
      .from("payment_security_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!settings || !settings.face_enabled) {
      return new Response(
        JSON.stringify({ error: "face_not_enabled", message: "Facial recognition is not enabled." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Trusted device check — skip face for small amounts
    if (device_id && Array.isArray(settings.trusted_devices)) {
      const trustedDevice = settings.trusted_devices.find((d: any) => d.device_id === device_id && d.trusted_at);
      if (trustedDevice && settings.face_threshold !== "every") {
        const threshold = settings.face_threshold === "over_50" ? 50 : settings.face_threshold === "over_100" ? 100 : 0;
        if (transaction_amount < threshold) {
          return new Response(
            JSON.stringify({ success: true, verified: true, method: "trusted_device", skipped_face: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Get reference selfie
    let referenceSelfieUrl = settings.enrolled_selfie_url;
    if (!referenceSelfieUrl) {
      const { data: verification } = await supabase
        .from("user_verification")
        .select("selfie_url")
        .eq("user_id", user.id)
        .single();
      referenceSelfieUrl = verification?.selfie_url;
    }

    if (!referenceSelfieUrl) {
      return new Response(
        JSON.stringify({ error: "no_reference", message: "No reference selfie found. Please enroll your face in security settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // AWS credentials
    const region = sanitizeEnvVar(Deno.env.get("AWS_REGION"), "AWS_REGION") || "ap-southeast-2";
    const accessKeyId = sanitizeEnvVar(Deno.env.get("AWS_ACCESS_KEY_ID"), "AWS_ACCESS_KEY_ID");
    const secretAccessKey = sanitizeEnvVar(Deno.env.get("AWS_SECRET_ACCESS_KEY"), "AWS_SECRET_ACCESS_KEY");

    if (!accessKeyId || !secretAccessKey) throw new Error("AWS credentials not configured");

    // Download reference selfie
    const refResponse = await fetch(referenceSelfieUrl);
    if (!refResponse.ok) throw new Error("Failed to download reference selfie");
    const refBuffer = await refResponse.arrayBuffer();
    const refBase64 = btoa(String.fromCharCode(...new Uint8Array(refBuffer)));

    // Step 1: Liveness check via DetectFaces
    const detectBody = JSON.stringify({
      Image: { Bytes: selfie_base64 },
      Attributes: ["ALL"],
    });

    const detectData = await callRekognition("DetectFaces", detectBody, region, accessKeyId, secretAccessKey);

    if (!detectData.FaceDetails || detectData.FaceDetails.length === 0) {
      await logVerification(supabase, user.id, transaction_amount, "face", false, "no_face_detected", device_id, null, null, req);
      return new Response(
        JSON.stringify({ error: "no_face", message: "No face detected. Please try again in better lighting." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (detectData.FaceDetails.length > 1) {
      await logVerification(supabase, user.id, transaction_amount, "face", false, "multiple_faces", device_id, null, null, req);
      return new Response(
        JSON.stringify({ error: "multiple_faces", message: "Multiple faces detected. Please ensure only your face is visible." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const face = detectData.FaceDetails[0];
    const livenessScore = calculateLivenessScore(face);

    if (livenessScore < 0.70) {
      await logVerification(supabase, user.id, transaction_amount, "face", false, "liveness_failed", device_id, null, livenessScore, req);
      return new Response(
        JSON.stringify({ error: "liveness_failed", message: "Liveness check failed. Please look directly at the camera with your eyes open." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Compare faces
    const compareBody = JSON.stringify({
      SourceImage: { Bytes: selfie_base64 },
      TargetImage: { Bytes: refBase64 },
      SimilarityThreshold: 80,
    });

    const compareData = await callRekognition("CompareFaces", compareBody, region, accessKeyId, secretAccessKey);
    const matchScore = compareData.FaceMatches?.[0]?.Similarity || 0;

    if (matchScore < 85) {
      await logVerification(supabase, user.id, transaction_amount, "face", false, `match_score_${matchScore.toFixed(1)}`, device_id, matchScore, livenessScore, req);
      return new Response(
        JSON.stringify({ error: "face_mismatch", message: "Face doesn't match. Please try again or use your PIN instead.", score: matchScore }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SUCCESS — update stats and trusted devices
    const updatedTrustedDevices = [...(settings.trusted_devices || [])];
    if (device_id) {
      const existingIdx = updatedTrustedDevices.findIndex((d: any) => d.device_id === device_id);
      if (existingIdx >= 0) {
        updatedTrustedDevices[existingIdx].successful_verifications = (updatedTrustedDevices[existingIdx].successful_verifications || 0) + 1;
        if (updatedTrustedDevices[existingIdx].successful_verifications >= 3 && !updatedTrustedDevices[existingIdx].trusted_at) {
          updatedTrustedDevices[existingIdx].trusted_at = new Date().toISOString();
        }
      } else {
        updatedTrustedDevices.push({
          device_id,
          device_name: "Unknown Device",
          successful_verifications: 1,
          first_seen: new Date().toISOString(),
          trusted_at: null,
        });
      }
    }

    await supabase
      .from("payment_security_settings")
      .update({
        last_verification_method: "face",
        last_verification_at: new Date().toISOString(),
        total_face_verifications: (settings.total_face_verifications || 0) + 1,
        trusted_devices: updatedTrustedDevices,
      })
      .eq("user_id", user.id);

    await logVerification(supabase, user.id, transaction_amount, "face", true, null, device_id, matchScore, livenessScore, req);

    return new Response(
      JSON.stringify({ success: true, verified: true, method: "face", match_score: matchScore, liveness_score: livenessScore }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Payment face verification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

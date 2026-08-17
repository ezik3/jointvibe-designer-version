import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Sanitize AWS environment variables
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

// AWS Signature V4 signing — copied from verify-identity/index.ts
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

  const getSignatureKey = async (key: string, ds: string, rn: string, sn: string): Promise<ArrayBuffer> => {
    const kDate = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", encoder.encode("AWS4" + key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), encoder.encode(ds));
    const kRegion = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", kDate, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), encoder.encode(rn));
    const kService = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", kRegion, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), encoder.encode(sn));
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
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", signingKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), encoder.encode(stringToSign))))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    ...headersToSign,
    'authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { face_image_base64, action, venue_id } = await req.json();

    // === ENROLLMENT ACTION ===
    if (action === 'enroll') {
      if (!face_image_base64 || !venue_id) {
        return new Response(JSON.stringify({ error: 'Face image and venue_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check employee exists
      const { data: employee, error: empError } = await supabaseAdmin
        .from('employee_venue_links')
        .select('id, venue_id')
        .eq('user_id', user.id)
        .eq('venue_id', venue_id)
        .eq('is_active', true)
        .maybeSingle();

      if (empError || !employee) {
        return new Response(JSON.stringify({ error: 'Employee not found or inactive' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Upload reference face to storage
      const refKey = `${user.id}/reference.jpg`;
      const imageBytes = Uint8Array.from(atob(face_image_base64.replace(/^data:image\/\w+;base64,/, '')), c => c.charCodeAt(0));

      const { error: uploadError } = await supabaseAdmin.storage
        .from('employee-faces')
        .upload(refKey, imageBytes, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        console.error('Face upload error:', uploadError);
        return new Response(JSON.stringify({ error: 'Failed to upload face photo' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Update employee record
      await supabaseAdmin
        .from('employee_venue_links')
        .update({
          face_reference_key: refKey,
          face_enrolled_at: new Date().toISOString(),
          face_enrollment_status: 'enrolled'
        })
        .eq('id', employee.id);

      return new Response(JSON.stringify({ success: true, message: 'Face enrolled successfully' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VERIFY ACTION (default) ===
    if (!face_image_base64) {
      return new Response(JSON.stringify({ error: 'Face image required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Look up employee record using authenticated user ID
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employee_venue_links')
      .select('id, venue_id, face_reference_key, face_enrollment_status')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (empError || !employee) {
      return new Response(JSON.stringify({ error: 'Employee not found or inactive' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (employee.face_enrollment_status !== 'enrolled' || !employee.face_reference_key) {
      return new Response(JSON.stringify({ error: 'Face not enrolled. Please complete face enrollment first.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Download reference face from storage
    const { data: refImageData, error: storageError } = await supabaseAdmin.storage
      .from('employee-faces')
      .download(employee.face_reference_key);

    if (storageError || !refImageData) {
      return new Response(JSON.stringify({ error: 'Reference face not found' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const refImageBytes = new Uint8Array(await refImageData.arrayBuffer());
    const cleanBase64 = face_image_base64.replace(/^data:image\/\w+;base64,/, '');
    const liveImageBytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));

    // 4. Call AWS Rekognition CompareFaces
    const region = sanitizeEnvVar(Deno.env.get('AWS_REGION'), 'AWS_REGION') || 'us-east-1';
    const accessKeyId = sanitizeEnvVar(Deno.env.get('AWS_ACCESS_KEY_ID'), 'AWS_ACCESS_KEY_ID');
    const secretAccessKey = sanitizeEnvVar(Deno.env.get('AWS_SECRET_ACCESS_KEY'), 'AWS_SECRET_ACCESS_KEY');

    if (!accessKeyId || !secretAccessKey) {
      return new Response(JSON.stringify({ error: 'AWS credentials not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Encode both images to base64 for Rekognition Bytes mode
    const refBase64 = btoa(String.fromCharCode(...refImageBytes));
    const liveBase64 = btoa(String.fromCharCode(...liveImageBytes));

    const rekognitionPayload = JSON.stringify({
      SourceImage: { Bytes: refBase64 },
      TargetImage: { Bytes: liveBase64 },
      SimilarityThreshold: 90
    });

    const rekUrl = `https://rekognition.${region}.amazonaws.com/`;
    const payloadHash = Array.from(new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rekognitionPayload))
    )).map(b => b.toString(16).padStart(2, '0')).join('');

    const rekHeaders: Record<string, string> = {
      'host': `rekognition.${region}.amazonaws.com`,
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'RekognitionService.CompareFaces',
      'x-amz-content-sha256': payloadHash
    };

    const signedHeaders = await signAWSRequest(
      'POST', rekUrl, rekHeaders, rekognitionPayload, 'rekognition', region, accessKeyId, secretAccessKey
    );

    const rekResponse = await fetch(rekUrl, {
      method: 'POST',
      headers: signedHeaders,
      body: rekognitionPayload
    });

    const rekResult = await rekResponse.json();

    if (!rekResponse.ok) {
      console.error('Rekognition error:', rekResult);
      await supabaseAdmin.from('employee_face_auth_log').insert({
        employee_id: employee.id,
        venue_id: employee.venue_id,
        success: false,
        confidence_score: 0,
        failure_reason: `Rekognition API error: ${rekResponse.status}`
      });
      return new Response(JSON.stringify({ success: false, error: 'Face verification service error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. Parse result
    const topMatch = rekResult.FaceMatches?.[0];
    const confidence = topMatch?.Similarity || 0;
    const isMatch = confidence >= 90;

    // 6. Log the attempt
    await supabaseAdmin.from('employee_face_auth_log').insert({
      employee_id: employee.id,
      venue_id: employee.venue_id,
      success: isMatch,
      confidence_score: confidence,
      failure_reason: isMatch ? null : (confidence > 0 ? `Low confidence: ${confidence.toFixed(1)}%` : 'No face match found')
    });

    if (!isMatch) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Face verification failed',
        confidence
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 7. Return verification token (5-minute expiry)
    const verificationToken = crypto.randomUUID();

    // Clean expired tokens first
    await supabaseAdmin
      .from('employee_verification_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString());

    await supabaseAdmin.from('employee_verification_tokens').insert({
      employee_id: employee.id,
      token: verificationToken,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      used: false
    });

    return new Response(JSON.stringify({
      success: true,
      confidence,
      verification_token: verificationToken
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Employee face verification error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

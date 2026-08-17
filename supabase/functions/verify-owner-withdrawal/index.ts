import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

// AWS Signature V4 signing — copied from verify-employee-face/index.ts
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { action, venue_id, pin, face_image_base64, withdrawal_amount } = body;

    // ============= SETUP PIN ACTION =============
    if (action === 'setup_pin') {
      if (!venue_id || !pin || pin.length !== 6) {
        return new Response(JSON.stringify({ error: 'venue_id and 6-digit PIN required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Verify ownership
      const { data: venue } = await supabaseAdmin.from('venues').select('owner_user_id').eq('id', venue_id).single();
      if (!venue || venue.owner_user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Not the venue owner' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Hash PIN
      const salt = crypto.randomUUID();
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pin + salt));
      const pinHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      await supabaseAdmin.from('venue_owner_security').upsert({
        venue_id,
        owner_id: user.id,
        pin_hash: pinHash,
        pin_salt: salt,
        pin_failed_attempts: 0,
        pin_locked_until: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'venue_id,owner_id' });

      return new Response(JSON.stringify({ success: true, message: 'Withdrawal PIN set' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= ENROLL FACE ACTION =============
    if (action === 'enroll_face') {
      if (!venue_id || !face_image_base64) {
        return new Response(JSON.stringify({ error: 'venue_id and face image required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: venue } = await supabaseAdmin.from('venues').select('owner_user_id').eq('id', venue_id).single();
      if (!venue || venue.owner_user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Not the venue owner' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const refKey = `owners/${user.id}/reference.jpg`;
      const cleanBase64 = face_image_base64.replace(/^data:image\/\w+;base64,/, '');
      const imageBytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabaseAdmin.storage
        .from('employee-faces')
        .upload(refKey, imageBytes, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        return new Response(JSON.stringify({ error: 'Failed to upload face photo' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await supabaseAdmin.from('venue_owner_security').upsert({
        venue_id,
        owner_id: user.id,
        face_reference_key: refKey,
        face_enrolled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'venue_id,owner_id' });

      return new Response(JSON.stringify({ success: true, message: 'Face enrolled for withdrawals' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= VERIFY WITHDRAWAL (default action) =============
    if (!venue_id || !withdrawal_amount) {
      return new Response(JSON.stringify({ error: 'venue_id and withdrawal_amount required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (withdrawal_amount <= 0) {
      return new Response(JSON.stringify({ error: 'Withdrawal amount must be positive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify ownership
    const { data: venue, error: venueError } = await supabaseAdmin
      .from('venues').select('id, owner_user_id, name').eq('id', venue_id).single();

    if (venueError || !venue) {
      return new Response(JSON.stringify({ error: 'Venue not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (venue.owner_user_id !== user.id) {
      await supabaseAdmin.from('venue_withdrawal_audit').insert({
        venue_id, owner_id: user.id, amount: withdrawal_amount,
        verification_method: 'none', verification_passed: false,
        failure_reason: 'Not the venue owner'
      });
      return new Response(JSON.stringify({ error: 'Only the venue owner can withdraw funds' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get or create security settings
    let { data: security } = await supabaseAdmin
      .from('venue_owner_security')
      .select('*')
      .eq('venue_id', venue_id)
      .eq('owner_id', user.id)
      .single();

    if (!security) {
      const { data: newSecurity } = await supabaseAdmin
        .from('venue_owner_security')
        .insert({ venue_id, owner_id: user.id })
        .select()
        .single();
      security = newSecurity;
    }

    if (!security) {
      return new Response(JSON.stringify({ error: 'Failed to initialize security settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === FIRST WITHDRAWAL — MINIMUM ORDER REQUIREMENT ===
    const { count: previousWithdrawalCount } = await supabaseAdmin
      .from('withdrawal_records')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', venue_id)
      .in('status', ['completed', 'processing']);

    const isFirstWithdrawal = (previousWithdrawalCount || 0) === 0;

    if (isFirstWithdrawal) {
      const { count: completedOrderCount } = await supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venue_id)
        .eq('status', 'completed');

      const orderCount = completedOrderCount || 0;

      if (orderCount < 20) {
        await supabaseAdmin.from('venue_withdrawal_audit').insert({
          venue_id,
          owner_id: user.id,
          amount: withdrawal_amount,
          verification_method: 'threshold_check',
          verification_passed: false,
          failure_reason: `First withdrawal blocked: ${orderCount}/20 orders completed`
        });

        return new Response(JSON.stringify({
          error: `Your venue must complete at least 20 orders before your first withdrawal. You currently have ${orderCount} completed orders.`,
          orders_completed: orderCount,
          orders_required: 20,
          is_first_withdrawal: true
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Check PIN lockout
    if (security.pin_locked_until && new Date(security.pin_locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(security.pin_locked_until).getTime() - Date.now()) / 60000);
      await supabaseAdmin.from('venue_withdrawal_audit').insert({
        venue_id, owner_id: user.id, amount: withdrawal_amount,
        verification_method: 'pin', verification_passed: false,
        failure_reason: `Account locked (${minutesLeft} min remaining)`
      });
      return new Response(JSON.stringify({
        error: `Account locked. Try again in ${minutesLeft} minutes.`, locked: true
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check daily withdrawal limit
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dailyWithdrawals } = await supabaseAdmin
      .from('withdrawal_records')
      .select('amount_jvc')
      .eq('venue_id', venue_id)
      .in('status', ['completed', 'approved_automatically', 'approved', 'pending'])
      .gte('created_at', oneDayAgo);

    const dailyTotal = dailyWithdrawals?.reduce((sum, w) => sum + (w.amount_jvc || 0), 0) || 0;

    if (dailyTotal + withdrawal_amount > (security.withdrawal_daily_limit || 10000)) {
      await supabaseAdmin.from('venue_withdrawal_audit').insert({
        venue_id, owner_id: user.id, amount: withdrawal_amount,
        verification_method: 'limit_check', verification_passed: false,
        failure_reason: `Daily limit exceeded: $${dailyTotal} used + $${withdrawal_amount} > $${security.withdrawal_daily_limit}`
      });
      return new Response(JSON.stringify({
        error: `Daily withdrawal limit of $${security.withdrawal_daily_limit} exceeded`,
        daily_used: dailyTotal, daily_limit: security.withdrawal_daily_limit
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check per-transaction limit
    if (withdrawal_amount > (security.withdrawal_per_tx_limit || 5000)) {
      await supabaseAdmin.from('venue_withdrawal_audit').insert({
        venue_id, owner_id: user.id, amount: withdrawal_amount,
        verification_method: 'limit_check', verification_passed: false,
        failure_reason: `Per-tx limit: $${withdrawal_amount} > $${security.withdrawal_per_tx_limit}`
      });
      return new Response(JSON.stringify({
        error: `Maximum withdrawal per transaction is $${security.withdrawal_per_tx_limit}`,
        per_tx_limit: security.withdrawal_per_tx_limit
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify PIN (if set)
    if (security.pin_hash) {
      if (!pin) {
        const needsFace = security.require_face_for_withdrawal &&
          withdrawal_amount >= (security.face_threshold_amount || 0) &&
          security.face_reference_key;
        return new Response(JSON.stringify({
          error: 'PIN required for withdrawal',
          requires_pin: true,
          requires_face: !!needsFace
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pin + (security.pin_salt || '')));
      const pinHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      if (pinHash !== security.pin_hash) {
        const newAttempts = (security.pin_failed_attempts || 0) + 1;
        const updates: Record<string, unknown> = {
          pin_failed_attempts: newAttempts,
          updated_at: new Date().toISOString()
        };

        if (newAttempts >= 5) {
          updates.pin_locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          updates.pin_failed_attempts = 0;
        }

        await supabaseAdmin.from('venue_owner_security').update(updates).eq('id', security.id);

        await supabaseAdmin.from('venue_withdrawal_audit').insert({
          venue_id, owner_id: user.id, amount: withdrawal_amount,
          verification_method: 'pin', verification_passed: false,
          failure_reason: newAttempts >= 5 ? 'PIN locked after 5 attempts' : `Invalid PIN (attempt ${newAttempts}/5)`
        });

        return new Response(JSON.stringify({
          error: newAttempts >= 5 ? 'Too many failed attempts. Account locked for 30 minutes.' : 'Invalid PIN',
          attempts_remaining: Math.max(0, 5 - newAttempts),
          locked: newAttempts >= 5
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // PIN correct — reset failed attempts
      await supabaseAdmin.from('venue_owner_security')
        .update({ pin_failed_attempts: 0, updated_at: new Date().toISOString() })
        .eq('id', security.id);
    } else {
      // No PIN set yet — require PIN setup first
      return new Response(JSON.stringify({
        error: 'Please set up a withdrawal PIN first',
        requires_pin_setup: true
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify Face ID (if required and amount >= threshold)
    const needsFace = security.require_face_for_withdrawal &&
      withdrawal_amount >= (security.face_threshold_amount || 0) &&
      security.face_reference_key;

    if (needsFace) {
      if (!face_image_base64) {
        return new Response(JSON.stringify({
          error: `Face verification required for withdrawals above $${security.face_threshold_amount}`,
          requires_face: true, pin_verified: true
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: refImageData, error: storageError } = await supabaseAdmin.storage
        .from('employee-faces')
        .download(security.face_reference_key);

      if (storageError || !refImageData) {
        return new Response(JSON.stringify({ error: 'Reference face not found. Please re-enroll.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const region = sanitizeEnvVar(Deno.env.get('AWS_REGION'), 'AWS_REGION') || 'us-east-1';
      const accessKeyId = sanitizeEnvVar(Deno.env.get('AWS_ACCESS_KEY_ID'), 'AWS_ACCESS_KEY_ID');
      const secretAccessKey = sanitizeEnvVar(Deno.env.get('AWS_SECRET_ACCESS_KEY'), 'AWS_SECRET_ACCESS_KEY');

      if (!accessKeyId || !secretAccessKey) {
        return new Response(JSON.stringify({ error: 'AWS credentials not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const refImageBytes = new Uint8Array(await refImageData.arrayBuffer());
      const refBase64 = btoa(String.fromCharCode(...refImageBytes));
      const cleanLiveBase64 = face_image_base64.replace(/^data:image\/\w+;base64,/, '');

      const rekognitionPayload = JSON.stringify({
        SourceImage: { Bytes: refBase64 },
        TargetImage: { Bytes: cleanLiveBase64 },
        SimilarityThreshold: 92
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
        method: 'POST', headers: signedHeaders, body: rekognitionPayload
      });

      const rekResult = await rekResponse.json();

      if (!rekResponse.ok) {
        console.error('Rekognition error:', rekResult);
        await supabaseAdmin.from('venue_withdrawal_audit').insert({
          venue_id, owner_id: user.id, amount: withdrawal_amount,
          verification_method: 'face', verification_passed: false,
          failure_reason: `Rekognition API error: ${rekResponse.status}`
        });
        return new Response(JSON.stringify({ success: false, error: 'Face verification service error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const topMatch = rekResult.FaceMatches?.[0];
      const confidence = topMatch?.Similarity || 0;
      const isMatch = confidence >= 92;

      if (!isMatch) {
        await supabaseAdmin.from('venue_withdrawal_audit').insert({
          venue_id, owner_id: user.id, amount: withdrawal_amount,
          verification_method: 'face', verification_passed: false,
          failure_reason: confidence > 0 ? `Low confidence: ${confidence.toFixed(1)}%` : 'No face match found'
        });
        return new Response(JSON.stringify({
          success: false, error: 'Face verification failed', confidence
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // All verification passed — generate single-use token
    const authorizationToken = crypto.randomUUID();
    const tokenExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabaseAdmin.from('venue_withdrawal_audit').insert({
      venue_id, owner_id: user.id, amount: withdrawal_amount,
      verification_method: needsFace ? 'pin_and_face' : 'pin',
      verification_passed: true
    });

    await supabaseAdmin.rpc('store_withdrawal_token', {
      p_token: authorizationToken,
      p_venue_id: venue_id,
      p_owner_id: user.id,
      p_amount: withdrawal_amount,
      p_expires_at: tokenExpiry
    });

    return new Response(JSON.stringify({
      success: true,
      authorization_token: authorizationToken,
      expires_at: tokenExpiry,
      verified_amount: withdrawal_amount
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Withdrawal verification error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * AWS Rekognition Identity Verification Edge Function
 * 
 * This function handles:
 * 1. Upload images to S3
 * 2. Face matching (compare selfie to ID photo) via Rekognition
 * 3. Liveness detection (ensure real person)
 * 
 * Required secrets:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION
 * - AWS_S3_BUCKET
 */

// Sanitize AWS environment variables - handle malformed secrets like "AWS_REGION = ap-southeast-2"
function sanitizeEnvVar(value: string | undefined, varName: string): string {
  if (!value) return '';
  
  // Trim whitespace
  let sanitized = value.trim();
  
  // If it contains "=", extract only the value after "="
  if (sanitized.includes('=')) {
    const parts = sanitized.split('=');
    sanitized = parts[parts.length - 1].trim();
    console.warn(`[WARN] ${varName} contained "=" - extracted value: ${sanitized}`);
  }
  
  // Reject if still contains invalid characters for AWS config
  if (sanitized.includes(' ') || sanitized.includes('=')) {
    throw new Error(`Invalid ${varName}: contains spaces or "=". Please set the secret to just the value (e.g., "ap-southeast-2" not "AWS_REGION = ap-southeast-2")`);
  }
  
  return sanitized;
}

interface VerifyIdentityRequest {
  user_id: string;
  document_front_url: string;
  document_back_url?: string;
  selfie_url: string;
  document_type: 'drivers_license' | 'passport' | 'age_card';
  extracted_name?: string;
  extracted_dob?: string;
}

interface FaceMatchResult {
  match: boolean;
  confidence: number;
  error?: string;
}

// AWS Signature V4 signing - FIXED: x-amz-date must be in headers BEFORE signing
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
  
  // Generate timestamp FIRST
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  
  // Add x-amz-date to headers BEFORE signing (this is the critical fix)
  const headersToSign: Record<string, string> = {
    ...headers,
    'x-amz-date': amzDate
  };
  
  const getSignatureKey = async (key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> => {
    const kDate = await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey("raw", encoder.encode("AWS4" + key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      encoder.encode(dateStamp)
    );
    const kRegion = await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey("raw", kDate, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      encoder.encode(regionName)
    );
    const kService = await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey("raw", kRegion, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      encoder.encode(serviceName)
    );
    const kSigning = await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey("raw", kService, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      encoder.encode("aws4_request")
    );
    return kSigning;
  };

  const sha256 = async (data: string | ArrayBuffer): Promise<string> => {
    const buffer = typeof data === 'string' ? encoder.encode(data) : data;
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const hmacSha256 = async (key: ArrayBuffer, data: string): Promise<ArrayBuffer> => {
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  };
  
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const canonicalUri = parsedUrl.pathname || '/';
  const canonicalQuerystring = parsedUrl.search.slice(1);
  
  const payloadHash = await sha256(body);
  
  // Build signed headers list from headersToSign (which includes x-amz-date)
  const signedHeadersList = Object.keys(headersToSign).map(k => k.toLowerCase()).sort();
  const signedHeadersStr = signedHeadersList.join(';');
  
  // Build canonical headers in sorted order
  const canonicalHeaders = signedHeadersList
    .map(k => `${k}:${headersToSign[Object.keys(headersToSign).find(key => key.toLowerCase() === k)!].trim()}`)
    .join('\n') + '\n';
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeadersStr,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256(canonicalRequest)
  ].join('\n');

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = Array.from(new Uint8Array(await hmacSha256(signingKey, stringToSign)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  // Debug logging (safe - no secrets)
  console.log(`[AWS SigV4] Service: ${service}, Region: ${region}, SignedHeaders: ${signedHeadersStr}`);

  // Return all headers including x-amz-date (already in headersToSign) plus authorization
  return {
    ...headersToSign,
    'authorization': authorizationHeader
  };
}

// Upload image to S3
async function uploadToS3(
  imageData: ArrayBuffer,
  key: string,
  contentType: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<string> {
  // Use virtual-hosted style URL: https://{bucket}.s3.{region}.amazonaws.com/{key}
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const url = `https://${host}/${key}`;
  
  console.log(`[S3 Upload] Region: ${region}, Bucket: ${bucket}, Key: ${key}`);
  console.log(`[S3 Upload] URL: ${url}`);
  
  const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", imageData)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Headers to sign - must match EXACTLY what we send
  const headers: Record<string, string> = {
    'host': host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash
  };

  const signedHeaders = await signAWSRequest(
    'PUT', url, headers, imageData, 's3', region, accessKeyId, secretAccessKey
  );
  
  console.log(`[S3 Upload] Sending request with headers:`, Object.keys(signedHeaders).join(', '));

  const response = await fetch(url, {
    method: 'PUT',
    headers: signedHeaders,
    body: imageData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`S3 upload failed: ${error}`);
  }

  return key;
}

// Download image from URL
async function downloadImage(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  return response.arrayBuffer();
}

// Compare faces using AWS Rekognition
async function compareFaces(
  sourceKey: string,
  targetKey: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<FaceMatchResult> {
  const url = `https://rekognition.${region}.amazonaws.com/`;
  
  const requestBody = JSON.stringify({
    SourceImage: {
      S3Object: {
        Bucket: bucket,
        Name: sourceKey
      }
    },
    TargetImage: {
      S3Object: {
        Bucket: bucket,
        Name: targetKey
      }
    },
    SimilarityThreshold: 80
  });

  const payloadHash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody))
  )).map(b => b.toString(16).padStart(2, '0')).join('');

  const headers: Record<string, string> = {
    'host': `rekognition.${region}.amazonaws.com`,
    'content-type': 'application/x-amz-json-1.1',
    'x-amz-target': 'RekognitionService.CompareFaces',
    'x-amz-content-sha256': payloadHash
  };

  const signedHeaders = await signAWSRequest(
    'POST', url, headers, requestBody, 'rekognition', region, accessKeyId, secretAccessKey
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: signedHeaders,
    body: requestBody
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Rekognition error:', error);
    return { match: false, confidence: 0, error: `Rekognition API error: ${response.status}` };
  }

  const result = await response.json();
  
  if (result.FaceMatches && result.FaceMatches.length > 0) {
    const bestMatch = result.FaceMatches[0];
    return {
      match: bestMatch.Similarity >= 85,
      confidence: bestMatch.Similarity / 100
    };
  }

  return { 
    match: false, 
    confidence: 0,
    error: result.UnmatchedFaces?.length > 0 ? 'Faces do not match' : 'No face detected in one or both images'
  };
}

// Detect faces and check for liveness indicators
async function detectFaces(
  imageKey: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{ isLive: boolean; score: number; faceCount: number }> {
  const url = `https://rekognition.${region}.amazonaws.com/`;
  
  const requestBody = JSON.stringify({
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: imageKey
      }
    },
    Attributes: ['ALL']
  });

  const payloadHash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody))
  )).map(b => b.toString(16).padStart(2, '0')).join('');

  const headers: Record<string, string> = {
    'host': `rekognition.${region}.amazonaws.com`,
    'content-type': 'application/x-amz-json-1.1',
    'x-amz-target': 'RekognitionService.DetectFaces',
    'x-amz-content-sha256': payloadHash
  };

  const signedHeaders = await signAWSRequest(
    'POST', url, headers, requestBody, 'rekognition', region, accessKeyId, secretAccessKey
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: signedHeaders,
    body: requestBody
  });

  if (!response.ok) {
    console.error('DetectFaces error:', await response.text());
    return { isLive: false, score: 0, faceCount: 0 };
  }

  const result = await response.json();
  
  if (!result.FaceDetails || result.FaceDetails.length === 0) {
    return { isLive: false, score: 0, faceCount: 0 };
  }

  const face = result.FaceDetails[0];
  
  // Liveness heuristics based on face quality and attributes
  const confidence = face.Confidence || 0;
  const eyesOpen = face.EyesOpen?.Value ? (face.EyesOpen.Confidence || 0) : 0;
  const faceOccluded = face.FaceOccluded?.Value ? 100 - (face.FaceOccluded.Confidence || 0) : 100;
  const quality = ((face.Quality?.Brightness || 50) + (face.Quality?.Sharpness || 50)) / 2;
  
  // Combined liveness score (normalized 0-1)
  const livenessScore = (
    (confidence / 100) * 0.3 +
    (eyesOpen / 100) * 0.25 +
    (faceOccluded / 100) * 0.25 +
    (quality / 100) * 0.2
  );

  return {
    isLive: livenessScore >= 0.7 && result.FaceDetails.length === 1,
    score: livenessScore,
    faceCount: result.FaceDetails.length
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get and sanitize AWS credentials from environment
    const rawAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const rawSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const rawRegion = Deno.env.get('AWS_REGION');
    const rawBucket = Deno.env.get('AWS_S3_BUCKET');

    let accessKeyId: string;
    let secretAccessKey: string;
    let region: string;
    let bucket: string;

    try {
      accessKeyId = sanitizeEnvVar(rawAccessKeyId, 'AWS_ACCESS_KEY_ID');
      secretAccessKey = sanitizeEnvVar(rawSecretAccessKey, 'AWS_SECRET_ACCESS_KEY');
      region = sanitizeEnvVar(rawRegion, 'AWS_REGION') || 'ap-southeast-2';
      bucket = sanitizeEnvVar(rawBucket, 'AWS_S3_BUCKET');
    } catch (sanitizeError) {
      console.error('Secret sanitization error:', sanitizeError);
      return new Response(JSON.stringify({ 
        error: sanitizeError instanceof Error ? sanitizeError.message : 'Invalid AWS secrets format',
        details: 'Please ensure secrets are just the values, not KEY=VALUE format'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[verify-identity] Using AWS region: ${region}, bucket: ${bucket}`);

    if (!accessKeyId || !secretAccessKey || !bucket) {
      console.error('Missing AWS credentials');
      return new Response(JSON.stringify({ 
        error: 'AWS credentials not configured',
        details: 'Please configure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: VerifyIdentityRequest = await req.json();

    // SECURITY: Always use authenticated user ID, never from request body
    const userId = user.id;

    // Validate request
    if (!body.document_front_url || !body.selfie_url || !body.document_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting verification for user ${userId}`);

    // Step 1: Download images from Supabase storage URLs
    console.log('Downloading ID document...');
    const idImageData = await downloadImage(body.document_front_url);
    
    console.log('Downloading selfie...');
    const selfieImageData = await downloadImage(body.selfie_url);

    // Step 2: Upload to S3 for Rekognition processing
    const timestamp = Date.now();
    const idS3Key = `verification/${userId}/id_${timestamp}.jpg`;
    const selfieS3Key = `verification/${userId}/selfie_${timestamp}.jpg`;

    console.log('Uploading ID to S3...');
    await uploadToS3(idImageData, idS3Key, 'image/jpeg', bucket, region, accessKeyId, secretAccessKey);
    
    console.log('Uploading selfie to S3...');
    await uploadToS3(selfieImageData, selfieS3Key, 'image/jpeg', bucket, region, accessKeyId, secretAccessKey);

    // Step 3: Detect faces in selfie (liveness check)
    console.log('Running liveness detection...');
    const livenessResult = await detectFaces(selfieS3Key, bucket, region, accessKeyId, secretAccessKey);
    console.log('Liveness result:', livenessResult);

    // Step 4: Compare faces
    console.log('Comparing faces...');
    const faceMatchResult = await compareFaces(idS3Key, selfieS3Key, bucket, region, accessKeyId, secretAccessKey);
    console.log('Face match result:', faceMatchResult);

    // Calculate age from provided DOB (if available)
    let age: number | null = null;
    let is_18_plus = false;
    let is_21_plus = false;

    if (body.extracted_dob) {
      const dob = new Date(body.extracted_dob);
      const today = new Date();
      age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      is_18_plus = age >= 18;
      is_21_plus = age >= 21;
    }

    // Determine verification status
    const isVerified = faceMatchResult.match && 
                       faceMatchResult.confidence >= 0.85 && 
                       livenessResult.isLive &&
                       livenessResult.score >= 0.70;

    // Update user_verification record
    const { error: updateError } = await supabase
      .from('user_verification')
      .update({
        extracted_name: body.extracted_name || null,
        extracted_dob: body.extracted_dob || null,
        verified_age: age,
        face_match_confidence: faceMatchResult.confidence,
        liveness_score: livenessResult.score,
        document_status: isVerified ? 'verified' : 'rejected',
        face_status: faceMatchResult.match ? 'verified' : 'rejected',
        overall_status: isVerified ? 'verified' : 'rejected',
        is_age_verified: isVerified && age !== null,
        is_18_plus: is_18_plus && isVerified,
        is_21_plus: is_21_plus && isVerified,
        verified_at: isVerified ? new Date().toISOString() : null,
        rejected_at: !isVerified ? new Date().toISOString() : null,
        rejection_reason: !isVerified 
          ? (!faceMatchResult.match 
              ? faceMatchResult.error || 'Face does not match ID document' 
              : !livenessResult.isLive 
                ? livenessResult.faceCount === 0 
                  ? 'No face detected in selfie'
                  : livenessResult.faceCount > 1
                    ? 'Multiple faces detected in selfie'
                    : 'Liveness check failed - please take a clear photo'
                : 'Verification confidence too low')
          : null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update verification status' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Verification complete for user ${userId}: ${isVerified ? 'VERIFIED' : 'REJECTED'}`);

    return new Response(JSON.stringify({
      success: true,
      verified: isVerified,
      extracted_name: body.extracted_name,
      extracted_dob: body.extracted_dob,
      verified_age: age,
      is_18_plus: is_18_plus && isVerified,
      is_21_plus: is_21_plus && isVerified,
      face_match_confidence: faceMatchResult.confidence,
      liveness_score: livenessResult.score,
      message: isVerified 
        ? 'Identity verified successfully' 
        : faceMatchResult.error || 'Verification failed - please try again with clearer photos'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Verification error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

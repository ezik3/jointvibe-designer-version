import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * AWS Textract ID Document OCR Verification
 * 
 * Extracts: full_name, date_of_birth, document_number, expiry_date, country, doc_type
 * Computes: is_18_plus, is_21_plus from DOB
 * Returns: approved / needs_review / failed
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

interface VerifyIdDocumentRequest {
  user_id: string;
  document_front_url: string;
  document_back_url?: string;
  document_type: 'drivers_license' | 'passport' | 'age_card';
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

// Use AWS Textract AnalyzeID for ID document analysis
async function analyzeIdDocument(
  s3Key: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{
  fullName?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  documentNumber?: string;
  expiryDate?: string;
  issueDate?: string;
  country?: string;
  address?: string;
  gender?: string;
  confidence: number;
  rawText: string;
  rawBlocks: any[];
}> {
  const url = `https://textract.${region}.amazonaws.com/`;
  
  const requestBody = JSON.stringify({
    DocumentPages: [{
      S3Object: {
        Bucket: bucket,
        Name: s3Key
      }
    }]
  });

  const payloadHash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody))
  )).map(b => b.toString(16).padStart(2, '0')).join('');

  const headers: Record<string, string> = {
    'host': `textract.${region}.amazonaws.com`,
    'content-type': 'application/x-amz-json-1.1',
    'x-amz-target': 'Textract.AnalyzeID',
    'x-amz-content-sha256': payloadHash
  };

  const signedHeaders = await signAWSRequest(
    'POST', url, headers, requestBody, 'textract', region, accessKeyId, secretAccessKey
  );

  console.log('Calling Textract AnalyzeID...');
  const textractController = new AbortController();
  const textractTimeout = setTimeout(() => textractController.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: signedHeaders,
      body: requestBody,
      signal: textractController.signal,
    });
  } catch (abortErr: any) {
    clearTimeout(textractTimeout);
    if (abortErr.name === 'AbortError') {
      console.warn('Textract AnalyzeID timed out after 15s, falling back to DetectText...');
      return await detectTextFallback(s3Key, bucket, region, accessKeyId, secretAccessKey);
    }
    throw abortErr;
  }
  clearTimeout(textractTimeout);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Textract AnalyzeID error:', response.status, errorText);
    
    // Fallback to DetectText if AnalyzeID fails
    console.log('Falling back to DetectText...');
    return await detectTextFallback(s3Key, bucket, region, accessKeyId, secretAccessKey);
  }

  const result = await response.json();
  console.log('Textract AnalyzeID response:', JSON.stringify(result, null, 2));

  // Parse AnalyzeID response
  const extractedFields: Record<string, { value: string; confidence: number }> = {};
  let totalConfidence = 0;
  let fieldCount = 0;

  if (result.IdentityDocuments) {
    for (const doc of result.IdentityDocuments) {
      if (doc.IdentityDocumentFields) {
        for (const field of doc.IdentityDocumentFields) {
          const fieldType = field.Type?.Text;
          const fieldValue = field.ValueDetection?.Text;
          const confidence = field.ValueDetection?.Confidence || 0;
          
          if (fieldType && fieldValue) {
            extractedFields[fieldType] = { value: fieldValue, confidence };
            totalConfidence += confidence;
            fieldCount++;
          }
        }
      }
    }
  }

  const avgConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0;

  // Map common field names
  const firstName = extractedFields['FIRST_NAME']?.value || extractedFields['GIVEN_NAMES']?.value || '';
  const lastName = extractedFields['LAST_NAME']?.value || extractedFields['SURNAME']?.value || '';
  const fullName = extractedFields['FULL_NAME']?.value || 
                   (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName);

  return {
    fullName,
    firstName,
    lastName,
    dateOfBirth: extractedFields['DATE_OF_BIRTH']?.value || extractedFields['DOB']?.value,
    documentNumber: extractedFields['DOCUMENT_NUMBER']?.value || extractedFields['ID_NUMBER']?.value || extractedFields['LICENSE_NUMBER']?.value,
    expiryDate: extractedFields['EXPIRATION_DATE']?.value || extractedFields['EXPIRY_DATE']?.value,
    issueDate: extractedFields['DATE_OF_ISSUE']?.value || extractedFields['ISSUE_DATE']?.value,
    country: extractedFields['COUNTRY']?.value || extractedFields['NATIONALITY']?.value || extractedFields['PLACE_OF_BIRTH']?.value,
    address: extractedFields['ADDRESS']?.value,
    gender: extractedFields['SEX']?.value || extractedFields['GENDER']?.value,
    confidence: avgConfidence / 100,
    rawText: Object.entries(extractedFields).map(([k, v]) => `${k}: ${v.value}`).join('\n'),
    rawBlocks: result.IdentityDocuments || []
  };
}

// Fallback: Use DetectText for basic OCR if AnalyzeID fails
async function detectTextFallback(
  s3Key: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{
  fullName?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  documentNumber?: string;
  expiryDate?: string;
  issueDate?: string;
  country?: string;
  address?: string;
  gender?: string;
  confidence: number;
  rawText: string;
  rawBlocks: any[];
}> {
  // Use Rekognition DetectText as fallback
  const url = `https://rekognition.${region}.amazonaws.com/`;
  
  const requestBody = JSON.stringify({
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: s3Key
      }
    }
  });

  const payloadHash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody))
  )).map(b => b.toString(16).padStart(2, '0')).join('');

  const headers: Record<string, string> = {
    'host': `rekognition.${region}.amazonaws.com`,
    'content-type': 'application/x-amz-json-1.1',
    'x-amz-target': 'RekognitionService.DetectText',
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
    console.error('DetectText error:', await response.text());
    return { confidence: 0, rawText: '', rawBlocks: [] };
  }

  const result = await response.json();
  const textDetections = result.TextDetections || [];
  
  // Extract all detected text
  const lines = textDetections
    .filter((t: any) => t.Type === 'LINE')
    .map((t: any) => t.DetectedText);
  
  const rawText = lines.join('\n');
  const avgConfidence = textDetections.length > 0 
    ? textDetections.reduce((sum: number, t: any) => sum + (t.Confidence || 0), 0) / textDetections.length / 100
    : 0;

  // Try to extract date of birth using common patterns
  const datePatterns = [
    /DOB[:\s]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /DATE OF BIRTH[:\s]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /BIRTH[:\s]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/
  ];

  let dateOfBirth: string | undefined;
  for (const pattern of datePatterns) {
    const match = rawText.match(pattern);
    if (match) {
      dateOfBirth = match[1];
      break;
    }
  }

  // Try to extract document number
  const docNumPatterns = [
    /LICENSE[:\s#]*([A-Z0-9]+)/i,
    /DL[:\s#]*([A-Z0-9]+)/i,
    /ID[:\s#]*([A-Z0-9]+)/i,
    /NO[:\s.]*([A-Z0-9]{6,})/i
  ];

  let documentNumber: string | undefined;
  for (const pattern of docNumPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      documentNumber = match[1];
      break;
    }
  }

  return {
    dateOfBirth,
    documentNumber,
    confidence: avgConfidence,
    rawText,
    rawBlocks: textDetections
  };
}

// Parse date string to Date object
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  
  // Common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY
  const patterns = [
    { regex: /^(\d{4})-(\d{2})-(\d{2})$/, format: 'YYYY-MM-DD' },
    { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, format: 'DD/MM/YYYY' },
    { regex: /^(\d{2})-(\d{2})-(\d{4})$/, format: 'DD-MM-YYYY' },
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/, format: 'flexible' }
  ];

  for (const { regex, format } of patterns) {
    const match = dateStr.match(regex);
    if (match) {
      let year: number, month: number, day: number;
      
      if (format === 'YYYY-MM-DD') {
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[3]);
      } else if (format === 'DD/MM/YYYY' || format === 'DD-MM-YYYY') {
        day = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        year = parseInt(match[3]);
      } else {
        // Flexible - assume DD/MM/YYYY for non-US
        day = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        year = parseInt(match[3]);
        if (year < 100) year += 2000;
      }

      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // Try native Date parsing as last resort
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Calculate age from date of birth
function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const rawSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const rawRegion = Deno.env.get('AWS_REGION');
    const rawBucket = Deno.env.get('AWS_S3_BUCKET');

    // Sanitize env vars to handle malformed secrets
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
        status: 'failed'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log sanitized values (not secrets)
    console.log(`[verify-id-document] Using AWS region: ${region}, bucket: ${bucket}`);

    if (!accessKeyId || !secretAccessKey || !bucket) {
      return new Response(JSON.stringify({ 
        error: 'AWS credentials not configured',
        status: 'failed'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization', status: 'failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', status: 'failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: VerifyIdDocumentRequest = await req.json();

    if (!body.document_front_url || !body.document_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields', status: 'failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting ID document verification for user ${body.user_id}`);

    // Download and upload front image to S3
    console.log('Downloading front image...');
    const frontImageData = await downloadImage(body.document_front_url);
    
    const timestamp = Date.now();
    const frontS3Key = `id-verification/${body.user_id}/front_${timestamp}.jpg`;
    
    console.log('Uploading front image to S3...');
    await uploadToS3(frontImageData, frontS3Key, 'image/jpeg', bucket, region, accessKeyId, secretAccessKey);

    // Run Textract OCR
    console.log('Running Textract AnalyzeID...');
    const ocrResult = await analyzeIdDocument(frontS3Key, bucket, region, accessKeyId, secretAccessKey);
    console.log('OCR Result:', ocrResult);

    // If back image provided, process it too
    let backOcrResult = null;
    if (body.document_back_url) {
      console.log('Processing back image...');
      const backImageData = await downloadImage(body.document_back_url);
      const backS3Key = `id-verification/${body.user_id}/back_${timestamp}.jpg`;
      await uploadToS3(backImageData, backS3Key, 'image/jpeg', bucket, region, accessKeyId, secretAccessKey);
      backOcrResult = await analyzeIdDocument(backS3Key, bucket, region, accessKeyId, secretAccessKey);
      
      // Merge back results into main result (back often has address, barcode data)
      if (backOcrResult.address && !ocrResult.address) ocrResult.address = backOcrResult.address;
      if (backOcrResult.documentNumber && !ocrResult.documentNumber) ocrResult.documentNumber = backOcrResult.documentNumber;
    }

    // Parse and calculate age
    const dob = parseDate(ocrResult.dateOfBirth);
    let age: number | null = null;
    let is18Plus = false;
    let is21Plus = false;
    let isExpired = false;

    if (dob) {
      age = calculateAge(dob);
      is18Plus = age >= 18;
      is21Plus = age >= 21;
    }

    // Check expiry
    const expiryDate = parseDate(ocrResult.expiryDate);
    if (expiryDate) {
      isExpired = expiryDate < new Date();
    }

    // Determine status
    let status: 'approved' | 'needs_review' | 'failed';
    let failureReason: string | null = null;

    if (ocrResult.confidence < 0.5) {
      status = 'failed';
      failureReason = 'Could not read document clearly. Please upload a clearer image.';
    } else if (!dob) {
      status = 'needs_review';
      failureReason = 'Could not extract date of birth. Manual review required.';
    } else if (isExpired) {
      status = 'failed';
      failureReason = 'Document has expired. Please upload a valid, non-expired ID.';
    } else if (ocrResult.confidence < 0.75) {
      status = 'needs_review';
      failureReason = 'Low confidence extraction. Manual review required.';
    } else {
      status = 'approved';
    }

    // Save to verification_documents table
    const { error: insertError } = await supabase
      .from('verification_documents')
      .insert({
        user_id: body.user_id,
        document_type: body.document_type,
        document_side: 'front',
        storage_url: body.document_front_url,
        s3_key: frontS3Key,
        extracted_full_name: ocrResult.fullName,
        extracted_first_name: ocrResult.firstName,
        extracted_last_name: ocrResult.lastName,
        extracted_date_of_birth: dob?.toISOString().split('T')[0],
        extracted_document_number: ocrResult.documentNumber,
        extracted_expiry_date: expiryDate?.toISOString().split('T')[0],
        extracted_issue_date: parseDate(ocrResult.issueDate)?.toISOString().split('T')[0],
        extracted_country: ocrResult.country,
        extracted_address: ocrResult.address,
        extracted_gender: ocrResult.gender,
        overall_confidence: ocrResult.confidence,
        raw_ocr_text: ocrResult.rawText,
        raw_ocr_blocks: ocrResult.rawBlocks,
        is_expired: isExpired,
        computed_age: age,
        is_18_plus: is18Plus,
        is_21_plus: is21Plus,
        status,
        failure_reason: failureReason
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
    }

    // Update user_verification table with extracted data
    if (status === 'approved') {
      const { error: updateError } = await supabase
        .from('user_verification')
        .update({
          extracted_name: ocrResult.fullName,
          extracted_dob: dob?.toISOString().split('T')[0],
          verified_age: age,
          is_age_verified: true,
          is_18_plus: is18Plus,
          is_21_plus: is21Plus,
          document_status: 'verified',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', body.user_id);

      if (updateError) {
        console.error('user_verification update error:', updateError);
      }
    }

    console.log(`ID verification complete: ${status}`);

    return new Response(JSON.stringify({
      success: true,
      status,
      extracted: {
        full_name: ocrResult.fullName,
        first_name: ocrResult.firstName,
        last_name: ocrResult.lastName,
        date_of_birth: ocrResult.dateOfBirth,
        document_number: ocrResult.documentNumber,
        expiry_date: ocrResult.expiryDate,
        country: ocrResult.country,
        address: ocrResult.address,
        gender: ocrResult.gender
      },
      computed: {
        age,
        is_18_plus: is18Plus,
        is_21_plus: is21Plus,
        is_expired: isExpired
      },
      confidence: ocrResult.confidence,
      failure_reason: failureReason,
      message: status === 'approved' 
        ? 'ID document verified successfully'
        : status === 'needs_review'
          ? 'Document requires manual review'
          : failureReason || 'Verification failed'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('ID verification error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Verification failed';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      status: 'failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

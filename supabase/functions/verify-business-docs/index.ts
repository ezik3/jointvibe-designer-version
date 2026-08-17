import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * AWS Textract Business Document Verification
 * 
 * Verifies utility bills, business registrations, liquor licenses, etc.
 * Extracts: business_name, address, issue_date, doc_type
 * Compares to venue profile for address/name matching
 * Returns: approved / needs_review / rejected
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

interface VerifyBusinessDocsRequest {
  venue_id: string;
  document_url: string;
  document_type: 'utility_bill' | 'business_registration' | 'liquor_license' | 'lease_agreement' | 'tax_certificate';
}

// AWS Signature V4 signing (same as verify-id-document)
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

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  
  const parsedUrl = new URL(url);
  const canonicalUri = parsedUrl.pathname || '/';
  const canonicalQuerystring = parsedUrl.search.slice(1);
  
  const payloadHash = await sha256(body);
  
  const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
  const canonicalHeaders = Object.entries(headers)
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
    .sort()
    .join('\n') + '\n';
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
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

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    'x-amz-date': amzDate,
    'authorization': authorizationHeader
  };
}

// Upload to S3
async function uploadToS3(
  imageData: ArrayBuffer,
  key: string,
  contentType: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<string> {
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  
  const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", imageData)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  
  const headers: Record<string, string> = {
    'host': `${bucket}.s3.${region}.amazonaws.com`,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash
  };

  const signedHeaders = await signAWSRequest(
    'PUT', url, headers, imageData, 's3', region, accessKeyId, secretAccessKey
  );

  const response = await fetch(url, {
    method: 'PUT',
    headers: signedHeaders,
    body: imageData
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed: ${await response.text()}`);
  }

  return key;
}

// Download image
async function downloadImage(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  return response.arrayBuffer();
}

// Use Textract AnalyzeDocument for general document analysis
async function analyzeDocument(
  s3Key: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{
  businessName?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  issueDate?: string;
  expiryDate?: string;
  documentNumber?: string;
  accountNumber?: string;
  confidence: number;
  rawText: string;
  rawBlocks: any[];
}> {
  const url = `https://textract.${region}.amazonaws.com/`;
  
  // Use AnalyzeDocument with FORMS and TABLES for better extraction
  const requestBody = JSON.stringify({
    Document: {
      S3Object: {
        Bucket: bucket,
        Name: s3Key
      }
    },
    FeatureTypes: ['FORMS', 'TABLES']
  });

  const payloadHash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody))
  )).map(b => b.toString(16).padStart(2, '0')).join('');

  const headers: Record<string, string> = {
    'host': `textract.${region}.amazonaws.com`,
    'content-type': 'application/x-amz-json-1.1',
    'x-amz-target': 'Textract.AnalyzeDocument',
    'x-amz-content-sha256': payloadHash
  };

  const signedHeaders = await signAWSRequest(
    'POST', url, headers, requestBody, 'textract', region, accessKeyId, secretAccessKey
  );

  console.log('Calling Textract AnalyzeDocument...');
  const response = await fetch(url, {
    method: 'POST',
    headers: signedHeaders,
    body: requestBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Textract error:', response.status, errorText);
    
    // Fallback to DetectText
    return await detectTextFallback(s3Key, bucket, region, accessKeyId, secretAccessKey);
  }

  const result = await response.json();
  console.log('Textract response received');

  // Extract text blocks
  const blocks = result.Blocks || [];
  const lineBlocks = blocks.filter((b: any) => b.BlockType === 'LINE');
  const rawText = lineBlocks.map((b: any) => b.Text).join('\n');

  // Extract key-value pairs from FORMS
  const keyValuePairs: Record<string, string> = {};
  const keyBlocks = blocks.filter((b: any) => b.BlockType === 'KEY_VALUE_SET' && b.EntityTypes?.includes('KEY'));
  
  for (const keyBlock of keyBlocks) {
    const keyText = getBlockText(keyBlock, blocks);
    const valueBlock = blocks.find((b: any) => 
      b.BlockType === 'KEY_VALUE_SET' && 
      b.EntityTypes?.includes('VALUE') &&
      keyBlock.Relationships?.some((r: any) => r.Type === 'VALUE' && r.Ids?.includes(b.Id))
    );
    
    if (valueBlock) {
      const valueText = getBlockText(valueBlock, blocks);
      if (keyText && valueText) {
        keyValuePairs[keyText.toLowerCase()] = valueText;
      }
    }
  }

  // Calculate average confidence
  const confidences = lineBlocks.map((b: any) => b.Confidence || 0);
  const avgConfidence = confidences.length > 0 
    ? confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length / 100
    : 0;

  // Extract common fields using patterns
  const extracted = extractBusinessFields(rawText, keyValuePairs);

  return {
    ...extracted,
    confidence: avgConfidence,
    rawText,
    rawBlocks: blocks
  };
}

// Helper to get text from block
function getBlockText(block: any, allBlocks: any[]): string {
  if (block.Text) return block.Text;
  
  const wordIds = block.Relationships
    ?.filter((r: any) => r.Type === 'CHILD')
    ?.flatMap((r: any) => r.Ids) || [];
  
  return wordIds
    .map((id: string) => allBlocks.find((b: any) => b.Id === id)?.Text || '')
    .join(' ');
}

// Extract business fields from raw text
function extractBusinessFields(rawText: string, keyValuePairs: Record<string, string>): {
  businessName?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  issueDate?: string;
  expiryDate?: string;
  documentNumber?: string;
  accountNumber?: string;
} {
  const result: any = {};

  // Try key-value pairs first
  for (const [key, value] of Object.entries(keyValuePairs)) {
    if (key.includes('business') && key.includes('name')) result.businessName = value;
    if (key.includes('company') && key.includes('name')) result.businessName = value;
    if (key.includes('address') && !key.includes('email')) result.address = value;
    if (key.includes('account') && key.includes('number')) result.accountNumber = value;
    if (key.includes('issue') && key.includes('date')) result.issueDate = value;
    if (key.includes('expiry') || key.includes('expire')) result.expiryDate = value;
  }

  // Pattern matching on raw text
  const lines = rawText.split('\n');

  // Address patterns (Australian format)
  const addressPattern = /(\d+\s+[\w\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd)[\w\s,]*)/i;
  const addressMatch = rawText.match(addressPattern);
  if (addressMatch && !result.address) {
    result.address = addressMatch[1].trim();
  }

  // Postcode pattern (Australia: 4 digits)
  const postcodePattern = /\b(\d{4})\b/g;
  const postcodeMatches = [...rawText.matchAll(postcodePattern)];
  if (postcodeMatches.length > 0) {
    // Usually postcode is in address context
    result.postalCode = postcodeMatches[postcodeMatches.length - 1][1];
  }

  // Account number pattern
  const accountPattern = /account\s*(?:number|no|#)?[\s:]*(\d[\d\s-]+)/i;
  const accountMatch = rawText.match(accountPattern);
  if (accountMatch && !result.accountNumber) {
    result.accountNumber = accountMatch[1].replace(/[\s-]/g, '');
  }

  // Date patterns
  const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g;
  const dates = [...rawText.matchAll(datePattern)].map(m => m[1]);
  if (dates.length > 0 && !result.issueDate) {
    result.issueDate = dates[0];
  }

  // Try to find business name (often at top of document or after "To:")
  const toPattern = /(?:to|customer|name)[\s:]+([A-Z][A-Za-z\s&']+(?:Pty Ltd|PTY LTD|Ltd|LLC|Inc|Corporation|Corp)?)/i;
  const toMatch = rawText.match(toPattern);
  if (toMatch && !result.businessName) {
    result.businessName = toMatch[1].trim();
  }

  return result;
}

// Fallback to DetectText
async function detectTextFallback(
  s3Key: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{
  businessName?: string;
  address?: string;
  confidence: number;
  rawText: string;
  rawBlocks: any[];
}> {
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
    return { confidence: 0, rawText: '', rawBlocks: [] };
  }

  const result = await response.json();
  const textDetections = result.TextDetections || [];
  
  const lines = textDetections
    .filter((t: any) => t.Type === 'LINE')
    .map((t: any) => t.DetectedText);
  
  const rawText = lines.join('\n');
  const avgConfidence = textDetections.length > 0 
    ? textDetections.reduce((sum: number, t: any) => sum + (t.Confidence || 0), 0) / textDetections.length / 100
    : 0;

  const extracted = extractBusinessFields(rawText, {});

  return {
    ...extracted,
    confidence: avgConfidence,
    rawText,
    rawBlocks: textDetections
  };
}

// Calculate string similarity (Levenshtein-based)
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.85;
  }

  // Simple word overlap
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  
  return intersection.length / union.size;
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

    console.log(`[verify-business-docs] Using AWS region: ${region}, bucket: ${bucket}`);

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

    const body: VerifyBusinessDocsRequest = await req.json();

    if (!body.venue_id || !body.document_url || !body.document_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields', status: 'failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting business document verification for venue ${body.venue_id}`);

    // Get venue data for comparison
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('name, address, city, country')
      .eq('id', body.venue_id)
      .single();

    if (venueError || !venue) {
      return new Response(JSON.stringify({ error: 'Venue not found', status: 'failed' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Download and upload document to S3
    console.log('Downloading document...');
    const documentData = await downloadImage(body.document_url);
    
    const timestamp = Date.now();
    const s3Key = `business-verification/${body.venue_id}/${body.document_type}_${timestamp}.jpg`;
    
    console.log('Uploading to S3...');
    await uploadToS3(documentData, s3Key, 'image/jpeg', bucket, region, accessKeyId, secretAccessKey);

    // Run Textract OCR
    console.log('Running Textract...');
    const ocrResult = await analyzeDocument(s3Key, bucket, region, accessKeyId, secretAccessKey);
    console.log('OCR Result:', ocrResult);

    // Compare extracted data with venue profile
    const venueFullAddress = [venue.address, venue.city, venue.country].filter(Boolean).join(', ');
    const addressMatchScore = stringSimilarity(ocrResult.address || '', venueFullAddress);
    const businessNameMatchScore = stringSimilarity(ocrResult.businessName || '', venue.name);

    console.log(`Address match: ${addressMatchScore}, Business name match: ${businessNameMatchScore}`);

    // Determine status
    let status: 'approved' | 'needs_review' | 'rejected';
    let failureReason: string | null = null;

    if (ocrResult.confidence < 0.4) {
      status = 'rejected';
      failureReason = 'Document is not readable. Please upload a clearer image.';
    } else if (addressMatchScore >= 0.6 || businessNameMatchScore >= 0.7) {
      status = 'approved';
    } else if (addressMatchScore >= 0.3 || businessNameMatchScore >= 0.4) {
      status = 'needs_review';
      failureReason = 'Address/business name partially matches. Manual review required.';
    } else {
      status = 'needs_review';
      failureReason = 'Could not verify address matches venue. Manual review required.';
    }

    // Save to venue_verification_documents
    const { error: insertError } = await supabase
      .from('venue_verification_documents')
      .insert({
        venue_id: body.venue_id,
        uploaded_by: user.id,
        document_type: body.document_type,
        storage_url: body.document_url,
        s3_key: s3Key,
        extracted_business_name: ocrResult.businessName,
        extracted_address: ocrResult.address,
        extracted_city: ocrResult.city,
        extracted_state: ocrResult.state,
        extracted_postal_code: ocrResult.postalCode,
        extracted_country: ocrResult.country,
        extracted_issue_date: ocrResult.issueDate,
        extracted_expiry_date: ocrResult.expiryDate,
        extracted_document_number: ocrResult.documentNumber,
        extracted_account_number: ocrResult.accountNumber,
        overall_confidence: ocrResult.confidence,
        address_match_score: addressMatchScore,
        business_name_match_score: businessNameMatchScore,
        raw_ocr_text: ocrResult.rawText,
        raw_ocr_blocks: ocrResult.rawBlocks,
        status,
        failure_reason: failureReason
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
    }

    console.log(`Business document verification complete: ${status}`);

    return new Response(JSON.stringify({
      success: true,
      status,
      extracted: {
        business_name: ocrResult.businessName,
        address: ocrResult.address,
        city: ocrResult.city,
        issue_date: ocrResult.issueDate,
        account_number: ocrResult.accountNumber
      },
      matching: {
        address_match_score: addressMatchScore,
        business_name_match_score: businessNameMatchScore,
        venue_address: venueFullAddress,
        venue_name: venue.name
      },
      confidence: ocrResult.confidence,
      failure_reason: failureReason,
      message: status === 'approved' 
        ? 'Document verified successfully'
        : status === 'needs_review'
          ? 'Document requires manual review'
          : failureReason || 'Verification failed'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Business document verification error:', error);
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

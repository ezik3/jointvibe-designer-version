import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter (per-user)
const rateLimitMap = new Map<string, { attempts: number; resetTime: number }>();
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(userId: string): { allowed: boolean; remainingAttempts: number } {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { attempts: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS - 1 };
  }

  if (userLimit.attempts >= MAX_ATTEMPTS) {
    return { allowed: false, remainingAttempts: 0 };
  }

  userLimit.attempts++;
  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - userLimit.attempts };
}

// Secure hash function using Web Crypto API with proper salt
async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  
  // Use PBKDF2 for key derivation with proper iterations
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    data,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  const saltBytes = encoder.encode(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized - no token provided' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized - invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit check
    const { allowed, remainingAttempts } = checkRateLimit(user.id);
    if (!allowed) {
      return new Response(JSON.stringify({ 
        error: 'Too many attempts. Please try again in 15 minutes.',
        locked: true 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, pin, venue_id } = await req.json();

    // Input validation
    if (!venue_id || typeof venue_id !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid venue_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(venue_id)) {
      return new Response(JSON.stringify({ error: 'Invalid venue_id format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!pin || typeof pin !== 'string' || pin.length < 4 || pin.length > 8) {
      return new Response(JSON.stringify({ error: 'PIN must be 4-8 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow numeric PINs
    if (!/^\d+$/.test(pin)) {
      return new Response(JSON.stringify({ error: 'PIN must contain only numbers' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'verify') {
      // Get employee link
      const { data: employee, error: empError } = await serviceClient
        .from('employee_venue_links')
        .select('pin_hash, is_active')
        .eq('user_id', user.id)
        .eq('venue_id', venue_id)
        .eq('is_active', true)
        .single();

      if (empError || !employee) {
        return new Response(JSON.stringify({ 
          valid: false, 
          error: 'Employee not found or inactive',
          remainingAttempts 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If no PIN set, allow access (venue hasn't enabled PIN verification)
      if (!employee.pin_hash) {
        return new Response(JSON.stringify({ valid: true, pinNotRequired: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create salt from user ID (consistent for same user)
      const salt = user.id.substring(0, 16);
      const computedHash = await hashPin(pin, salt);

      const valid = computedHash === employee.pin_hash;

      return new Response(JSON.stringify({ 
        valid, 
        remainingAttempts: valid ? MAX_ATTEMPTS : remainingAttempts 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'set') {
      // Create salt from user ID
      const salt = user.id.substring(0, 16);
      const pinHash = await hashPin(pin, salt);

      const { error: updateError } = await serviceClient
        .from('employee_venue_links')
        .update({ pin_hash: pinHash })
        .eq('user_id', user.id)
        .eq('venue_id', venue_id);

      if (updateError) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to set PIN' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action. Use "verify" or "set"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('PIN verification error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

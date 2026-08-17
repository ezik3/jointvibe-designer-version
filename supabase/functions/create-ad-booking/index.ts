import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-AD-BOOKING] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    }
  );

  try {
    logStep("Function started");

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { 
      campaignId, 
      placementType, 
      startDate, 
      endDate, 
      targetCities,
      targetSuburbs,
      targetLocations,
      bidAmount,
      origin: clientOrigin,
    } = await req.json();

    if (!campaignId || !placementType || !startDate || !endDate || !targetCities?.length) {
      throw new Error("Missing required fields");
    }

    logStep("Booking details", { campaignId, placementType, startDate, endDate, targetCities, targetSuburbs, targetLocations, bidAmount });

    // Calculate pricing
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Base pricing
    const baseDailyRate = placementType === 'city_view' ? 50
      : placementType === 'sidebar' ? 40
      : placementType === 'driver_signup' ? 30
      : 30;

    // For driver_signup ads, charge per SUBURB (hyper-local).
    // For other placements, charge per SUBURB if suburbs are provided, otherwise per CITY.
    const isDriverSignup = placementType === 'driver_signup';
    const suburbCount = Array.isArray(targetSuburbs) ? targetSuburbs.length : 0;
    const useSuburbPricing = isDriverSignup || suburbCount > 0;
    const targetUnits = useSuburbPricing
      ? Math.max(1, suburbCount)
      : targetCities.length;
    const basePrice = baseDailyRate * days * targetUnits;
    const finalPrice = basePrice + (bidAmount || 0);

    logStep("Pricing calculated", { days, baseDailyRate, basePrice, finalPrice, targetUnits, useSuburbPricing, isDriverSignup });

    // Create booking record in pending state
    const bookingInsert: any = {
      campaign_id: campaignId,
      placement_type: placementType,
      start_date: startDate,
      end_date: endDate,
      target_cities: targetCities,
      base_price: basePrice,
      bid_amount: bidAmount || 0,
      final_price: finalPrice,
      payment_status: 'pending'
    };

    // For driver_signup (auto) ads, ALWAYS persist target_locations so the
    // delivery RPC can match them. Fall back to campaign data when the client
    // doesn't supply explicit targeting.
    let resolvedTargetLocations = targetLocations;
    if (isDriverSignup) {
      if (!resolvedTargetLocations) {
        const { data: campaignRow } = await supabaseClient
          .from('ad_campaigns')
          .select('city, auto_details')
          .eq('id', campaignId)
          .single();
        if (campaignRow) {
          resolvedTargetLocations = {
            country: (campaignRow as any).auto_details?.country || 'Australia',
            state: null,
            city: campaignRow.city,
            suburbs: [],
          };
        }
      }
      // Always overlay the explicit suburbs list when provided by client
      if (resolvedTargetLocations && Array.isArray(targetSuburbs)) {
        resolvedTargetLocations = {
          ...resolvedTargetLocations,
          suburbs: targetSuburbs,
        };
      }
    } else if (useSuburbPricing && Array.isArray(targetSuburbs) && targetSuburbs.length > 0) {
      // Real-estate suburb-targeted booking: persist suburbs alongside any client-provided locations
      resolvedTargetLocations = {
        ...(resolvedTargetLocations || {}),
        suburbs: targetSuburbs,
      };
    }
    if (resolvedTargetLocations) {
      bookingInsert.target_locations = resolvedTargetLocations;
    }

    const { data: booking, error: bookingError } = await supabaseClient
      .from('ad_bookings')
      .insert(bookingInsert)
      .select()
      .single();

    if (bookingError) {
      logStep("Booking creation error", bookingError);
      throw new Error(`Failed to create booking: ${bookingError.message}`);
    }

    logStep("Booking created", { bookingId: booking.id });

    // Initialize Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }
    logStep("Stripe customer check", { customerId: customerId || 'new' });

    // Create Stripe checkout session
    const baseOrigin = clientOrigin || req.headers.get("origin") || "https://app.jointvibe.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Ad Placement: ${placementType === 'city_view' ? 'City View' : placementType === 'sidebar' ? 'Desktop Sidebar' : placementType === 'driver_signup' ? 'Driver Signup Spotlight' : 'Public Post'}`,
              description: `${days} days in ${targetCities.join(', ')}`,
            },
            unit_amount: Math.round(finalPrice * 100), // cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${baseOrigin}/advertiser/campaigns?booking_success=true&booking_id=${booking.id}`,
      cancel_url: `${baseOrigin}/advertiser/campaigns/${campaignId}/book?cancelled=true`,
      metadata: {
        booking_id: booking.id,
        campaign_id: campaignId,
        type: 'ad_booking'
      }
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    // Update booking with payment intent
    await supabaseClient
      .from('ad_bookings')
      .update({ stripe_payment_intent_id: session.id })
      .eq('id', booking.id);

    return new Response(JSON.stringify({ 
      url: session.url,
      bookingId: booking.id,
      finalPrice 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

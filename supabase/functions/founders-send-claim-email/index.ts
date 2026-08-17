import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, claimCode, cityName, countryName, passType } = await req.json();
    if (!email || !claimCode) throw new Error("Email and claim code are required");

    const isVenue = passType === "venue";
    const licenseLabel = isVenue ? "Venue Founders License" : "City Founders License";

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.log("=== CLAIM CODE EMAIL (No Resend) ===");
      console.log("To:", email, "| City:", cityName, "| Code:", claimCode, "| Type:", passType);
      return new Response(
        JSON.stringify({ success: true, message: "Logged to console" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Joint Vibe <noreply@jointvibe.app>",
        to: [email],
        subject: `Your ${licenseLabel} Claim Code - ${cityName}`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f1729;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1729;padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1a2744;border-radius:16px;overflow:hidden;">
<tr><td style="padding:40px;text-align:center;background:linear-gradient(135deg,#06b6d4 0%,#10b981 100%);">
<h1 style="margin:0;color:#fff;font-size:24px;">🎉 Your ${licenseLabel} is Ready!</h1>
</td></tr>
<tr><td style="padding:40px;">
<p style="color:#e2e8f0;font-size:16px;line-height:1.6;">Your purchase for <strong>${cityName}${countryName ? `, ${countryName}` : ""}</strong> is complete.</p>
<div style="background:#0f1729;border:2px solid #06b6d4;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
<p style="margin:0 0 10px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your Claim Code</p>
<p style="margin:0;color:#06b6d4;font-size:28px;font-weight:bold;font-family:monospace;letter-spacing:4px;">${claimCode}</p>
</div>
<p style="color:#cbd5e1;font-size:14px;">Sign in to Joint Vibe and enter this code to activate your pass.</p>
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #2d3748;text-align:center;">
<p style="margin:0;color:#64748b;font-size:12px;">This code is unique and non-transferable. © ${new Date().getFullYear()} Joint Vibe</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`,
      }),
    });

    if (!response.ok) throw new Error("Failed to send email");
    const data = await response.json();

    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

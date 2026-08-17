// Shared Bridge.xyz API client used by all bridge-* edge functions.
// Runs in stub mode automatically when BRIDGE_API_KEY is missing.
// When you add the live key (and BRIDGE_API_BASE if not the default), every
// function below transparently switches to real Bridge calls — no code edits.

const DEFAULT_BASE = "https://api.bridge.xyz";

export function bridgeConfig() {
  return {
    apiKey: Deno.env.get("BRIDGE_API_KEY") ?? "",
    apiBase: Deno.env.get("BRIDGE_API_BASE") ?? DEFAULT_BASE,
    webhookSecret: Deno.env.get("BRIDGE_WEBHOOK_SECRET") ?? "",
    liveMode: Boolean(Deno.env.get("BRIDGE_API_KEY")),
  };
}

export async function bridgeFetch(path: string, init: RequestInit = {}) {
  const { apiKey, apiBase, liveMode } = bridgeConfig();
  if (!liveMode) {
    throw new Error("bridge_stub_mode"); // callers detect and short-circuit
  }
  const idemKey = (init.headers as Record<string,string> | undefined)?.["Idempotency-Key"]
    ?? crypto.randomUUID();
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      "Idempotency-Key": idemKey,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`bridge_http_${res.status}: ${text.slice(0, 240)}`);
  }
  return json;
}

// --- Stub helpers (used until BRIDGE_API_KEY is set) ---
export const stub = {
  customerId: () => `stub_cust_${crypto.randomUUID().slice(0, 8)}`,
  kycLink: (custId: string) =>
    `https://stub-kyc.bridge.local/start?cust=${custId}&exp=${Date.now() + 10 * 60_000}`,
  externalAccountId: () => `stub_extacct_${crypto.randomUUID().slice(0, 8)}`,
  transferId: () => `stub_xfer_${crypto.randomUUID().slice(0, 8)}`,
  virtualAccountId: () => `stub_va_${crypto.randomUUID().slice(0, 8)}`,
};

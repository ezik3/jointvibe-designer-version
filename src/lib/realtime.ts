/**
 * Gives each effect-owned Supabase channel a distinct topic so React StrictMode
 * cannot reuse a channel while its asynchronous cleanup is still pending.
 */
export function createRealtimeChannelTopic(scope: string): string {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

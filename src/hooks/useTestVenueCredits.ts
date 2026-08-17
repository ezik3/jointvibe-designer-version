import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TestVenueCreditsResult {
  isTestingMode: boolean;
  testPushCredits: number;
  testVibeCredits: number;
  loading: boolean;
}

/**
 * For venues in testing mode (venue_status = 'testing' and/or verified_at IS NULL),
 * auto-seeds 5 test push credits and 5 test vibe credits (local tier, credit_type = 'test').
 * Returns the current test credit counts.
 */
export function useTestVenueCredits(venueId: string | null): TestVenueCreditsResult {
  const [isTestingMode, setIsTestingMode] = useState(false);
  const [testPushCredits, setTestPushCredits] = useState(0);
  const [testVibeCredits, setTestVibeCredits] = useState(0);
  const [loading, setLoading] = useState(false);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!venueId) return;
    seededRef.current = false;

    const run = async () => {
      setLoading(true);
      try {
        // Check venue status
        const { data: venue } = await supabase
          .from('venues')
          .select('venue_status, verified_at')
          .eq('id', venueId)
          .single();

        const isTesting = !!venue && (venue.venue_status === 'testing' || !venue.verified_at);
        setIsTestingMode(isTesting);

        if (!isTesting) {
          setTestPushCredits(0);
          setTestVibeCredits(0);
          setLoading(false);
          return;
        }

        // Seed test push credits if not present
        const { data: pushRows } = await supabase
          .from('venue_push_credits')
          .select('id, credits_remaining')
          .eq('venue_id', venueId)
          .eq('credit_type', 'test')
          .eq('reach_tier', 'local');

        if (!pushRows?.length && !seededRef.current) {
          seededRef.current = true;
          await supabase.from('venue_push_credits').insert({
            venue_id: venueId,
            credit_type: 'test',
            reach_tier: 'local',
            credits_remaining: 5,
          });
          setTestPushCredits(5);
        } else {
          setTestPushCredits(pushRows?.reduce((s, r) => s + (r.credits_remaining || 0), 0) ?? 0);
        }

        // Seed test vibe credits if not present
        const { data: vibeRows } = await supabase
          .from('venue_vibe_credits')
          .select('id, credits_remaining')
          .eq('venue_id', venueId)
          .eq('credit_type', 'test')
          .eq('reach_tier', 'local');

        if (!vibeRows?.length && seededRef.current) {
          await supabase.from('venue_vibe_credits').insert({
            venue_id: venueId,
            credit_type: 'test',
            reach_tier: 'local',
            credits_remaining: 5,
          });
          setTestVibeCredits(5);
        } else {
          setTestVibeCredits(vibeRows?.reduce((s, r) => s + (r.credits_remaining || 0), 0) ?? 0);
        }
      } catch (err) {
        console.error('useTestVenueCredits error:', err);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [venueId]);

  return { isTestingMode, testPushCredits, testVibeCredits, loading };
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VenueStatus {
  status: 'testing' | 'live';
  isLive: boolean;
  isTesting: boolean;
  testUserCount: number;
  maxTestUsers: number;
  subscriptionId: string | null;
  loading: boolean;
}

const MAX_TEST_USERS = 10;

export function useVenueStatus(venueId: string | null) {
  const [venueStatus, setVenueStatus] = useState<VenueStatus>({
    status: 'testing',
    isLive: false,
    isTesting: true,
    testUserCount: 0,
    maxTestUsers: MAX_TEST_USERS,
    subscriptionId: null,
    loading: true,
  });

  useEffect(() => {
    if (!venueId) return;

    async function fetchStatus() {
      const [venueRes, countRes] = await Promise.all([
        supabase
          .from('venues')
          .select('venue_status, subscription_id')
          .eq('id', venueId)
          .single(),
        (supabase as any)
          .from('venue_test_invites')
          .select('*', { count: 'exact', head: true })
          .eq('venue_id', venueId)
          .eq('is_simulator', false)
          .in('status', ['accepted']),
      ]);

      const venue = venueRes.data;
      const count = countRes.count;

      setVenueStatus({
        status: (venue?.venue_status as 'testing' | 'live') || 'testing',
        isLive: venue?.venue_status === 'live',
        isTesting: venue?.venue_status !== 'live',
        testUserCount: count || 0,
        maxTestUsers: MAX_TEST_USERS,
        subscriptionId: venue?.subscription_id || null,
        loading: false,
      });
    }

    fetchStatus();
  }, [venueId]);

  return venueStatus;
}

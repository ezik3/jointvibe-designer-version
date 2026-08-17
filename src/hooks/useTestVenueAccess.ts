import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface TestVenue {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  city: string | null;
  country: string | null;
  venue_type: string | null;
  vibe_score: number | null;
  current_occupancy: number | null;
  capacity: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_enabled: boolean | null;
  max_delivery_radius_km: number | null;
  reservations_enabled: boolean | null;
}

export function useTestVenueAccess() {
  const { user } = useAuth();
  const [testVenues, setTestVenues] = useState<TestVenue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setTestVenues([]);
      return;
    }

    const fetchTestVenues = async () => {
      setLoading(true);
      try {
        // Get accepted test invite venue IDs
        const { data: invites, error: inviteError } = await (supabase as any)
          .from('venue_test_invites')
          .select('venue_id')
          .eq('invited_user_id', user.id)
          .eq('status', 'accepted');

        if (inviteError || !invites?.length) {
          setTestVenues([]);
          setLoading(false);
          return;
        }

        const venueIds = invites.map((i: any) => i.venue_id);

        // Fetch venue details (without the usual approval/live/verified filters)
        const { data: venues, error: venueError } = await supabase
          .from('venues')
          .select('id, name, description, image_url, city, country, venue_type, vibe_score, current_occupancy, capacity, address, latitude, longitude, delivery_enabled, max_delivery_radius_km, reservations_enabled')
          .in('id', venueIds);

        if (venueError) {
          console.error('Error fetching test venues:', venueError);
          setTestVenues([]);
        } else {
          setTestVenues(venues || []);
        }
      } catch (err) {
        console.error('useTestVenueAccess error:', err);
        setTestVenues([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTestVenues();
  }, [user]);

  const testVenueIds = useMemo(
    () => new Set(testVenues.map((v) => v.id)),
    [testVenues],
  );

  const isTestVenue = useCallback(
    (venueId: string) => testVenueIds.has(venueId),
    [testVenueIds],
  );

  const hasTestAccess = useCallback(
    async (venueId: string): Promise<boolean> => {
      if (!user) return false;
      if (testVenueIds.has(venueId)) return true;

      // Fallback check for venues not yet in local state
      const { data } = await (supabase as any)
        .from('venue_test_invites')
        .select('id')
        .eq('invited_user_id', user.id)
        .eq('venue_id', venueId)
        .eq('status', 'accepted')
        .limit(1)
        .maybeSingle();

      return !!data;
    },
    [user, testVenueIds],
  );

  return { testVenues, testVenueIds, isTestVenue, hasTestAccess, loading };
}

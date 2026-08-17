import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import { useVenueVibeCredits } from "@/hooks/useVenueVibeCredits";

export interface Vibe {
  id: string;
  venue_id: string;
  message: string;
  reach_type: string;
  status: string;
  expires_at: string;
  created_at: string;
  converted_to_deal_id: string | null;
  response_summary: {
    yes: number;
    maybe: number;
    no: number;
  };
}

export function useVenueVibes(venueId: string | null) {
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [activeVibe, setActiveVibe] = useState<Vibe | null>(null);
  const [loading, setLoading] = useState(true);
  const vibeCreditsHook = useVenueVibeCredits(venueId);
  const { totalVibeCredits: vibeCredits, spendVibeCredit } = vibeCreditsHook;

  // Fetch vibes for venue
  const fetchVibes = useCallback(async () => {
    if (!venueId) return;

    try {
      const { data, error } = await supabase
        .from('venue_vibes')
        .select('*')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedVibes = (data || []).map(v => ({
        ...v,
        response_summary: (v.response_summary as any) || { yes: 0, maybe: 0, no: 0 }
      }));

      setVibes(typedVibes);

      // Set active vibe (currently collecting AND not expired by time)
      const now = new Date().getTime();
      const active = typedVibes.find(v => v.status === 'collecting' && new Date(v.expires_at).getTime() > now);
      setActiveVibe(active || null);

      // Auto-expire any vibes that are still 'collecting' but past their expires_at
      const staleVibes = typedVibes.filter(v => v.status === 'collecting' && new Date(v.expires_at).getTime() <= now);
      for (const stale of staleVibes) {
        supabase
          .from('venue_vibes')
          .update({ status: 'expired' })
          .eq('id', stale.id)
          .then(() => {});
      }
    } catch (error) {
      console.error('Error fetching vibes:', error);
    } finally {
      setLoading(false);
    }
  }, [venueId]);


  // Send a new vibe
  const sendVibe = async (message: string, reachType: string, durationMinutes: number) => {
    if (!venueId) throw new Error('No venue ID');
    if (vibeCredits <= 0) throw new Error('No vibe credits remaining');

    // Spend credit (free first for local, then paid)
    const spent = await spendVibeCredit(reachType);
    if (!spent) throw new Error('No vibe credits available for this reach tier');

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('venue_vibes')
      .insert({
        venue_id: venueId,
        message,
        reach_type: reachType,
        status: 'collecting',
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw error;

    const newVibe = {
      ...data,
      response_summary: { yes: 0, maybe: 0, no: 0 }
    };

    setVibes(prev => [newVibe, ...prev]);
    setActiveVibe(newVibe);

    toast.success('Vibe sent! Collecting responses...');
    return newVibe;
  };

  // Convert vibe to deal
  const convertToDeal = async (vibeId: string) => {
    const { error } = await supabase
      .from('venue_vibes')
      .update({ status: 'converted' })
      .eq('id', vibeId);

    if (error) throw error;

    setVibes(prev => prev.map(v => 
      v.id === vibeId ? { ...v, status: 'converted' } : v
    ));

    if (activeVibe?.id === vibeId) {
      setActiveVibe(null);
    }

    toast.success('Opening Deal Creator...');
  };

  // Let vibe expire
  const expireVibe = async (vibeId: string) => {
    const { error } = await supabase
      .from('venue_vibes')
      .update({ status: 'expired' })
      .eq('id', vibeId);

    if (error) throw error;

    setVibes(prev => prev.map(v => 
      v.id === vibeId ? { ...v, status: 'expired' } : v
    ));

    if (activeVibe?.id === vibeId) {
      setActiveVibe(null);
    }

    toast.info('Vibe expired. No credits used.');
  };

  // Initial fetch
  useEffect(() => {
    fetchVibes();
  }, [fetchVibes]);

  // Real-time subscription for vibe responses
  useEffect(() => {
    if (!venueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`vibes-${venueId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'venue_vibes',
          filter: `venue_id=eq.${venueId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            const typedVibe = {
              ...updated,
              response_summary: updated.response_summary || { yes: 0, maybe: 0, no: 0 }
            };

            setVibes(prev => prev.map(v => 
              v.id === typedVibe.id ? typedVibe : v
            ));

            if (activeVibe?.id === typedVibe.id) {
              setActiveVibe(typedVibe);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, activeVibe?.id]);

  return {
    vibes,
    activeVibe,
    vibeCredits,
    vibeCreditsHook,
    loading,
    sendVibe,
    convertToDeal,
    expireVibe,
    refetch: fetchVibes,
  };
}

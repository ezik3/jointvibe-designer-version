import { useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import { useDeliverySoundEnabled, useDeliverySoundVolume } from "@/hooks/useDeliverySoundSetting";

interface UseDeliveryNotificationOptions {
  venueId: string | null;
  enabled?: boolean;
  onNewDelivery?: (delivery: any) => void;
}

export function useDeliveryNotification({
  venueId,
  enabled = true,
  onNewDelivery,
}: UseDeliveryNotificationOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousDeliveryIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  const { enabled: soundEnabled } = useDeliverySoundEnabled();
  const { volume } = useDeliverySoundVolume();
  const notificationsEnabled = useMemo(() => enabled && soundEnabled, [enabled, soundEnabled]);

  // Create audio element for notification sound
  useEffect(() => {
    const gain = 0.3 * (volume / 100);
    const quietGain = Math.max(gain / 30, 0.0001);

    // Create a simple notification beep using Web Audio API
    const createBeepSound = () => {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(gain, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(quietGain, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);

      // Second beep
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1000;
        osc2.type = "sine";
        gain2.gain.setValueAtTime(gain, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(quietGain, audioContext.currentTime + 0.5);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.5);
      }, 200);

      // Third beep (higher)
      setTimeout(() => {
        const osc3 = audioContext.createOscillator();
        const gain3 = audioContext.createGain();
        osc3.connect(gain3);
        gain3.connect(audioContext.destination);
        osc3.frequency.value = 1200;
        osc3.type = "sine";
        gain3.gain.setValueAtTime(gain, audioContext.currentTime);
        gain3.gain.exponentialRampToValueAtTime(quietGain, audioContext.currentTime + 0.5);
        osc3.start(audioContext.currentTime);
        osc3.stop(audioContext.currentTime + 0.5);
      }, 400);
    };

    audioRef.current = { play: createBeepSound } as any;
  }, [volume]);

  const playNotificationSound = useCallback(() => {
    if (!notificationsEnabled || volume <= 0) return;
    try {
      if (audioRef.current?.play) {
        audioRef.current.play();
      }
    } catch {
      // ignore
    }
  }, [notificationsEnabled, volume]);

  // Subscribe to new delivery orders
  useEffect(() => {
    if (!venueId || !notificationsEnabled) return;

    // Fetch initial delivery IDs to avoid notifying on page load
    const fetchInitialDeliveries = async () => {
      const { data } = await supabase
        .from("food_delivery_orders")
        .select("id")
        .eq("venue_id", venueId);

      if (data) {
        previousDeliveryIdsRef.current = new Set(data.map((d) => d.id));
      }

      // After initial load, allow notifications
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 2000);
    };

    fetchInitialDeliveries();

    const channel = supabase
      .channel(createRealtimeChannelTopic(`delivery-notifications-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "food_delivery_orders",
          filter: `venue_id=eq.${venueId}`,
        },
        (payload) => {
          // Check if this is a truly new delivery (not from initial load)
          if (!isInitialLoadRef.current && !previousDeliveryIdsRef.current.has(payload.new.id)) {
            previousDeliveryIdsRef.current.add(payload.new.id);

            playNotificationSound();

            toast.info("🚚 New Delivery Order!", {
              description: "A new delivery order has come in. Please review and accept.",
              duration: 10000,
              action: {
                label: "View",
                onClick: () => {
                  window.location.href = "/venue/orders";
                },
              },
            });

            onNewDelivery?.(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, notificationsEnabled, playNotificationSound, onNewDelivery]);

  return {
    playNotificationSound,
  };
}

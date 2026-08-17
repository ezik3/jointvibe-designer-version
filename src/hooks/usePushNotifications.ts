import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    // Check if push notifications are supported
    const supported = "Notification" in window && "serviceWorker" in navigator;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast.error("Push notifications not supported on this device");
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        toast.success("Push notifications enabled!");
        return true;
      } else if (result === "denied") {
        toast.error("Push notifications blocked. Enable in browser settings.");
        return false;
      }
      return false;
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, [isSupported]);

  const saveToken = useCallback(async (token: string) => {
    if (!user) return;

    try {
      // Upsert the token (insert or update if exists)
      const { error } = await supabase
        .from("push_notification_tokens")
        .upsert({
          user_id: user.id,
          token: token,
          device_type: "web",
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id,token"
        });

      if (error) throw error;
      setIsSubscribed(true);
    } catch (error) {
      console.error("Error saving push token:", error);
    }
  }, [user]);

  const showLocalNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (permission !== "granted") return;

    try {
      new Notification(title, {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        ...options
      });
    } catch (error) {
      console.error("Error showing notification:", error);
    }
  }, [permission]);

  // Request permission and setup on mount if user is logged in
  useEffect(() => {
    const setupNotifications = async () => {
      if (!user || !isSupported || permission === "denied") return;

      if (permission === "default") {
        // Don't auto-request, let user trigger it
        return;
      }

      if (permission === "granted") {
        // Generate a simple token based on user and timestamp
        // In production, you'd use Web Push API with VAPID keys
        const token = `web_${user.id}_${Date.now()}`;
        await saveToken(token);
      }
    };

    setupNotifications();
  }, [user, isSupported, permission, saveToken]);

  return {
    isSupported,
    permission,
    isSubscribed,
    requestPermission,
    showLocalNotification,
    saveToken
  };
};

// Hook for driver-specific notifications
export const useDriverPushNotifications = (isOnShift: boolean) => {
  const { showLocalNotification, permission, requestPermission } = usePushNotifications();

  const notifyNewDelivery = useCallback((orderDetails: { 
    pickup?: string; 
    dropoff?: string; 
    earnings?: number;
    type?: 'delivery' | 'ride';
  }) => {
    if (permission !== "granted" || !isOnShift) return;

    const type = orderDetails.type || 'delivery';
    const title = type === 'delivery' ? "🍔 New Delivery Available!" : "🚗 New Ride Request!";
    
    showLocalNotification(title, {
      body: `${orderDetails.pickup || 'Pickup'} → ${orderDetails.dropoff || 'Dropoff'}\nEarn $${orderDetails.earnings?.toFixed(2) || '0.00'}`,
      tag: `new-${type}-${Date.now()}`,
      requireInteraction: true,
    });
  }, [permission, isOnShift, showLocalNotification]);

  const notifyOrderAssigned = useCallback((orderId: string) => {
    if (permission !== "granted") return;

    showLocalNotification("✅ Order Assigned!", {
      body: "A new order has been assigned to you. Tap to view details.",
      tag: `order-${orderId}`,
    });
  }, [permission, showLocalNotification]);

  const notifyCustomerMessage = useCallback((customerName: string) => {
    if (permission !== "granted") return;

    showLocalNotification(`💬 New message from ${customerName}`, {
      body: "Tap to view and reply",
      tag: `chat-${Date.now()}`,
    });
  }, [permission, showLocalNotification]);

  return {
    notifyNewDelivery,
    notifyOrderAssigned,
    notifyCustomerMessage,
    requestPermission,
    hasPermission: permission === "granted"
  };
};

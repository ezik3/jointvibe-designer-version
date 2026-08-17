import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DeliveryFeeConfig {
  base_fee: number;
  per_km_rate: number;
  min_fee: number;
  max_fee: number;
  platform_fee: number;
}

interface RideFareConfig {
  base_fare: number;
  per_km_rate: number;
  per_minute_rate: number;
  min_fare: number;
  max_fare: number;
  platform_fee: number;
}

interface FareCalculation {
  fare: number;
  platformFee: number;
  driverEarnings: number;
  distance: number;
  duration: number;
}

export const useDeliveryFee = () => {
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryFeeConfig | null>(null);
  const [rideConfig, setRideConfig] = useState<RideFareConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      // Fetch delivery fee config
      const { data: deliveryData } = await supabase
        .from('delivery_fee_config')
        .select('*')
        .limit(1)
        .single();

      if (deliveryData) {
        setDeliveryConfig({
          base_fee: Number(deliveryData.base_fee),
          per_km_rate: Number(deliveryData.per_km_rate),
          min_fee: Number(deliveryData.min_fee),
          max_fee: Number(deliveryData.max_fee),
          platform_fee: Number(deliveryData.platform_fee),
        });
      }

      // Fetch ride fare config
      const { data: rideData } = await supabase
        .from('ride_fare_config')
        .select('*')
        .limit(1)
        .single();

      if (rideData) {
        setRideConfig({
          base_fare: Number(rideData.base_fare),
          per_km_rate: Number(rideData.per_km_rate),
          per_minute_rate: Number(rideData.per_minute_rate),
          min_fare: Number(rideData.min_fare),
          max_fare: Number(rideData.max_fare),
          platform_fee: Number(rideData.platform_fee),
        });
      }
    } catch (error) {
      console.error('Error fetching fee configs:', error);
      // Use defaults if fetch fails
      setDeliveryConfig({
        base_fee: 2.00,
        per_km_rate: 0.50,
        min_fee: 3.00,
        max_fee: 15.00,
        platform_fee: 0.10,
      });
      setRideConfig({
        base_fare: 3.00,
        per_km_rate: 1.50,
        per_minute_rate: 0.20,
        min_fare: 5.00,
        max_fare: 200.00,
        platform_fee: 0.10,
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate delivery fee based on distance
  const calculateDeliveryFee = useCallback((distanceKm: number): FareCalculation => {
    const config = deliveryConfig || {
      base_fee: 2.00,
      per_km_rate: 0.50,
      min_fee: 3.00,
      max_fee: 15.00,
      platform_fee: 0.10,
    };

    // Calculate raw fee: base + distance * rate
    let fee = config.base_fee + (distanceKm * config.per_km_rate);
    
    // Apply min/max caps
    fee = Math.max(config.min_fee, Math.min(config.max_fee, fee));
    
    // Round to 2 decimal places
    fee = Math.round(fee * 100) / 100;
    
    // Platform fee is fixed at $0.10
    const platformFee = config.platform_fee;
    
    // Driver keeps everything except platform fee
    const driverEarnings = Math.round((fee - platformFee) * 100) / 100;

    return {
      fare: fee,
      platformFee,
      driverEarnings,
      distance: distanceKm,
      duration: 0, // Delivery doesn't have duration estimate
    };
  }, [deliveryConfig]);

  // Calculate ride fare based on distance and duration
  const calculateRideFare = useCallback((distanceKm: number, durationMinutes: number): FareCalculation => {
    const config = rideConfig || {
      base_fare: 3.00,
      per_km_rate: 1.50,
      per_minute_rate: 0.20,
      min_fare: 5.00,
      max_fare: 200.00,
      platform_fee: 0.10,
    };

    // Calculate raw fare: base + (distance * km_rate) + (duration * minute_rate)
    let fare = config.base_fare + (distanceKm * config.per_km_rate) + (durationMinutes * config.per_minute_rate);
    
    // Apply min/max caps
    fare = Math.max(config.min_fare, Math.min(config.max_fare, fare));
    
    // Round to 2 decimal places
    fare = Math.round(fare * 100) / 100;
    
    // Platform fee is fixed at $0.10
    const platformFee = config.platform_fee;
    
    // Driver keeps everything except platform fee
    const driverEarnings = Math.round((fare - platformFee) * 100) / 100;

    return {
      fare,
      platformFee,
      driverEarnings,
      distance: distanceKm,
      duration: durationMinutes,
    };
  }, [rideConfig]);

  // Calculate distance between two points using Haversine formula
  const calculateDistance = useCallback((
    lat1: number, 
    lng1: number, 
    lat2: number, 
    lng2: number
  ): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Check if a venue delivers to a location
  const canDeliverTo = useCallback((
    venueLocation: { lat: number; lng: number },
    customerLocation: { lat: number; lng: number },
    maxRadius: number = 20
  ): { canDeliver: boolean; distance: number } => {
    const distance = calculateDistance(
      venueLocation.lat,
      venueLocation.lng,
      customerLocation.lat,
      customerLocation.lng
    );
    return {
      canDeliver: distance <= maxRadius,
      distance: Math.round(distance * 10) / 10,
    };
  }, [calculateDistance]);

  return {
    loading,
    deliveryConfig,
    rideConfig,
    calculateDeliveryFee,
    calculateRideFare,
    calculateDistance,
    canDeliverTo,
  };
};

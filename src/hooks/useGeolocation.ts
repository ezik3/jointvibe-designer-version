import { useState, useEffect, useCallback } from "react";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  timestamp: number | null;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  watchPosition?: boolean;
}

export const useGeolocation = (options: UseGeolocationOptions = {}) => {
  const {
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 0,
    watchPosition = false,
  } = options;

  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: true,
    timestamp: null,
  });

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    setState({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      error: null,
      loading: false,
      timestamp: position.timestamp,
    });
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    setState((prev) => ({
      ...prev,
      error: error.message,
      loading: false,
    }));
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: "Geolocation is not supported by your browser",
        loading: false,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy,
      timeout,
      maximumAge,
    });
  }, [enableHighAccuracy, timeout, maximumAge, handleSuccess, handleError]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: "Geolocation is not supported by your browser",
        loading: false,
      }));
      return;
    }

    // Get initial position
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy,
      timeout,
      maximumAge,
    });

    // Watch position if enabled
    let watchId: number | undefined;
    if (watchPosition) {
      watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
        enableHighAccuracy,
        timeout,
        maximumAge,
      });
    }

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [enableHighAccuracy, timeout, maximumAge, watchPosition, handleSuccess, handleError]);

  // Calculate distance between two points using Haversine formula
  const getDistanceFromLatLonInMeters = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000; // Radius of the earth in meters
      const dLat = deg2rad(lat2 - lat1);
      const dLon = deg2rad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) *
          Math.cos(deg2rad(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const d = R * c; // Distance in meters
      return d;
    },
    []
  );

  const deg2rad = (deg: number): number => {
    return deg * (Math.PI / 180);
  };

  const isWithinRadius = useCallback(
    (targetLat: number, targetLon: number, radiusMeters: number): boolean => {
      if (state.latitude === null || state.longitude === null) {
        return false;
      }
      const distance = getDistanceFromLatLonInMeters(
        state.latitude,
        state.longitude,
        targetLat,
        targetLon
      );
      return distance <= radiusMeters;
    },
    [state.latitude, state.longitude, getDistanceFromLatLonInMeters]
  );

  const getDistanceTo = useCallback(
    (targetLat: number, targetLon: number): number | null => {
      if (state.latitude === null || state.longitude === null) {
        return null;
      }
      return getDistanceFromLatLonInMeters(
        state.latitude,
        state.longitude,
        targetLat,
        targetLon
      );
    },
    [state.latitude, state.longitude, getDistanceFromLatLonInMeters]
  );

  return {
    ...state,
    requestLocation,
    isWithinRadius,
    getDistanceTo,
  };
};

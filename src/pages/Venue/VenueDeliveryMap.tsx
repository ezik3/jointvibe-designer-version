import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { useVenueActiveDeliveries, type VenueActiveDelivery } from "@/hooks/useVenueActiveDeliveries";
import { useVenueDeliveryOrders } from "@/hooks/useVenueDeliveryOrders";
import {
  Bike,
  Check,
  Clock,
  MapPin,
  MessageSquareText,
  PackageCheck,
  RefreshCw,
  Search,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import "./venue-delivery-map.css";

interface RouteData {
  pickupToDropoff: GeoJSON.Feature<GeoJSON.Geometry> | null;
  driverToPickup: GeoJSON.Feature<GeoJSON.Geometry> | null;
  driverToPickupDuration: number | null;
  pickupToDropoffDuration: number | null;
}

type DeliveryFilter = "active" | "prepare" | "ready" | "assigned" | "transit";

interface DeliveryStatusDisplay {
  label: string;
  tone: string;
  progress: string;
}

interface DeliveryAction {
  label: string;
  icon: LucideIcon;
}

const deliveryFilters: { id: DeliveryFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "prepare", label: "To prepare" },
  { id: "ready", label: "Ready" },
  { id: "assigned", label: "Assigned" },
  { id: "transit", label: "In transit" },
];

const deliveryStatusDisplay: Record<string, DeliveryStatusDisplay> = {
  pending: {
    label: "Awaiting confirmation",
    tone: "pending",
    progress: "This order is waiting for your venue to accept it.",
  },
  venue_confirmed: {
    label: "Preparing",
    tone: "preparing",
    progress: "Your venue confirmed the order. Prepare it for driver collection.",
  },
  driver_assigned: {
    label: "Driver assigned",
    tone: "assigned",
    progress: "A driver has accepted the delivery and is heading to the venue.",
  },
  ready_for_pickup: {
    label: "Ready for pickup",
    tone: "ready",
    progress: "The order is ready and waiting for the assigned driver.",
  },
  picked_up: {
    label: "Picked up",
    tone: "transit",
    progress: "The driver collected the order and is heading to the destination.",
  },
  on_the_way: {
    label: "On the way",
    tone: "transit",
    progress: "The driver is travelling to the customer.",
  },
};

function hasCoordinates(latitude: number | null, longitude: number | null) {
  return latitude !== null && longitude !== null && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

function getDeliveryStatus(status: string | null): DeliveryStatusDisplay {
  return deliveryStatusDisplay[status ?? ""] ?? {
    label: status?.replace(/_/g, " ") || "Unknown status",
    tone: "unknown",
    progress: "Delivery status is being updated.",
  };
}

function matchesDeliveryFilter(delivery: VenueActiveDelivery, filter: DeliveryFilter) {
  switch (filter) {
    case "active":
      return true;
    case "prepare":
      return ["pending", "venue_confirmed"].includes(delivery.status ?? "");
    case "ready":
      return delivery.status === "ready_for_pickup";
    case "assigned":
      return delivery.status === "driver_assigned";
    case "transit":
      return ["picked_up", "on_the_way"].includes(delivery.status ?? "");
  }
}

function getDeliveryAction(delivery: VenueActiveDelivery): DeliveryAction | null {
  if (!delivery.order_id) return null;

  if (delivery.status === "pending") {
    return { label: "Accept delivery", icon: Check };
  }

  if (["venue_confirmed", "driver_assigned"].includes(delivery.status ?? "")) {
    return { label: "Mark ready for pickup", icon: PackageCheck };
  }

  return null;
}

function getDeliveryReference(delivery: VenueActiveDelivery, orderNumber?: number | null) {
  return orderNumber?.toString() || delivery.order_id?.slice(0, 8).toUpperCase() || delivery.id.slice(0, 8).toUpperCase();
}

function getDriverLabel(vehicleType: string | null | undefined) {
  if (!vehicleType) return "Assigned driver";
  return `${vehicleType.replace(/[_-]+/g, " ")} driver`;
}

export default function VenueDeliveryMap() {
  const [venueId, setVenueId] = useState<string | null>(() => localStorage.getItem("jv_current_venue_id"));
  const [token, setToken] = useState<string | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [actioningDeliveryId, setActioningDeliveryId] = useState<string | null>(null);
  const [, setRouteVersion] = useState(0);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const pickupMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const dropoffMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const driverMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const routesRef = useRef<Map<string, RouteData>>(new Map());

  useEffect(() => {
    document.title = "Venue Delivery Map | JV";
  }, []);

  useEffect(() => {
    if (venueId) return;

    const resolveVenue = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      let resolvedVenueId = venue?.id ?? null;

      if (!resolvedVenueId) {
        const { data: link } = await supabase
          .from("employee_venue_links")
          .select("venue_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        resolvedVenueId = link?.venue_id ?? null;
      }

      if (resolvedVenueId) {
        localStorage.setItem("jv_current_venue_id", resolvedVenueId);
        setVenueId(resolvedVenueId);
      }
    };

    void resolveVenue();
  }, [venueId]);

  useEffect(() => {
    let cancelled = false;

    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        if (error) throw error;
        if (!cancelled) setToken(data?.token || null);
      } catch {
        if (!cancelled) setToken(null);
      }
    };

    void fetchToken();
    return () => {
      cancelled = true;
    };
  }, []);

  const { deliveries, driverLocations, loading, stats, refreshDeliveries } = useVenueActiveDeliveries(venueId);
  const { deliveryOrders, acceptDeliveryOrder, markReadyForPickup } = useVenueDeliveryOrders(venueId);

  const deliveriesWithCoords = useMemo(
    () => deliveries.filter((delivery) => hasCoordinates(delivery.delivery_latitude, delivery.delivery_longitude)),
    [deliveries],
  );

  const getDeliveryDetails = useCallback(
    (delivery: VenueActiveDelivery) => (delivery.order_id ? deliveryOrders.get(delivery.order_id) : undefined),
    [deliveryOrders],
  );

  const filteredDeliveries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return deliveries.filter((delivery) => {
      if (!matchesDeliveryFilter(delivery, deliveryFilter)) return false;
      if (!query) return true;

      const details = getDeliveryDetails(delivery);
      const searchableText = [
        delivery.id,
        delivery.order_id,
        delivery.delivery_address,
        delivery.pickup_address,
        delivery.status,
        details?.customerName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [deliveries, deliveryFilter, getDeliveryDetails, searchQuery]);

  useEffect(() => {
    setSelectedDeliveryId((currentId) => (
      currentId && filteredDeliveries.some((delivery) => delivery.id === currentId)
        ? currentId
        : filteredDeliveries[0]?.id ?? null
    ));
  }, [filteredDeliveries]);

  const deliveryCounts = useMemo(
    () => deliveryFilters.reduce((counts, filter) => {
      counts[filter.id] = deliveries.filter((delivery) => matchesDeliveryFilter(delivery, filter.id)).length;
      return counts;
    }, {} as Record<DeliveryFilter, number>),
    [deliveries],
  );

  const selectedDelivery = filteredDeliveries.find((delivery) => delivery.id === selectedDeliveryId) ?? null;
  const selectedDeliveryDetails = selectedDelivery ? getDeliveryDetails(selectedDelivery) : undefined;
  const selectedDriverLocation = selectedDelivery?.driver_id
    ? driverLocations.get(selectedDelivery.driver_id)
    : undefined;
  const selectedDeliveryStatus = selectedDelivery ? getDeliveryStatus(selectedDelivery.status) : null;
  const selectedDeliveryAction = selectedDelivery ? getDeliveryAction(selectedDelivery) : null;
  const SelectedDeliveryActionIcon = selectedDeliveryAction?.icon;

  const fetchRoute = useCallback(async (
    start: [number, number],
    end: [number, number],
  ): Promise<{ geometry: GeoJSON.Feature<GeoJSON.Geometry>; duration: number } | null> => {
    if (!token) return null;

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${token}`,
      );
      const data = await response.json() as { routes?: { duration: number; geometry: GeoJSON.Geometry }[] };
      const route = data.routes?.[0];

      if (route) {
        return {
          geometry: { type: "Feature", properties: {}, geometry: route.geometry },
          duration: Math.round(route.duration / 60),
        };
      }
    } catch (error) {
      console.error("Failed to fetch route:", error);
    }

    return null;
  }, [token]);

  useEffect(() => {
    if (!token || !mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/navigation-night-v1",
      center: [153.0251, -27.4698],
      zoom: 12,
      pitch: 30,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => setMapLoaded(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !token) return;

    let cancelled = false;
    const mapStyles = getComputedStyle(map.getContainer());
    const pickupToDropoffColor = mapStyles.getPropertyValue("--deliveries-warning").trim() || "rgb(249, 115, 22)";
    const driverToPickupColor = mapStyles.getPropertyValue("--deliveries-cyan").trim() || "rgb(22, 217, 232)";
    const removeRouteSegment = (deliveryId: string, segment: "pickup-dropoff" | "driver-pickup") => {
      const sourceId = `route-${segment}-${deliveryId}`;
      if (map.getLayer(sourceId)) map.removeLayer(sourceId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };

    const upsertRouteSegment = (
      deliveryId: string,
      segment: "pickup-dropoff" | "driver-pickup",
      data: GeoJSON.Feature<GeoJSON.Geometry>,
      color: string,
      dashed = false,
    ) => {
      const sourceId = `route-${segment}-${deliveryId}`;
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;

      if (source) {
        source.setData(data);
      } else {
        map.addSource(sourceId, { type: "geojson", data });
      }

      if (!map.getLayer(sourceId)) {
        map.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": color,
            "line-width": 4,
            "line-opacity": dashed ? 0.8 : 0.9,
            ...(dashed ? { "line-dasharray": [2, 1] } : {}),
          },
        });
      }
    };

    const updateRoutes = async () => {
      const activeIds = new Set(deliveries.map((delivery) => delivery.id));

      for (const deliveryId of routesRef.current.keys()) {
        if (!activeIds.has(deliveryId)) {
          removeRouteSegment(deliveryId, "pickup-dropoff");
          removeRouteSegment(deliveryId, "driver-pickup");
          routesRef.current.delete(deliveryId);
        }
      }

      for (const delivery of deliveries) {
        if (cancelled || !hasCoordinates(delivery.pickup_latitude, delivery.pickup_longitude) || !hasCoordinates(delivery.delivery_latitude, delivery.delivery_longitude)) {
          continue;
        }

        const pickupCoords: [number, number] = [Number(delivery.pickup_longitude), Number(delivery.pickup_latitude)];
        const dropoffCoords: [number, number] = [Number(delivery.delivery_longitude), Number(delivery.delivery_latitude)];
        const routeData = routesRef.current.get(delivery.id) ?? {
          pickupToDropoff: null,
          driverToPickup: null,
          driverToPickupDuration: null,
          pickupToDropoffDuration: null,
        };

        if (!routeData.pickupToDropoff) {
          const pickupRoute = await fetchRoute(pickupCoords, dropoffCoords);
          if (pickupRoute) {
            routeData.pickupToDropoff = pickupRoute.geometry;
            routeData.pickupToDropoffDuration = pickupRoute.duration;
          }
        }

        if (cancelled) return;

        if (routeData.pickupToDropoff) {
          upsertRouteSegment(delivery.id, "pickup-dropoff", routeData.pickupToDropoff, pickupToDropoffColor, true);
        }

        const driverLocation = delivery.driver_id ? driverLocations.get(delivery.driver_id) : undefined;
        if (driverLocation && hasCoordinates(driverLocation.current_latitude, driverLocation.current_longitude)) {
          const driverCoords: [number, number] = [Number(driverLocation.current_longitude), Number(driverLocation.current_latitude)];
          const driverRoute = await fetchRoute(driverCoords, pickupCoords);

          if (driverRoute) {
            routeData.driverToPickup = driverRoute.geometry;
            routeData.driverToPickupDuration = driverRoute.duration;
            upsertRouteSegment(delivery.id, "driver-pickup", driverRoute.geometry, driverToPickupColor);
          }
        } else {
          routeData.driverToPickup = null;
          routeData.driverToPickupDuration = null;
          removeRouteSegment(delivery.id, "driver-pickup");
        }

        routesRef.current.set(delivery.id, routeData);
      }

      if (!cancelled) setRouteVersion((version) => version + 1);
    };

    void updateRoutes();
    return () => {
      cancelled = true;
    };
  }, [deliveries, driverLocations, fetchRoute, mapLoaded, token]);

  const animateDriverMarker = useCallback((marker: mapboxgl.Marker, targetLng: number, targetLat: number) => {
    const currentPosition = marker.getLngLat();
    if (Math.abs(currentPosition.lng - targetLng) < 0.00001 && Math.abs(currentPosition.lat - targetLat) < 0.00001) return;

    const startTime = performance.now();
    const duration = 1000;
    const animate = (currentTime: number) => {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      marker.setLngLat([
        currentPosition.lng + (targetLng - currentPosition.lng) * eased,
        currentPosition.lat + (targetLat - currentPosition.lat) * eased,
      ]);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const ensureMarker = (
      reference: MutableRefObject<Map<string, mapboxgl.Marker>>,
      key: string,
      lngLat: [number, number],
      kind: "pickup" | "dropoff" | "driver",
      popupText: string,
    ) => {
      const existingMarker = reference.current.get(key);
      if (existingMarker) {
        if (kind === "driver") animateDriverMarker(existingMarker, lngLat[0], lngLat[1]);
        else existingMarker.setLngLat(lngLat);
        return;
      }

      const markerElement = document.createElement("div");
      markerElement.className = `venue-deliveries-map-marker venue-deliveries-map-marker--${kind}`;
      markerElement.setAttribute("role", "img");
      markerElement.setAttribute("aria-label", kind === "driver" ? "Driver location" : kind === "pickup" ? "Pickup location" : "Delivery location");

      const marker = new mapboxgl.Marker({ element: markerElement })
        .setLngLat(lngLat)
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(popupText))
        .addTo(map);

      reference.current.set(key, marker);
    };

    const cleanupMarkers = (reference: MutableRefObject<Map<string, mapboxgl.Marker>>, aliveIds: Set<string>) => {
      for (const [key, marker] of reference.current.entries()) {
        if (!aliveIds.has(key)) {
          marker.remove();
          reference.current.delete(key);
        }
      }
    };

    const pickupIds = new Set<string>();
    const dropoffIds = new Set<string>();
    const driverIds = new Set<string>();

    deliveries.forEach((delivery) => {
      if (hasCoordinates(delivery.pickup_latitude, delivery.pickup_longitude)) {
        pickupIds.add(delivery.id);
        ensureMarker(
          pickupMarkersRef,
          delivery.id,
          [Number(delivery.pickup_longitude), Number(delivery.pickup_latitude)],
          "pickup",
          `Pickup: ${delivery.pickup_address || "Venue"}`,
        );
      }

      if (hasCoordinates(delivery.delivery_latitude, delivery.delivery_longitude)) {
        dropoffIds.add(delivery.id);
        ensureMarker(
          dropoffMarkersRef,
          delivery.id,
          [Number(delivery.delivery_longitude), Number(delivery.delivery_latitude)],
          "dropoff",
          `Delivery: ${delivery.delivery_address}`,
        );
      }

      const driverLocation = delivery.driver_id ? driverLocations.get(delivery.driver_id) : undefined;
      if (driverLocation && hasCoordinates(driverLocation.current_latitude, driverLocation.current_longitude)) {
        driverIds.add(delivery.id);
        ensureMarker(
          driverMarkersRef,
          delivery.id,
          [Number(driverLocation.current_longitude), Number(driverLocation.current_latitude)],
          "driver",
          `Driver: ${getDriverLabel(driverLocation.vehicle_type)}`,
        );
      }
    });

    cleanupMarkers(pickupMarkersRef, pickupIds);
    cleanupMarkers(dropoffMarkersRef, dropoffIds);
    cleanupMarkers(driverMarkersRef, driverIds);

    if (deliveriesWithCoords.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      deliveriesWithCoords.forEach((delivery) => {
        bounds.extend([Number(delivery.delivery_longitude), Number(delivery.delivery_latitude)]);
        if (hasCoordinates(delivery.pickup_latitude, delivery.pickup_longitude)) {
          bounds.extend([Number(delivery.pickup_longitude), Number(delivery.pickup_latitude)]);
        }
      });
      map.fitBounds(bounds, { padding: 64, maxZoom: 14 });
    }
  }, [animateDriverMarker, deliveries, deliveriesWithCoords, driverLocations, mapLoaded]);

  const getETA = useCallback((deliveryId: string) => {
    const routeData = routesRef.current.get(deliveryId);
    return {
      toPickup: routeData?.driverToPickupDuration ?? null,
      toDropoff: routeData?.pickupToDropoffDuration ?? null,
    };
  }, []);

  const selectedDeliveryEta = selectedDelivery ? getETA(selectedDelivery.id) : null;
  const selectedTotalEta = selectedDeliveryEta
    ? (selectedDeliveryEta.toPickup ?? 0) + (selectedDeliveryEta.toDropoff ?? 0)
    : 0;
  const missingCoordsCount = deliveries.length - deliveriesWithCoords.length;

  const handleRefresh = async () => {
    await refreshDeliveries();
    toast.success("Deliveries refreshed");
  };

  const handleDeliveryAction = async (delivery: VenueActiveDelivery) => {
    if (!delivery.order_id) return;

    setActioningDeliveryId(delivery.id);
    try {
      if (delivery.status === "pending") {
        await acceptDeliveryOrder(delivery.id, delivery.order_id);
      } else if (["venue_confirmed", "driver_assigned"].includes(delivery.status ?? "")) {
        await markReadyForPickup(delivery.id, delivery.order_id);
      }
    } finally {
      setActioningDeliveryId(null);
    }
  };

  return (
    <div className="venue-deliveries-page">
      <header className="venue-deliveries-heading">
        <div>
          <h1>Deliveries</h1>
          <p>Track active handoffs and keep customers informed from one queue.</p>
        </div>
        <button className="venue-deliveries-button venue-deliveries-button--secondary" type="button" onClick={() => void handleRefresh()}>
          <RefreshCw className={loading ? "venue-deliveries-spin" : undefined} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </header>

      <section className="venue-deliveries-metrics" aria-label="Delivery metrics">
        <article className="venue-deliveries-metric">
          <span className="venue-deliveries-metric__icon"><Bike aria-hidden="true" /></span>
          <div><span>Active deliveries</span><strong>{stats.activeCount}</strong><small>Currently in service</small></div>
        </article>
        <article className="venue-deliveries-metric">
          <span className="venue-deliveries-metric__icon"><PackageCheck aria-hidden="true" /></span>
          <div><span>Ready for collection</span><strong>{deliveryCounts.ready}</strong><small>Needs driver pickup</small></div>
        </article>
        <article className="venue-deliveries-metric">
          <span className="venue-deliveries-metric__icon"><UserRound aria-hidden="true" /></span>
          <div><span>Assigned drivers</span><strong>{stats.assignedCount}</strong><small>{deliveryCounts.transit} in transit</small></div>
        </article>
        <article className="venue-deliveries-metric">
          <span className="venue-deliveries-metric__icon"><MapPin aria-hidden="true" /></span>
          <div><span>Mapped destinations</span><strong>{deliveriesWithCoords.length}</strong><small>{missingCoordsCount ? `${missingCoordsCount} need coordinates` : "All active locations mapped"}</small></div>
        </article>
      </section>

      <section className="venue-deliveries-tools" aria-label="Delivery filters">
        <div className="venue-deliveries-tabs" role="tablist" aria-label="Delivery status">
          {deliveryFilters.map((filter) => {
            const isActive = deliveryFilter === filter.id;
            return (
              <button
                key={filter.id}
                className={`venue-deliveries-tab${isActive ? " venue-deliveries-tab--active" : ""}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setDeliveryFilter(filter.id)}
              >
                <span>{filter.label}</span>
                <b>{deliveryCounts[filter.id]}</b>
              </button>
            );
          })}
        </div>
        <label className="venue-deliveries-search" htmlFor="delivery-search">
          <Search aria-hidden="true" />
          <input
            id="delivery-search"
            type="search"
            placeholder="Search order, customer, or address"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </section>

      <section className="venue-deliveries-workspace">
        <section className="venue-deliveries-queue" aria-labelledby="delivery-queue-title">
          <div className="venue-deliveries-queue__heading">
            <div>
              <p>LIVE QUEUE</p>
              <h2 id="delivery-queue-title">
                {deliveryFilter === "active" ? "Active handoffs" : `${deliveryFilters.find((filter) => filter.id === deliveryFilter)?.label} deliveries`} <span>{filteredDeliveries.length}</span>
              </h2>
            </div>
            <span>{filteredDeliveries.length ? `${filteredDeliveries.length} ${filteredDeliveries.length === 1 ? "delivery" : "deliveries"} in view` : "No deliveries in view"}</span>
          </div>

          <div className="venue-deliveries-queue__columns" aria-hidden="true">
            <span />
            <span>Order</span>
            <span>Customer &amp; destination</span>
            <span>Driver</span>
            <span>Status</span>
          </div>

          <div className="venue-deliveries-list" role="listbox" aria-label="Delivery queue">
            {filteredDeliveries.map((delivery) => {
              const details = getDeliveryDetails(delivery);
              const status = getDeliveryStatus(delivery.status);
              const driverLocation = delivery.driver_id ? driverLocations.get(delivery.driver_id) : undefined;
              const isSelected = delivery.id === selectedDelivery?.id;
              const driverLabel = getDriverLabel(driverLocation?.vehicle_type);

              return (
                <article
                  key={delivery.id}
                  className={`venue-deliveries-row${isSelected ? " venue-deliveries-row--selected" : ""}`}
                  role="option"
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => setSelectedDeliveryId(delivery.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedDeliveryId(delivery.id);
                    }
                  }}
                >
                  <span className="venue-deliveries-row__select" aria-hidden="true" />
                  <span className="venue-deliveries-row__main">
                    <span className="venue-deliveries-row__number">#{getDeliveryReference(delivery, details?.orderNumber)}</span>
                    <span className="venue-deliveries-row__total">
                      {details ? `$${details.deliveryFee.toFixed(2)} fee` : "Delivery order"}
                      <small>{delivery.pickup_address || "Pickup address pending"}</small>
                    </span>
                  </span>
                  <span className="venue-deliveries-row__destination">
                    <strong>{details?.customerName || "Customer"}</strong>
                    <small><MapPin aria-hidden="true" />{delivery.delivery_address}</small>
                  </span>
                  <span className={`venue-deliveries-row__driver${delivery.driver_id ? "" : " venue-deliveries-row__driver--unassigned"}`}>
                    {delivery.driver_id ? <><i>{driverLabel.charAt(0).toUpperCase()}</i>{driverLabel}</> : <><UserRound aria-hidden="true" />Unassigned</>}
                  </span>
                  <span className={`venue-deliveries-status venue-deliveries-status--${status.tone}`}>{status.label}</span>
                </article>
              );
            })}
          </div>

          {!loading && filteredDeliveries.length === 0 && <p className="venue-deliveries-empty">No deliveries match these filters.</p>}
          {loading && <p className="venue-deliveries-empty">Loading active deliveries...</p>}
        </section>

        <aside className="venue-deliveries-detail" aria-live="polite" aria-labelledby="delivery-detail-title">
          {selectedDelivery && selectedDeliveryStatus ? (
            <>
              <div className="venue-deliveries-detail__heading">
                <div>
                  <p>SELECTED DELIVERY</p>
                  <h2 id="delivery-detail-title">#{getDeliveryReference(selectedDelivery, selectedDeliveryDetails?.orderNumber)}</h2>
                </div>
                <span className={`venue-deliveries-status venue-deliveries-status--${selectedDeliveryStatus.tone}`}>{selectedDeliveryStatus.label}</span>
              </div>

              <div className="venue-deliveries-detail__customer">
                <span><UserRound aria-hidden="true" /></span>
                <div><strong>{selectedDeliveryDetails?.customerName || "Customer"}</strong><small>{selectedDelivery.delivery_address}</small></div>
              </div>

              <dl className="venue-deliveries-detail__meta">
                <div><dt>Delivery fee</dt><dd>${(selectedDeliveryDetails?.deliveryFee ?? selectedDelivery.delivery_fee ?? 0).toFixed(2)}</dd></div>
                <div><dt>Map route</dt><dd>{selectedDeliveryEta?.toDropoff ? `${selectedDeliveryEta.toDropoff} min` : "Calculating"}</dd></div>
                <div><dt>Timing</dt><dd>{selectedTotalEta > 0 ? `~${selectedTotalEta} min total` : "Live tracking"}</dd></div>
              </dl>

              <section className="venue-deliveries-detail__progress">
                <h3>Delivery progress</h3>
                <p>{selectedDeliveryStatus.progress}</p>
              </section>

              <section className="venue-deliveries-detail__driver">
                <span><Bike aria-hidden="true" /></span>
                <div><small>Driver</small><strong>{selectedDelivery.driver_id ? getDriverLabel(selectedDriverLocation?.vehicle_type) : "Awaiting driver"}</strong></div>
              </section>

              {selectedDeliveryDetails?.specialInstructions && (
                <section className="venue-deliveries-note">
                  <MessageSquareText aria-hidden="true" />
                  <p>{selectedDeliveryDetails.specialInstructions}</p>
                </section>
              )}

              {selectedDeliveryAction && SelectedDeliveryActionIcon && (
                <button
                  className="venue-deliveries-button venue-deliveries-button--primary venue-deliveries-detail__advance"
                  type="button"
                  disabled={actioningDeliveryId === selectedDelivery.id}
                  onClick={() => void handleDeliveryAction(selectedDelivery)}
                >
                  <SelectedDeliveryActionIcon aria-hidden="true" />
                  <span>{actioningDeliveryId === selectedDelivery.id ? "Updating..." : selectedDeliveryAction.label}</span>
                </button>
              )}
            </>
          ) : (
            <div className="venue-deliveries-detail__empty">
              <Truck aria-hidden="true" />
              <p>Select an active delivery to review live tracking.</p>
            </div>
          )}

          <section className="venue-deliveries-map" aria-label="Live delivery map">
            <div ref={mapContainerRef} className="venue-deliveries-map__canvas" />
            <div className="venue-deliveries-map__legend">
              <span><i /><b>Driver to pickup</b></span>
              <span><i /><b>Pickup to dropoff</b></span>
            </div>
            {!token && <p className="venue-deliveries-map__unavailable">Map token is unavailable. Check the backend token configuration.</p>}
            {token && missingCoordsCount > 0 && <p className="venue-deliveries-map__notice">{missingCoordsCount} active {missingCoordsCount === 1 ? "delivery is" : "deliveries are"} missing map coordinates.</p>}
          </section>
        </aside>
      </section>
    </div>
  );
}

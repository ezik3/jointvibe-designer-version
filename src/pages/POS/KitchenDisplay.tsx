import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CheckCircle, Truck, MapPin, AlertTriangle, Monitor, MonitorOff } from "lucide-react";
import { useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import { useVenueDeliveryOrders } from "@/hooks/useVenueDeliveryOrders";
import { useDeliveryNotification } from "@/hooks/useDeliveryNotification";
import { useWakeLock } from "@/hooks/useWakeLock";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { sortByUrgency, getUrgencyBadge, formatOrderETA } from "@/utils/orderUrgency";
import { useTranslation } from 'react-i18next';

export default function KitchenDisplay() {
  const { t } = useTranslation('pos');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [completedToday, setCompletedToday] = useState(0);
  const [avgTime, setAvgTime] = useState(12);

  // Wake lock for keeping screen on
  const { isSupported: wakeLockSupported, isActive: wakeLockActive, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

  useEffect(() => {
    const storedVenueId = localStorage.getItem('jv_current_venue_id');
    if (storedVenueId) setVenueId(storedVenueId);
  }, []);

  const { orders, getKitchenOrders, updateOrderStatus, stats } = useVenueOrdersDB(venueId);
  const { deliveryOrders, markReadyForPickup } = useVenueDeliveryOrders(venueId);
  
  // Enable delivery notifications with audio
  useDeliveryNotification({
    venueId,
    enabled: true,
  });

  // Get active kitchen orders (pending + preparing)
  const kitchenOrders = getKitchenOrders();

  // Calculate completed today from served orders
  useEffect(() => {
    setCompletedToday(stats.servedToday);
  }, [stats.servedToday]);

  const handleMarkComplete = (orderId: string) => {
    pinOrder(orderId);
    updateOrderStatus(orderId, "ready");
  };

  // Grace period: pin "ready" orders in position for 10 seconds
  const [pinnedOrders, setPinnedOrders] = useState<Map<string, number>>(new Map());
  const pinnedTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const pinOrder = useCallback((orderId: string) => {
    setPinnedOrders(prev => new Map(prev).set(orderId, 10));
    const existing = pinnedTimersRef.current.get(orderId);
    if (existing) clearInterval(existing);
    
    const interval = setInterval(() => {
      setPinnedOrders(prev => {
        const next = new Map(prev);
        const remaining = (next.get(orderId) || 0) - 1;
        if (remaining <= 0) {
          next.delete(orderId);
          clearInterval(interval);
          pinnedTimersRef.current.delete(orderId);
        } else {
          next.set(orderId, remaining);
        }
        return next;
      });
    }, 1000);
    pinnedTimersRef.current.set(orderId, interval);
  }, []);

  useEffect(() => {
    return () => { pinnedTimersRef.current.forEach(t => clearInterval(t)); };
  }, []);

  const handleBumpOrder = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const deliveryInfo = deliveryOrders.get(orderId);
    
    if (order.status === "pending") {
      updateOrderStatus(orderId, "preparing");
    } else if (order.status === "preparing") {
      pinOrder(orderId);
      updateOrderStatus(orderId, "ready");
      if (deliveryInfo) {
        markReadyForPickup(deliveryInfo.id, orderId);
      }
    }
  };

  const sortWithGracePeriod = useCallback((ordersList: typeof kitchenOrders) => {
    const sorted = sortByUrgency(ordersList);
    if (pinnedOrders.size === 0) return sorted;
    const pinned = sorted.filter(o => pinnedOrders.has(o.id));
    const unpinned = sorted.filter(o => !pinnedOrders.has(o.id));
    return [...pinned, ...unpinned];
  }, [pinnedOrders]);

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: false });
    } catch {
      return "Just now";
    }
  };

  // Count delivery orders in kitchen
  const deliveryCount = kitchenOrders.filter(o => deliveryOrders.has(o.id)).length;

  // Toggle screen wake lock
  const toggleWakeLock = async () => {
    if (wakeLockActive) {
      await releaseWakeLock();
      toast.info('Screen will now turn off normally');
    } else {
      const success = await requestWakeLock();
      if (success) {
        toast.success('Screen will stay on');
      } else {
        toast.error('Could not keep screen on');
      }
    }
  };

  return (
    <div className="p-6 bg-background min-h-screen">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold mb-2">Kitchen Display System</h1>
          {wakeLockSupported && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleWakeLock}
              className={wakeLockActive ? 'border-green-500 text-green-500' : ''}
            >
              {wakeLockActive ? (
                <>
                  <Monitor className="w-4 h-4 mr-2" />
                  Screen On
                </>
              ) : (
                <>
                  <MonitorOff className="w-4 h-4 mr-2" />
                  Keep On
                </>
              )}
            </Button>
          )}
        </div>
        <div className="flex gap-6 text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Avg. Time: {avgTime} min</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            <span>Completed Today: {completedToday}</span>
          </div>
          {deliveryCount > 0 && (
            <div className="flex items-center gap-2 text-orange-400">
              <Truck className="h-4 w-4" />
              <span>{deliveryCount} Delivery Orders</span>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="grid" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="grid">Grid View</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="space-y-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortWithGracePeriod(kitchenOrders).map((order) => {
              const deliveryInfo = deliveryOrders.get(order.id);
              const isDelivery = !!deliveryInfo;
              const urgency = getUrgencyBadge(order);
              const eta = formatOrderETA(order);

              return (
                <Card 
                  key={order.id} 
                  className={`glass transition-all ${
                    isDelivery 
                      ? "border-orange-500/50 bg-orange-500/10 hover:border-orange-500" 
                      : "border-primary/20 hover:border-primary/40"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-2xl font-bold">#{order.orderNumber}</CardTitle>
                          {isDelivery && (
                            <Badge className="bg-orange-500/20 text-orange-400 gap-1 animate-pulse">
                              <Truck className="h-3 w-3" />
                              DELIVERY
                            </Badge>
                          )}
                          <Badge className={`${urgency.colorClass} text-xs`}>{urgency.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {isDelivery ? "Delivery Order" : `Table ${order.tableNumber}`} • {eta}
                        </p>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={`text-lg px-3 py-1 ${
                          order.status === "pending" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        {formatTime(order.createdAt)}
                      </Badge>
                    </div>
                    
                    {/* Delivery Address */}
                    {isDelivery && deliveryInfo && (
                      <div className="mt-2 p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                          <span className="text-orange-300 font-medium">{deliveryInfo.deliveryAddress}</span>
                        </div>
                        {deliveryInfo.specialInstructions && (
                          <div className="flex items-start gap-2 text-xs mt-1">
                            <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5" />
                            <span className="text-yellow-300">{deliveryInfo.specialInstructions}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {order.items.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={`border-l-4 pl-4 space-y-2 ${
                          isDelivery ? "border-orange-500" : "border-primary"
                        }`}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className={`text-xl font-bold ${isDelivery ? "text-orange-400" : "text-primary"}`}>
                            {item.quantity}x
                          </span>
                          <span className="font-semibold text-lg">{item.name}</span>
                        </div>
                        {item.notes && (
                          <p className="text-sm text-muted-foreground italic">• {item.notes}</p>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2 pt-4">
                      <Button 
                        onClick={() => handleBumpOrder(order.id)} 
                        className={`flex-1 ${isDelivery ? "bg-orange-600 hover:bg-orange-700" : "neon-glow"}`}
                        size="lg"
                      >
                        {order.status === "pending" ? "Start" : "Bump Order"}
                      </Button>
                      <Button 
                        onClick={() => handleMarkComplete(order.id)} 
                        variant="outline" 
                        className={`flex-1 ${isDelivery ? "border-orange-500 text-orange-400 hover:bg-orange-500/10" : ""}`}
                        size="lg"
                      >
                        Ready
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          {sortWithGracePeriod(kitchenOrders).map((order) => {
            const deliveryInfo = deliveryOrders.get(order.id);
            const isDelivery = !!deliveryInfo;
            const urgency = getUrgencyBadge(order);
            const eta = formatOrderETA(order);

            return (
              <Card 
                key={order.id} 
                className={`glass ${
                  isDelivery 
                    ? "border-orange-500/50 bg-orange-500/5 border-l-4 border-l-orange-500" 
                    : "border-primary/20"
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <h3 className="text-2xl font-bold">#{order.orderNumber}</h3>
                        <Badge 
                          variant="secondary"
                          className={order.status === "pending" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"}
                        >
                          {formatTime(order.createdAt)}
                        </Badge>
                        {isDelivery ? (
                          <Badge className="bg-orange-500/20 text-orange-400 gap-1 animate-pulse">
                            <Truck className="h-3 w-3" />
                            DELIVERY
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">Table {order.tableNumber}</span>
                        )}
                        <Badge className={`${urgency.colorClass} text-xs`}>{urgency.label}</Badge>
                        <span className="text-xs text-muted-foreground">{eta}</span>
                      </div>
                      
                      {/* Delivery info in list view */}
                      {isDelivery && deliveryInfo && (
                        <div className="mb-3 p-2 bg-orange-500/10 rounded-lg border border-orange-500/20 max-w-md">
                          <div className="flex items-start gap-2 text-sm">
                            <MapPin className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                            <span className="text-orange-300">{deliveryInfo.deliveryAddress}</span>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {order.items.map((item, idx) => (
                          <div 
                            key={idx} 
                            className={`border-l-4 pl-4 ${isDelivery ? "border-orange-500" : "border-primary"}`}
                          >
                            <p className="font-semibold">
                              <span className={isDelivery ? "text-orange-400" : "text-primary"}>
                                {item.quantity}x
                              </span>{" "}
                              {item.name}
                            </p>
                            {item.notes && (
                              <p className="text-sm text-muted-foreground italic">• {item.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 md:w-48">
                      <Button 
                        onClick={() => handleBumpOrder(order.id)} 
                        className={isDelivery ? "bg-orange-600 hover:bg-orange-700" : "neon-glow"}
                      >
                        {order.status === "pending" ? "Start Prep" : "Bump Order"}
                      </Button>
                      <Button 
                        onClick={() => handleMarkComplete(order.id)} 
                        variant="outline"
                        className={isDelivery ? "border-orange-500 text-orange-400 hover:bg-orange-500/10" : ""}
                      >
                        Mark Ready
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {kitchenOrders.length === 0 && (
        <div className="text-center py-20">
          <CheckCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-2xl font-semibold mb-2">All caught up!</h3>
          <p className="text-muted-foreground">No active orders at the moment.</p>
        </div>
      )}
    </div>
  );
}

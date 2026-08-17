import { useState, useEffect } from "react";
import "./pre-orders.css";
import { format, parseISO, isToday, isTomorrow, differenceInMinutes, addMinutes, parse } from "date-fns";
import { Calendar, Clock, Users, Table2, ChefHat, Bell, AlertTriangle, Eye, CheckCircle2, Timer, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReservations, TableReservation } from "@/hooks/useReservations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

export default function PreOrders() {
  const { t } = useTranslation('pos');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [selectedReservation, setSelectedReservation] = useState<TableReservation | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    const storedVenueId = localStorage.getItem("jv_current_venue_id");
    if (storedVenueId) {
      setVenueId(storedVenueId);
    } else {
      // If localStorage is empty, try to fetch venue ID from auth user
      const fetchVenueFromUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: venue } = await supabase
            .from('venues')
            .select('id')
            .eq('owner_user_id', user.id)
            .maybeSingle();
          if (venue) {
            setVenueId(venue.id);
            localStorage.setItem('jv_current_venue_id', venue.id);
          }
        }
      };
      fetchVenueFromUser();
    }
  }, []);

  const { reservations, loading, fetchReservations } = useReservations(venueId);

  useEffect(() => {
    if (venueId) {
      fetchReservations();
    }
  }, [venueId, fetchReservations]);

  // Only show reservations with pre-orders
  const preOrderReservations = reservations.filter(r => r.hasPreOrder && r.status !== "cancelled");

  const getTimeUntilReservation = (reservation: TableReservation): { label: string; urgent: boolean; prepNow: boolean } => {
    const now = new Date();
    const resDate = parseISO(reservation.reservationDate);
    const resTime = parse(reservation.startTime, "HH:mm:ss", resDate);
    const minutesUntil = differenceInMinutes(resTime, now);

    if (minutesUntil < 0) {
      return { label: "Past due", urgent: true, prepNow: false };
    } else if (minutesUntil <= 30) {
      return { label: `${minutesUntil}m - PREP NOW!`, urgent: true, prepNow: true };
    } else if (minutesUntil <= 60) {
      return { label: `${minutesUntil}m - Start prep soon`, urgent: true, prepNow: false };
    } else if (minutesUntil <= 120) {
      return { label: `${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`, urgent: false, prepNow: false };
    } else {
      return { label: format(resTime, "h:mm a"), urgent: false, prepNow: false };
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "EEE, MMM d");
  };

  const filterReservations = (tab: string): TableReservation[] => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");

    switch (tab) {
      case "prep-now":
        return preOrderReservations.filter(r => {
          const resDate = parseISO(r.reservationDate);
          const resTime = parse(r.startTime, "HH:mm:ss", resDate);
          const minutesUntil = differenceInMinutes(resTime, now);
          return r.reservationDate === today && minutesUntil <= 60 && minutesUntil > -30;
        });
      case "upcoming":
        return preOrderReservations.filter(r => r.reservationDate >= today);
      case "completed":
        return preOrderReservations.filter(r => r.status === "completed");
      default:
        return preOrderReservations;
    }
  };

  const fetchOrderItems = async (orderId: string) => {
    const { data, error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    if (!error && data) {
      setOrderItems(data.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price),
        notes: item.notes || undefined,
      })));
    }
  };

  const handleViewDetails = async (reservation: TableReservation) => {
    setSelectedReservation(reservation);
    if (reservation.orderId) {
      await fetchOrderItems(reservation.orderId);
    }
    setShowDetailsModal(true);
  };

  const handleStartPrep = async (reservation: TableReservation) => {
    if (!reservation.orderId) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", reservation.orderId);

    if (error) {
      toast.error("Failed to update order status");
    } else {
      toast.success("Started preparing pre-order!");
      fetchReservations();
    }
  };

  const handleMarkReady = async (reservation: TableReservation) => {
    if (!reservation.orderId) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "ready" })
      .eq("id", reservation.orderId);

    if (error) {
      toast.error("Failed to update order status");
    } else {
      toast.success("Pre-order marked as ready!");
      fetchReservations();
    }
  };

  const filteredList = filterReservations(activeTab);
  const prepNowCount = filterReservations("prep-now").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ChefHat className="w-8 h-8 text-orange-500" />
            Pre-Orders
          </h1>
          <p className="text-muted-foreground">Dine-in reservations with pre-ordered meals</p>
        </div>
        
        {prepNowCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/20 rounded-xl border border-red-500/30 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400 font-bold">{prepNowCount} orders need prep now!</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="pos-preorders">
        <TabsList className="pos-preorders__tabs bg-muted/50">
          <TabsTrigger value="prep-now" className="pos-preorders__tab pos-preorders__tab--prep relative">
            <Timer className="pos-preorders__tab-icon w-4 h-4 mr-2" />
            Prep Now
            {prepNowCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                {prepNowCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="pos-preorders__tab">
            <Calendar className="pos-preorders__tab-icon w-4 h-4 mr-2" />
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="completed" className="pos-preorders__tab">
            <CheckCircle2 className="pos-preorders__tab-icon w-4 h-4 mr-2" />
            Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading pre-orders...</div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-12">
              <ChefHat className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">
                {activeTab === "prep-now" 
                  ? "No orders need immediate prep" 
                  : "No pre-orders found"}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredList.map((reservation) => {
                const timing = getTimeUntilReservation(reservation);
                return (
                  <Card 
                    key={reservation.id} 
                    className={`p-4 transition-all ${
                      timing.prepNow 
                        ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20" 
                        : timing.urgent
                          ? "border-orange-500/50 bg-orange-500/5"
                          : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        {/* Time Column */}
                        <div className={`text-center min-w-[100px] p-3 rounded-xl ${
                          timing.prepNow 
                            ? "bg-red-500/20" 
                            : timing.urgent 
                              ? "bg-orange-500/20" 
                              : "bg-muted"
                        }`}>
                          <div className="text-sm text-muted-foreground">{getDateLabel(reservation.reservationDate)}</div>
                          <div className={`text-xl font-bold ${timing.prepNow ? "text-red-400" : timing.urgent ? "text-orange-400" : ""}`}>
                            {reservation.startTime.slice(0, 5)}
                          </div>
                          <div className={`text-xs mt-1 ${timing.prepNow ? "text-red-400 font-bold" : timing.urgent ? "text-orange-400" : "text-muted-foreground"}`}>
                            {timing.label}
                          </div>
                        </div>

                        {/* Details Column */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-lg">{reservation.customerName}</span>
                            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                              <Utensils className="w-3 h-3 mr-1" />
                              Pre-Order
                            </Badge>
                          </div>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {reservation.partySize} guests
                            </span>
                            {reservation.tableName && (
                              <span className="flex items-center gap-1">
                                <Table2 className="w-4 h-4" />
                                Table {reservation.tableName}
                              </span>
                            )}
                          </div>

                          {reservation.orderTotal && (
                            <div className="text-lg font-bold text-orange-400">
                              Order Total: ${reservation.orderTotal.toFixed(2)}
                            </div>
                          )}

                          {reservation.specialRequests && (
                            <p className="text-sm text-muted-foreground italic">
                              Note: {reservation.specialRequests}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions Column */}
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(reservation)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View Items
                        </Button>

                        {timing.prepNow && (
                          <Button
                            size="sm"
                            className="bg-orange-600 hover:bg-orange-700"
                            onClick={() => handleStartPrep(reservation)}
                          >
                            <ChefHat className="w-4 h-4 mr-1" />
                            Start Prep
                          </Button>
                        )}

                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleMarkReady(reservation)}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Mark Ready
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="pos-preorders-dialog">
          <DialogHeader className="pos-preorders-dialog__header">
            <DialogTitle className="pos-preorders-dialog__title">
              <ChefHat />
              Pre-Order Details
            </DialogTitle>
          </DialogHeader>
          {selectedReservation && (
            <div className="pos-preorders-dialog__body">
              {/* Customer Info */}
              <div className="pos-preorders-dialog__customer">
                <div>
                  <span>{selectedReservation.customerName}</span>
                  <span>
                    {getDateLabel(selectedReservation.reservationDate)} at {selectedReservation.startTime.slice(0, 5)}
                  </span>
                </div>
                <div className="pos-preorders-dialog__customer-meta">
                  <span>
                    <Users />
                    {selectedReservation.partySize} guests
                  </span>
                  {selectedReservation.tableName && (
                    <span>
                      <Table2 />
                      Table {selectedReservation.tableName}
                    </span>
                  )}
                </div>
              </div>

              {/* Order Items */}
              <div className="pos-preorders-dialog__items">
                <h4>Order Items</h4>
                <div className="pos-preorders-dialog__item-list">
                  {orderItems.map((item) => (
                    <div key={item.id} className="pos-preorders-dialog__item">
                      <div>
                        <span>{item.quantity}x {item.name}</span>
                        {item.notes && (
                          <p>{item.notes}</p>
                        )}
                      </div>
                      <span>${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="pos-preorders-dialog__total">
                  <span>Total</span>
                  <span>
                    ${selectedReservation.orderTotal?.toFixed(2) || "0.00"}
                  </span>
                </div>
              </div>

              {selectedReservation.specialRequests && (
                <div className="pos-preorders-dialog__special">
                  <strong>Special Requests</strong>
                  <p>{selectedReservation.specialRequests}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

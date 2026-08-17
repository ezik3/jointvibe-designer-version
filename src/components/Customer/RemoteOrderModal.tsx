import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Plus, Minus, ShoppingCart, Trash2, Flame, MapPin, Truck, ShoppingBag, UtensilsCrossed, Clock, ChefHat, CheckCircle2, Package, CalendarDays, Wallet, CreditCard, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useDeliveryFee } from "@/hooks/useDeliveryFee";
import { calculatePlatformFee } from "@/config/platformFees";
import { useReservations } from "@/hooks/useReservations";
import { OrderTrackingModal } from "./OrderTrackingModal";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { ReservationFlow } from "./Reservation/ReservationFlow";
import { recordTierEvent } from "@/hooks/useUserTier";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
interface MenuItemSize {
  id: string;
  name: string;
  price: number;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  sizes: MenuItemSize[];
  imageUrl: string;
  available: boolean;
  preparationTime?: number;
}

interface CartItem {
  id: string;
  menuItem: MenuItem;
  selectedSize: MenuItemSize | null;
  quantity: number;
}

interface RemoteOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  venueLatitude?: number;
  venueLongitude?: number;
  venueAddress?: string;
  deliveryEnabled?: boolean;
  reservationsEnabled?: boolean;
  maxDeliveryRadius?: number;
  initialDeliveryFee?: number;
  distanceToUser?: number;
  isTestMode?: boolean;
}

type OrderType = "pickup" | "delivery" | "dine-in";

const RemoteOrderModal = ({ 
  isOpen, 
  onClose, 
  venueId, 
  venueName,
  venueLatitude,
  venueLongitude,
  venueAddress,
  deliveryEnabled = true,
  reservationsEnabled = false,
  maxDeliveryRadius = 20,
  initialDeliveryFee = 0,
  distanceToUser,
  isTestMode = false
}: RemoteOrderModalProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { latitude: userLat, longitude: userLng } = useGeolocation({ enableHighAccuracy: true });
  const { calculateDeliveryFee, calculateDistance } = useDeliveryFee();
  
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [deliveryOrderId, setDeliveryOrderId] = useState<string | null>(null);
  const [showTracking, setShowTracking] = useState(false);
  const [showReservationFlow, setShowReservationFlow] = useState(false);
  const [reservationPreOrderId, setReservationPreOrderId] = useState<string | null>(null);
  const [dineInPaymentOption, setDineInPaymentOption] = useState<"reserve_only" | "deposit" | "full">("deposit");
  
  // Live venue settings — fetched fresh when modal opens to avoid stale props
  const [liveDeliveryEnabled, setLiveDeliveryEnabled] = useState(deliveryEnabled);
  const [liveReservationsEnabled, setLiveReservationsEnabled] = useState(reservationsEnabled);

  useEffect(() => {
    if (!isOpen || !venueId) return;

    // Fetch from BOTH venues table AND venue_modules table, since the venue
    // owner may have toggled features via modules (which doesn't update venues table).
    Promise.all([
      supabase
        .from("venues")
        .select("delivery_enabled, reservations_enabled")
        .eq("id", venueId)
        .maybeSingle(),
      supabase
        .from("venue_modules")
        .select("deliveries, reservations")
        .eq("venue_id", venueId)
        .maybeSingle(),
    ]).then(([venueRes, modulesRes]) => {
      const v = venueRes.data;
      const m = modulesRes.data;

      // Test mode forces all options on; otherwise either DB source or prop is sufficient
      const deliveryOn = isTestMode || !!(v?.delivery_enabled || m?.deliveries || deliveryEnabled);
      const reservationsOn = isTestMode || !!(v?.reservations_enabled || m?.reservations || reservationsEnabled);

      setLiveDeliveryEnabled(deliveryOn);
      setLiveReservationsEnabled(reservationsOn);
    });
  }, [isOpen, venueId, deliveryEnabled, reservationsEnabled, isTestMode]);

  // Order type and delivery details
  const [orderType, setOrderType] = useState<OrderType>(deliveryEnabled ? "delivery" : "pickup");
  const [trackingOrderType, setTrackingOrderType] = useState<OrderType>(deliveryEnabled ? "delivery" : "pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoordinates, setDeliveryCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  
  // Calculate delivery fee
  const distance = distanceToUser || (
    venueLatitude && venueLongitude && userLat && userLng
      ? calculateDistance(venueLatitude, venueLongitude, userLat, userLng)
      : 0
  );
  const deliveryFeeCalc = calculateDeliveryFee(distance);
  const deliveryFee = orderType === "delivery" ? deliveryFeeCalc.fare : 0;

  const fetchMenuItems = useCallback(async () => {
    if (!venueId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("venue_menu_items")
        .select("*")
        .eq("venue_id", venueId)
        .eq("available", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      const items: MenuItem[] = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        category: item.category,
        basePrice: Number(item.base_price),
        sizes: item.sizes || [],
        imageUrl: item.image_url || "",
        available: item.available,
        preparationTime: item.preparation_time,
      }));

      setMenuItems(items);
      
      const uniqueCategories = [...new Set(items.map(item => item.category))];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error("Error fetching menu items:", error);
    }

    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    if (isOpen && venueId) {
      setLoading(true);
      fetchMenuItems();
    }
  }, [isOpen, venueId, fetchMenuItems]);

  const filteredItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (item: MenuItem, size: MenuItemSize | null = null) => {
    const cartItemId = size ? `${item.id}-${size.id}` : item.id;
    
    setCart(prev => {
      const existing = prev.find(c => 
        size 
          ? c.menuItem.id === item.id && c.selectedSize?.id === size.id 
          : c.menuItem.id === item.id && !c.selectedSize
      );
      
      if (existing) {
        return prev.map(c => 
          c.id === existing.id 
            ? { ...c, quantity: c.quantity + 1 } 
            : c
        );
      }
      
      return [...prev, {
        id: cartItemId,
        menuItem: item,
        selectedSize: size,
        quantity: 1
      }];
    });
    
    // Success feedback handled by cart badge update — no toast needed
  };

  const updateCartQuantity = (cartItemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === cartItemId) {
          const newQty = item.quantity + delta;
          return newQty <= 0 ? null : { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.id !== cartItemId));
  };

  const getItemPrice = (item: CartItem) => {
    return item.selectedSize?.price ?? item.menuItem.basePrice;
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0);
  const cartTax = cartSubtotal * 0.1;
  const platformFee = (orderType === "pickup" || orderType === "delivery") ? calculatePlatformFee(cartSubtotal + cartTax + deliveryFee, 'US') : 0;
  const cartTotal = cartSubtotal + cartTax + deliveryFee + platformFee;
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const { linkOrderToReservation } = useReservations(venueId);

  const placeOrder = async () => {
    if (!user) {
      toast.error(t('order.sign_in_required'));
      return;
    }

    if (cart.length === 0) {
      toast.error(t('order.cart_empty_error'));
      return;
    }

    if (orderType === "delivery" && !deliveryAddress.trim()) {
      toast.error(t('order.address_required'));
      return;
    }

    setPlacingOrder(true);

    try {
      const isReservationPreOrder = orderType === "dine-in" && !!reservationPreOrderId;

      let scheduledFor: string | null = null;
      let reservationId: string | null = null;

      if (isReservationPreOrder && reservationPreOrderId) {
        const { data: reservation, error: reservationError } = await supabase
          .from("table_reservations")
          .select("reservation_date, start_time")
          .eq("id", reservationPreOrderId)
          .single();

        if (reservationError) throw reservationError;

        reservationId = reservationPreOrderId;
        scheduledFor = new Date(`${reservation.reservation_date}T${reservation.start_time}`).toISOString();
      }

      // Create the order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          venue_id: venueId,
          customer_name: user.email?.split("@")[0] || "Customer",
          subtotal: cartSubtotal,
          tax: cartTax,
          total: cartTotal,
          status: (orderType === "pickup" || orderType === "delivery") ? "awaiting_payment" : "pending",
          is_preorder: isReservationPreOrder || null,
          reservation_id: reservationId,
          scheduled_for: scheduledFor,
          notes:
            orderType === "delivery"
              ? `DELIVERY ORDER - Address: ${deliveryAddress}${deliveryNotes ? ` | Notes: ${deliveryNotes}` : ""}`
              : orderType === "dine-in"
                ? `DINE-IN PRE-ORDER${deliveryNotes ? ` | Notes: ${deliveryNotes}` : ""}`
                : `PICKUP ORDER${deliveryNotes ? ` | Notes: ${deliveryNotes}` : ""}`,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menuItem.id,
        name: item.menuItem.name + (item.selectedSize ? ` (${item.selectedSize.name})` : ""),
        quantity: item.quantity,
        price: getItemPrice(item),
        image_url: item.menuItem.imageUrl || null,
        notes: item.selectedSize ? `Size: ${item.selectedSize.name}` : null,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      // If dine-in pre-order, link it back to the reservation
      if (isReservationPreOrder && reservationPreOrderId) {
        const ok = await linkOrderToReservation(reservationPreOrderId, order.id);
        if (!ok) toast.error(t('order.preorder_attach_failed'));
      }

      // If delivery, create food_delivery_orders entry
      if (orderType === "delivery") {
        const { data: deliveryData, error: deliveryError } = await supabase
          .from("food_delivery_orders")
          .insert({
            order_id: order.id,
            customer_id: user.id,
            venue_id: venueId,
            pickup_address: venueAddress || venueName,
            pickup_latitude: venueLatitude,
            pickup_longitude: venueLongitude,
            delivery_address: deliveryAddress,
            delivery_latitude: deliveryCoordinates?.lat || userLat,
            delivery_longitude: deliveryCoordinates?.lng || userLng,
            delivery_fee: deliveryFee,
            calculated_delivery_fee: deliveryFee,
            driver_earnings: deliveryFeeCalc.driverEarnings,
            platform_fee: deliveryFeeCalc.platformFee,
            special_instructions: deliveryNotes,
            status: "pending",
          })
          .select()
          .single();

        if (deliveryError) {
          console.error("Delivery order error:", deliveryError);
        } else if (deliveryData) {
          setDeliveryOrderId(deliveryData.id);
        }
      }

      // Tier events: order + spend bonus
      if (user) {
        recordTierEvent(user.id, "order", { order_id: order.id, venue_id: venueId });
        if (cartTotal >= 50) {
          recordTierEvent(user.id, "spend_bonus", { order_id: order.id, venue_id: venueId });
        }
      }

      // Pickup & delivery should immediately continue to payment
      if (orderType === "pickup" || orderType === "delivery") {
        const qrTokenValue = `${crypto.randomUUID()}-${Date.now().toString(36)}`;
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        const { data: paymentRequest, error: paymentRequestError } = await supabase
          .from("payment_requests")
          .insert({
            venue_id: venueId,
            order_id: order.id,
            amount: cartTotal,
            fee: 0.10,
            qr_token: qrTokenValue,
            created_by: user.id,
            expires_at: expiresAt,
            status: "pending",
          })
          .select("qr_token")
          .single();

        if (paymentRequestError || !paymentRequest?.qr_token) {
          throw paymentRequestError || new Error("Failed to create payment request");
        }

        setPlacedOrderId(order.id);
        setTrackingOrderType(orderType);
        setCart([]);
        setShowCart(false);
        setReservationPreOrderId(null);

        onClose();
        navigate(`/app/pay/${paymentRequest.qr_token}`);
        return;
      }

      // No success toast — user sees order confirmation in UI

      setPlacedOrderId(order.id);
      setTrackingOrderType(orderType);
      setShowTracking(true);
      setCart([]);
      setShowCart(false);

      // Reset dine-in preorder state
      setReservationPreOrderId(null);
      if (orderType === "dine-in") setOrderType(deliveryEnabled ? "delivery" : "pickup");
    } catch (error) {
      console.error("Error placing order:", error);
      toast.error(t('order.place_failed'));
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div 
          className="customer-modal-overlay absolute inset-0"
          onClick={onClose}
        />
        
        <motion.div
          className="customer-modal-panel customer-order-modal relative w-full max-w-md h-[90vh] sm:h-[85vh] sm:rounded-[8px] overflow-hidden flex flex-col"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="relative border-b border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] p-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-[var(--customer-modal-text)]">{venueName}</h2>
                <p className="text-sm text-[var(--customer-modal-muted)] flex items-center gap-1">
                  {distance > 0 && <><MapPin className="w-3 h-3" /> {t('order.km_away', { distance: distance.toFixed(1) })}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <motion.button 
                  className="relative w-12 h-12 rounded-[6px] border border-[var(--customer-modal-cyan)] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)] flex items-center justify-center"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowCart(!showCart)}
                >
                  <ShoppingCart className="w-5 h-5" />
                  {cartItemCount > 0 && (
                    <motion.span 
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold shadow-lg"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500 }}
                    >
                      {cartItemCount}
                    </motion.span>
                  )}
                </motion.button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="customer-modal-secondary w-10 h-10 p-0"
                  onClick={onClose}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Order Type Selector */}
            {!showCart && !showReservationFlow && (
              <div className="flex gap-2 mb-4">
                {/* If user is adding a pre-order for an existing dine-in reservation, lock the UI to Dine-In */}
                {orderType === "dine-in" && reservationPreOrderId ? (
                  <div className="flex-1 py-3 px-4 rounded-[6px] flex items-center justify-center gap-2 text-sm border border-[var(--customer-modal-cyan)] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)]">
                    <CalendarDays className="w-4 h-4" />
                    {t('order.dine_in')}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setOrderType("pickup")}
                      className={`flex-1 py-3 px-4 rounded-[6px] border flex items-center justify-center gap-2 transition-all text-sm ${
                        orderType === "pickup"
                          ? "border-[var(--customer-modal-cyan)] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)]"
                          : "border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)]"
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      {t('order.pickup')}
                    </button>
                    {liveDeliveryEnabled && (
                      <button
                        onClick={() => setOrderType("delivery")}
                        className={`flex-1 py-3 px-4 rounded-[6px] border flex items-center justify-center gap-2 transition-all text-sm ${
                          orderType === "delivery"
                            ? "border-[var(--customer-modal-cyan)] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)]"
                            : "border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)]"
                        }`}
                      >
                        <Truck className="w-4 h-4" />
                        {t('order.delivery')}
                      </button>
                    )}
                    {liveReservationsEnabled && (
                      <button
                        onClick={() => setShowReservationFlow(true)}
                        className={`flex-1 py-3 px-4 rounded-[6px] border flex items-center justify-center gap-2 transition-all text-sm ${
                          showReservationFlow
                            ? "border-[var(--customer-modal-cyan)] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)]"
                            : "border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)]"
                        }`}
                      >
                        <CalendarDays className="w-4 h-4" />
                        {t('order.dine_in')}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {!showCart && (
              <>
                <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--customer-modal-faint)]" />
                  <Input
                    placeholder={t('order.search_menu')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="customer-modal-field pl-12 h-12"
                  />
                </div>

                {categories.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      className={`px-5 py-2.5 rounded-[6px] border whitespace-nowrap text-sm font-semibold transition-all ${
                        selectedCategory === null 
                          ? 'border-[var(--customer-modal-cyan)] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)]' 
                          : 'border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)]'
                      }`}
                      onClick={() => setSelectedCategory(null)}
                    >
                      {t('order.all')}
                    </motion.button>
                    {categories.map((cat) => (
                      <motion.button
                        key={cat}
                        whileTap={{ scale: 0.95 }}
                        className={`px-5 py-2.5 rounded-[6px] border whitespace-nowrap text-sm font-semibold transition-all ${
                          selectedCategory === cat 
                            ? 'border-[var(--customer-modal-cyan)] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)]' 
                            : 'border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)]'
                        }`}
                        onClick={() => setSelectedCategory(cat)}
                      >
                        {cat}
                      </motion.button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {showCart ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-[var(--customer-modal-text)]">{t('order.your_order')}</h3>
                  <button 
                    className="text-sm text-primary"
                    onClick={() => setShowCart(false)}
                  >
                    {t('order.back_to_menu')}
                  </button>
                </div>

                {/* Order Type Badge */}
                <div className={`py-2 px-4 rounded-[6px] text-center border ${
                  orderType === "delivery" 
                    ? "border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] text-[var(--customer-modal-text)]"
                    : orderType === "dine-in"
                      ? "border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] text-[var(--customer-modal-text)]"
                      : "border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] text-[var(--customer-modal-text)]"
                }`}>
                  {orderType === "delivery" ? (
                    <span className="flex items-center justify-center gap-2">
                      <Truck className="w-4 h-4" /> {t('order.delivery_order')}
                    </span>
                  ) : orderType === "dine-in" ? (
                    <span className="flex items-center justify-center gap-2">
                      <UtensilsCrossed className="w-4 h-4" /> {t('order.dine_in_preorder')}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <ShoppingBag className="w-4 h-4" /> {t('order.pickup_order')}
                    </span>
                  )}
                </div>

                {/* Delivery Address Input - FIRST at top */}
                {orderType === "delivery" && (
                  <div className="space-y-3 border border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] p-4 rounded-[6px]">
                    <div>
                      <Label className="text-[var(--customer-modal-muted)] text-sm font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[var(--customer-modal-cyan)]" />
                        {t('order.delivery_address')} *
                      </Label>
                      <AddressAutocomplete
                        value={deliveryAddress}
                        onChange={(address, coords) => {
                          setDeliveryAddress(address);
                          if (coords) setDeliveryCoordinates(coords);
                        }}
                        placeholder={t('order.address_placeholder')}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[var(--customer-modal-muted)] text-sm">{t('order.special_instructions')}</Label>
                      <Textarea
                        placeholder={t('order.delivery_instructions_placeholder')}
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        className="customer-modal-field mt-1 min-h-[60px]"
                      />
                    </div>
                  </div>
                )}
                
                {cart.length === 0 ? (
                  <motion.div 
                    className="text-center py-16"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[var(--customer-modal-raised)] flex items-center justify-center">
                      <ShoppingCart className="w-10 h-10 text-[var(--customer-modal-faint)]" />
                    </div>
                    <p className="text-[var(--customer-modal-muted)] text-lg">{t('order.cart_empty')}</p>
                    <Button 
                      className="customer-modal-primary mt-6 px-8"
                      onClick={() => setShowCart(false)}
                    >
                      {t('order.browse_menu')}
                    </Button>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item, index) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="rounded-[6px] bg-[var(--customer-modal-raised)] p-4 border border-[var(--customer-modal-line)]"
                      >
                        <div className="flex gap-4">
                          {item.menuItem.imageUrl ? (
                            <div className="w-16 h-16 rounded-[6px] overflow-hidden flex-shrink-0 bg-[var(--customer-modal-canvas)]">
                              <img
                                src={item.menuItem.imageUrl}
                                alt={item.menuItem.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-16 h-16 rounded-[6px] bg-[var(--customer-modal-cyan-soft)] flex items-center justify-center flex-shrink-0">
                              <Flame className="w-6 h-6 text-primary/50" />
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-[var(--customer-modal-text)] truncate text-sm">{item.menuItem.name}</h4>
                            {item.selectedSize && (
                              <p className="text-xs text-[var(--customer-modal-muted)]">{item.selectedSize.name}</p>
                            )}
                            <p className="text-primary font-bold">${(getItemPrice(item) * item.quantity).toFixed(2)}</p>
                          </div>
                          
                          <div className="flex flex-col items-end gap-2">
                            <button
                              className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <div className="flex items-center gap-1 bg-[var(--customer-modal-canvas)] rounded-[6px] p-1">
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                className="w-6 h-6 rounded-[4px] bg-[var(--customer-modal-raised)] text-[var(--customer-modal-text)] flex items-center justify-center"
                                onClick={() => updateCartQuantity(item.id, -1)}
                              >
                                <Minus className="w-3 h-3" />
                              </motion.button>
                              <span className="w-6 text-center font-bold text-[var(--customer-modal-text)] text-sm">{item.quantity}</span>
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                className="w-6 h-6 rounded-[4px] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)] flex items-center justify-center"
                                onClick={() => updateCartQuantity(item.id, 1)}
                              >
                                <Plus className="w-3 h-3" />
                              </motion.button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-16">
                    <UtensilsCrossed className="w-16 h-16 text-[var(--customer-modal-faint)] mx-auto mb-4" />
                    <p className="text-[var(--customer-modal-muted)]">{t('order.no_menu_items')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredItems.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="rounded-[6px] overflow-hidden border border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] hover:border-[var(--customer-modal-cyan)] transition-all group"
                      >
                        {item.imageUrl ? (
                          <div className="aspect-square overflow-hidden">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            />
                          </div>
                        ) : (
                          <div className="aspect-square bg-[var(--customer-modal-cyan-soft)] flex items-center justify-center">
                            <Flame className="w-12 h-12 text-primary/30" />
                          </div>
                        )}
                        
                        <div className="p-3">
                          <h4 className="font-semibold text-[var(--customer-modal-text)] text-sm truncate">{item.name}</h4>
                          <p className="text-[var(--customer-modal-muted)] text-xs line-clamp-1 mt-1">{item.description}</p>
                          
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-primary font-bold">${item.basePrice.toFixed(2)}</span>
                            
                            {item.sizes && item.sizes.length > 0 ? (
                              <div className="flex gap-1">
                                {item.sizes.slice(0, 3).map((size) => (
                                  <motion.button
                                    key={size.id}
                                    whileTap={{ scale: 0.9 }}
                                    className="w-7 h-7 rounded-[4px] border border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] text-[var(--customer-modal-cyan)] text-xs font-bold flex items-center justify-center hover:bg-[var(--customer-modal-raised)] transition-colors"
                                    onClick={() => addToCart(item, size)}
                                    title={`${size.name} - $${size.price.toFixed(2)}`}
                                  >
                                    {size.name.charAt(0)}
                                  </motion.button>
                                ))}
                              </div>
                            ) : (
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                className="w-8 h-8 rounded-[4px] bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)] flex items-center justify-center"
                                onClick={() => addToCart(item, null)}
                              >
                                <Plus className="w-4 h-4" />
                              </motion.button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer - Order Summary */}
          {cart.length > 0 && (
            <div className="p-4 bg-[var(--customer-modal-raised)] border-t border-[var(--customer-modal-line)] max-h-[50vh] overflow-y-auto">
              {/* Dine-In Payment Options */}
              {showCart && orderType === "dine-in" && reservationPreOrderId && (
                <div className="mb-4 bg-[var(--customer-modal-canvas)] rounded-[6px] p-3 border border-[var(--customer-modal-line)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 text-[var(--customer-modal-cyan)]" />
                    <span className="font-semibold text-[var(--customer-modal-text)] text-sm">{t('order.payment_option')}</span>
                  </div>
                  
                  <RadioGroup 
                    value={dineInPaymentOption} 
                    onValueChange={(value) => setDineInPaymentOption(value as "reserve_only" | "deposit" | "full")}
                    className="space-y-2"
                  >
                    {/* Reserve Only */}
                    <div className={`flex items-center space-x-2 rounded-[6px] p-2 border transition-all cursor-pointer ${
                      dineInPaymentOption === "reserve_only" 
                        ? "bg-[var(--customer-modal-cyan-soft)] border-[var(--customer-modal-cyan)]" 
                        : "bg-[var(--customer-modal-canvas)] border-[var(--customer-modal-line)] hover:border-[var(--customer-modal-faint)]"
                    }`}>
                      <RadioGroupItem value="reserve_only" id="cart_reserve_only" className="border-[var(--customer-modal-cyan)] text-[var(--customer-modal-cyan)]" />
                      <Label htmlFor="cart_reserve_only" className="flex-1 cursor-pointer">
                        <div className="font-medium text-[var(--customer-modal-text)] text-sm">{t('order.reserve_only')}</div>
                        <div className="text-xs text-orange-400">{t('order.deposit_due_later')}</div>
                      </Label>
                    </div>
                    
                    {/* Pay Deposit */}
                    <div className={`flex items-center space-x-2 rounded-[6px] p-2 border transition-all cursor-pointer ${
                      dineInPaymentOption === "deposit" 
                        ? "bg-[var(--customer-modal-cyan-soft)] border-[var(--customer-modal-cyan)]" 
                        : "bg-[var(--customer-modal-canvas)] border-[var(--customer-modal-line)] hover:border-[var(--customer-modal-faint)]"
                    }`}>
                      <RadioGroupItem value="deposit" id="cart_deposit" className="border-[var(--customer-modal-cyan)] text-[var(--customer-modal-cyan)]" />
                      <Label htmlFor="cart_deposit" className="flex-1 cursor-pointer">
                        <div className="font-medium text-[var(--customer-modal-text)] text-sm">{t('order.pay_deposit_now')}</div>
                        <div className="text-xs text-[var(--customer-modal-muted)]">{t('order.deposit_amount')}</div>
                      </Label>
                    </div>
                    
                    {/* Pay Full Amount */}
                    <div className={`flex items-center space-x-2 rounded-[6px] p-2 border transition-all cursor-pointer ${
                      dineInPaymentOption === "full" 
                        ? "bg-[var(--customer-modal-cyan-soft)] border-[var(--customer-modal-cyan)]" 
                        : "bg-[var(--customer-modal-canvas)] border-[var(--customer-modal-line)] hover:border-[var(--customer-modal-faint)]"
                    }`}>
                      <RadioGroupItem value="full" id="cart_full" className="border-[var(--customer-modal-cyan)] text-[var(--customer-modal-cyan)]" />
                      <Label htmlFor="cart_full" className="flex-1 cursor-pointer">
                        <div className="font-medium text-[var(--customer-modal-text)] text-sm">{t('order.pay_full_now')}</div>
                        <div className="text-xs text-green-400">{t('order.full_total_breakdown', { amount: `$${(cartTotal + 10).toFixed(2)}` })}</div>
                      </Label>
                    </div>
                  </RadioGroup>
                  
                  <p className="text-xs text-[var(--customer-modal-muted)] mt-2">
                    {t('order.deposit_non_refundable')}
                  </p>
                </div>
              )}

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between text-[var(--customer-modal-muted)]">
                  <span>{t('order.subtotal')}</span>
                  <span>${cartSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[var(--customer-modal-muted)]">
                  <span>{t('order.tax')}</span>
                  <span>${cartTax.toFixed(2)}</span>
                </div>
                {orderType === "delivery" && (
                  <div className="flex justify-between text-orange-400">
                    <span>{t('order.delivery_fee')}</span>
                    <span>${deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                {(orderType === "pickup" || orderType === "delivery") && platformFee > 0 && (
                  <div className="flex justify-between text-[var(--customer-modal-muted)]">
                    <span>{t('order.platform_fee')}</span>
                    <span>${platformFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[var(--customer-modal-text)] font-bold text-lg pt-2 border-t border-[var(--customer-modal-line)]">
                  <span>{t('order.total')}</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
              </div>
              
              <Button
                className="customer-modal-primary w-full h-14 text-lg font-semibold"
                onClick={showCart ? placeOrder : () => setShowCart(true)}
                disabled={placingOrder}
              >
                {placingOrder ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('order.placing_order')}
                  </div>
                ) : showCart ? (
                  <>
                    {orderType === "delivery" ? (
                      <Truck className="w-5 h-5 mr-2" />
                    ) : orderType === "dine-in" ? (
                      <UtensilsCrossed className="w-5 h-5 mr-2" />
                    ) : (
                      <ShoppingBag className="w-5 h-5 mr-2" />
                    )}
                    {orderType === "dine-in" 
                      ? (dineInPaymentOption === "full" 
                          ? `${t('order.pay_and_confirm')} $${(cartTotal + 10).toFixed(2)}`
                          : dineInPaymentOption === "deposit"
                            ? t('order.pay_deposit_and_confirm')
                            : t('order.confirm_reservation'))
                      : `${t('order.confirm_and_pay')} $${cartTotal.toFixed(2)}`}
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5 mr-2" />
                    {t('order.view_cart')} (${cartTotal.toFixed(2)})
                  </>
                )}
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Order Tracking Modal */}
      <OrderTrackingModal
        isOpen={showTracking}
        onClose={() => {
          setShowTracking(false);
          setPlacedOrderId(null);
          setDeliveryOrderId(null);
          setDeliveryAddress("");
          setDeliveryNotes("");
          setTrackingOrderType(deliveryEnabled ? "delivery" : "pickup");
          onClose();
        }}
        orderId={placedOrderId}
        deliveryOrderId={deliveryOrderId}
        orderType={trackingOrderType}
      />

      {/* Reservation Flow Modal */}
      {showReservationFlow && (
        <ReservationFlow
          venueId={venueId}
          venueName={venueName}
          onClose={() => setShowReservationFlow(false)}
          onProceedToMenu={(reservationId) => {
            setReservationPreOrderId(reservationId);
            setOrderType("dine-in");
            setShowReservationFlow(false);
            setShowCart(false);
            // No toast here - user will see order confirmation after placing the pre-order
          }}
          onComplete={() => {
            setShowReservationFlow(false);
            onClose();
          }}
        />
      )}
    </AnimatePresence>
  );
};

export default RemoteOrderModal;

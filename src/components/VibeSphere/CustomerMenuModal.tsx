import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Clock, Plus, Minus, ShoppingCart, ChevronRight, Trash2, Flame, Star, Wallet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useJVCoinWallet, TRANSACTION_FEE_USD } from "@/hooks/useJVCoinWallet";
import { useCurrency } from "@/hooks/useCurrency";
import { recordTierEvent } from "@/hooks/useUserTier";
import { PaymentVerificationModal } from "@/components/Payment/PaymentVerificationModal";
import { useTranslation } from 'react-i18next';
import "./vibe-modal.css";

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

interface CustomerMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
}

const CustomerMenuModal = ({ isOpen, onClose, venueId, venueName }: CustomerMenuModalProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { balance, loading: walletLoading, payVenue, fetchBalance } = useJVCoinWallet();
  const { formatCurrency, userCurrency } = useCurrency();
  
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [showPaymentConfirmation, setShowPaymentConfirmation] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [showPinVerification, setShowPinVerification] = useState(false);

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

  useEffect(() => {
    if (!venueId || !isOpen) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`customer-menu-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_menu_items",
          filter: `venue_id=eq.${venueId}`,
        },
        () => {
          fetchMenuItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, isOpen, fetchMenuItems]);

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

  const cartTotal = cart.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Calculate totals with platform fee
  const subtotal = cartTotal;
  const tax = subtotal * 0.1;
  const orderTotal = subtotal + tax;
  const platformFee = TRANSACTION_FEE_USD;
  const totalWithFee = orderTotal + platformFee;
  const hasInsufficientBalance = balance.jvc < totalWithFee;

  // Initiate payment confirmation (shows confirmation screen)
  const initiatePayment = () => {
    if (!user) {
      toast.error("Please sign in to place an order");
      return;
    }
    
    if (cart.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    if (balance.isFrozen) {
      toast.error("Your wallet is frozen. Please contact support.");
      return;
    }

    if (hasInsufficientBalance) {
      toast.error(`Insufficient balance. You need ${formatCurrency(totalWithFee)} but have ${formatCurrency(balance.jvc)}`);
      return;
    }

    setShowPaymentConfirmation(true);
  };

  // Process payment and create order — called after PIN verification
  const placeOrder = async () => {
    if (!user) {
      toast.error("Please sign in to place an order");
      return;
    }
    
    if (cart.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    // Show PIN verification first
    setShowPinVerification(true);
  };

  // Actually execute payment after PIN is verified
  const executePaymentAfterVerification = async () => {
    setShowPinVerification(false);
    setPaymentProcessing(true);
    
    try {
      // Step 1: Process payment FIRST (pass verification token)
      const paymentResult = await payVenue(venueId, orderTotal, undefined, venueName, 'pin_verified');
      
      if (!paymentResult.success) {
        toast.error(paymentResult.error || "Payment failed. Please try again.");
        setPaymentProcessing(false);
        return;
      }

      // Step 2: Payment succeeded, now create the order
      setPlacingOrder(true);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          venue_id: venueId,
          customer_name: user.email?.split('@')[0] || 'Customer',
          subtotal,
          tax,
          total: orderTotal,
          status: 'paid', // Order is already paid
          notes: 'Order placed via VibeSphere - Payment completed'
        })
        .select()
        .single();

      if (orderError) {
        // Payment succeeded but order creation failed - log this critical error
        console.error("CRITICAL: Payment succeeded but order creation failed:", orderError);
        toast.error("Payment processed but order creation failed. Please contact support with transaction ID: " + paymentResult.transaction_id);
        setPaymentProcessing(false);
        setPlacingOrder(false);
        return;
      }

      const orderItems = cart.map(item => ({
        order_id: order.id,
        menu_item_id: item.menuItem.id,
        name: item.menuItem.name + (item.selectedSize ? ` (${item.selectedSize.name})` : ''),
        quantity: item.quantity,
        price: getItemPrice(item),
        image_url: item.menuItem.imageUrl || null,
        notes: item.selectedSize ? `Size: ${item.selectedSize.name}` : null
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Order items creation failed:", itemsError);
        // Order was created, items failed - still show success but log error
      }

      // Refresh balance after successful payment
      await fetchBalance();

      toast.success("Order placed and paid successfully! The venue will prepare it shortly.");

      // Tier events: order + spend bonus
      if (user) {
        recordTierEvent(user.id, "order", { order_id: order.id, venue_id: venueId });
        if (orderTotal >= 50) {
          recordTierEvent(user.id, "spend_bonus", { order_id: order.id, venue_id: venueId });
        }
      }

      setCart([]);
      setShowCart(false);
      setShowPaymentConfirmation(false);
    } catch (error) {
      console.error("Error placing order:", error);
      toast.error("Failed to place order. Please try again.");
    } finally {
      setPlacingOrder(false);
      setPaymentProcessing(false);
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
        {/* Backdrop */}
        <div 
          className="vibe-modal-backdrop absolute inset-0"
          onClick={onClose}
        />
        
        {/* Modal - McCompose Inspired Design */}
        <motion.div
          className="vibe-modal vibe-menu-modal relative w-full flex flex-col"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Header - Fixed */}
          <div className="vibe-modal__header relative p-5 pb-4">
            {/* Venue Name & Close */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {venueName}
                </h2>
                <p className="text-sm text-white/50">Menu</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Cart Button - McDonalds Style */}
                <motion.button 
                  className="vibe-menu-modal__icon-button relative"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowCart(!showCart)}
                >
                  <ShoppingCart className="w-5 h-5 text-white" />
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
                  className="vibe-menu-modal__icon-button"
                  onClick={onClose}
                >
                  <X className="w-5 h-5 text-white/70" />
                </Button>
              </div>
            </div>

            {!showCart && (
              <>
                {/* Search Bar - Rounded */}
                <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <Input
                    placeholder="Search menu..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="vibe-menu-modal__search h-12 pl-12 text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {/* Category Pills - Horizontal Scroll */}
                {categories.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-semibold transition-all ${
                        selectedCategory === null 
                          ? 'bg-primary text-white shadow-lg shadow-primary/30' 
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                      onClick={() => setSelectedCategory(null)}
                    >
                      All
                    </motion.button>
                    {categories.map((cat) => (
                      <motion.button
                        key={cat}
                        whileTap={{ scale: 0.95 }}
                        className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-semibold transition-all ${
                          selectedCategory === cat 
                            ? 'bg-primary text-white shadow-lg shadow-primary/30' 
                            : 'bg-white/5 text-white/70 hover:bg-white/10'
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

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {showCart ? (
              /* Cart View - McCompose Style */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">Your Order</h3>
                  <button 
                    className="text-sm text-primary"
                    onClick={() => setShowCart(false)}
                  >
                    ← Back to Menu
                  </button>
                </div>
                
                {cart.length === 0 ? (
                  <motion.div 
                    className="text-center py-16"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
                      <ShoppingCart className="w-10 h-10 text-white/20" />
                    </div>
                    <p className="text-white/50 text-lg">Your cart is empty</p>
                    <p className="text-white/30 text-sm mt-2">Add some delicious items from the menu</p>
                    <Button 
                      className="mt-6 bg-primary hover:bg-primary/90 rounded-full px-8"
                      onClick={() => setShowCart(false)}
                    >
                      Browse Menu
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
                        className="vibe-modal__panel p-4"
                      >
                        <div className="flex gap-4">
                          {/* Image */}
                          {item.menuItem.imageUrl ? (
                            <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-white/5">
                              <img
                                src={item.menuItem.imageUrl}
                                alt={item.menuItem.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="vibe-modal__muted-icon h-20 w-20 flex-shrink-0">
                              <Flame className="w-8 h-8" />
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-white truncate">
                              {item.menuItem.name}
                            </h4>
                            {item.selectedSize && (
                              <p className="text-xs text-white/40">{item.selectedSize.name}</p>
                            )}
                            <p className="text-lg font-bold text-primary mt-1">
                              ${(getItemPrice(item) * item.quantity).toFixed(2)}
                            </p>
                          </div>
                          
                          {/* Quantity Controls - McCompose Style */}
                          <div className="flex flex-col items-end gap-2">
                            <button
                              className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <div className="flex items-center gap-1 bg-white/5 rounded-full p-1">
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center"
                                onClick={() => updateCartQuantity(item.id, -1)}
                              >
                                <Minus className="w-4 h-4" />
                              </motion.button>
                              <span className="w-8 text-center font-bold text-white">{item.quantity}</span>
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center"
                                onClick={() => updateCartQuantity(item.id, 1)}
                              >
                                <Plus className="w-4 h-4" />
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
              /* Menu View - McCompose Style Grid */
              <div className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <motion.div 
                    className="text-center py-16"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
                      <Search className="w-10 h-10 text-white/20" />
                    </div>
                    <p className="text-white/50 text-lg">
                      {menuItems.length === 0 
                        ? "No menu items available yet"
                        : "No items match your search"
                      }
                    </p>
                  </motion.div>
                ) : (
                  /* Menu Items Grid - 2 Column McCompose Style */
                  <div className="grid grid-cols-2 gap-3">
                    {filteredItems.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="group"
                      >
                        <div className="vibe-modal__panel overflow-hidden transition-all hover:border-primary/30">
                          {/* Image Section */}
                          <div className="vibe-modal__media relative aspect-square p-3">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover rounded-xl"
                              />
                            ) : (
                              <div className="vibe-modal__muted-icon h-full w-full">
                                <Flame className="w-12 h-12" />
                              </div>
                            )}
                            
                            {/* Prep Time Badge */}
                            {item.preparationTime && (
                              <div className="vibe-modal__meta absolute top-2 left-2 flex items-center gap-1 px-2 py-1">
                                <Clock className="w-3 h-3 text-white/70" />
                                <span className="text-xs text-white/70">{item.preparationTime}m</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Info Section */}
                          <div className="p-3">
                            <h3 className="font-semibold text-white text-sm line-clamp-1 mb-0.5">
                              {item.name}
                            </h3>
                            <p className="text-xs text-white/40 line-clamp-1 mb-2">
                              {item.description || item.category}
                            </p>
                            
                            {/* Price & Add Button */}
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-primary text-lg">
                                ${item.basePrice.toFixed(2)}
                              </span>
                              
                              {item.sizes.length > 0 ? (
                                <div className="flex gap-1">
                                  {item.sizes.slice(0, 2).map((size) => (
                                    <motion.button
                                      key={size.id}
                                      whileTap={{ scale: 0.9 }}
                                      className="w-8 h-8 rounded-full bg-primary/20 text-primary text-xs font-bold hover:bg-primary hover:text-white transition-colors flex items-center justify-center"
                                      onClick={() => addToCart(item, size)}
                                      title={`${size.name} - $${size.price}`}
                                    >
                                      {size.name.charAt(0)}
                                    </motion.button>
                                  ))}
                                </div>
                              ) : (
                                <motion.button
                                  whileTap={{ scale: 0.9 }}
                                  className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30"
                                  onClick={() => addToCart(item, null)}
                                >
                                  <Plus className="w-5 h-5" />
                                </motion.button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer - Checkout Button - McCompose Style */}
          {cart.length > 0 && !showPaymentConfirmation && (
            <motion.div 
              className="vibe-modal__composer p-4"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              {/* Balance Display */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  <span className="text-white/50 text-sm">Balance:</span>
                  <span className={`font-semibold ${hasInsufficientBalance ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatCurrency(balance.jvc)}
                  </span>
                </div>
                {hasInsufficientBalance && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Insufficient
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between mb-3 px-1">
                <div>
                  <p className="text-white/50 text-sm">Subtotal</p>
                  <p className="text-xl font-bold text-white">{formatCurrency(cartTotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/50 text-xs">Tax (10%) + Fee</p>
                  <p className="text-white/70 text-sm">{formatCurrency(tax + platformFee)}</p>
                </div>
              </div>
              
              <motion.button 
                className={`vibe-menu-modal__checkout${hasInsufficientBalance ? ' vibe-menu-modal__checkout--disabled' : ''}`}
                whileTap={{ scale: 0.98 }}
                onClick={initiatePayment}
                disabled={hasInsufficientBalance || walletLoading}
              >
                {walletLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading...
                  </>
                ) : hasInsufficientBalance ? (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    Insufficient Balance
                  </>
                ) : (
                  <>
                    Pay {formatCurrency(totalWithFee)}
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </motion.button>
            </motion.div>
          )}

          {/* Payment Confirmation Screen */}
          {showPaymentConfirmation && (
            <motion.div 
              className="vibe-menu-modal__confirmation absolute inset-0 z-10 flex flex-col p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Confirm Payment</h3>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="vibe-menu-modal__icon-button"
                  onClick={() => setShowPaymentConfirmation(false)}
                  disabled={paymentProcessing}
                >
                  <X className="w-5 h-5 text-white/70" />
                </Button>
              </div>

              <div className="flex-1 space-y-4">
                {/* Payment To */}
                <div className="vibe-modal__panel p-4">
                  <p className="text-white/50 text-sm mb-1">Paying to</p>
                  <p className="text-lg font-bold text-white">{venueName}</p>
                </div>

                {/* Order Summary */}
                <div className="vibe-modal__panel space-y-3 p-4">
                  <p className="text-white/50 text-sm">Order Summary</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {cart.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-white/70">
                          {item.quantity}x {item.menuItem.name}
                          {item.selectedSize && ` (${item.selectedSize.name})`}
                        </span>
                        <span className="text-white font-medium">
                          {formatCurrency(getItemPrice(item) * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="vibe-modal__panel space-y-2 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Subtotal</span>
                    <span className="text-white">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Tax (10%)</span>
                    <span className="text-white">{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Platform Fee</span>
                    <span className="text-white">{formatCurrency(platformFee)}</span>
                  </div>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex justify-between">
                    <span className="text-white font-semibold">Total</span>
                    <span className="text-primary font-bold text-lg">{formatCurrency(totalWithFee)}</span>
                  </div>
                </div>

                {/* Balance After */}
                <div className="vibe-modal__panel p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-emerald-400" />
                      <span className="text-white/70">Balance After Payment</span>
                    </div>
                    <span className="text-emerald-400 font-bold">
                      {formatCurrency(balance.jvc - totalWithFee)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Confirm Button */}
              <motion.button 
                className="vibe-menu-modal__checkout mt-4"
                whileTap={{ scale: 0.98 }}
                onClick={placeOrder}
                disabled={paymentProcessing || placingOrder}
              >
                {paymentProcessing || placingOrder ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {paymentProcessing ? 'Processing Payment...' : 'Creating Order...'}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Confirm & Pay {formatCurrency(totalWithFee)}
                  </>
                )}
              </motion.button>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
      

      <PaymentVerificationModal
        open={showPinVerification}
        onClose={() => setShowPinVerification(false)}
        onVerified={executePaymentAfterVerification}
        amount={totalWithFee}
      />
    </AnimatePresence>
  );
};

export default CustomerMenuModal;

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useTranslation } from 'react-i18next';

interface POSContextType {
  orders: any[];
  cart: CartItem[];
  menu: MenuItem[];
  currentStaff: Staff | null;
  venueId: string;
  addToCart: (item: MenuItem, quantity?: number, selectedSize?: MenuItemSize | null) => void;
  removeFromCart: (itemId: string) => void;
  updateCartItem: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  createOrder: (orderData: any) => Promise<void>;
  setCurrentStaff: (staff: Staff | null) => void;
  refreshMenu: () => void;
  menuLoading: boolean;
}

interface CartItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  selectedSize?: MenuItemSize | null;
  modifiers?: any[];
  notes?: string;
}

interface MenuItemSize {
  id: string;
  name: string;
  price: number;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  basePrice: number;
  price: number; // Computed price (base or size)
  sizes?: MenuItemSize[];
  imageUrl?: string;
  available: boolean;
}

interface Staff {
  id: string;
  name: string;
  role: string;
  pin?: string;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export function POSProvider({
  children,
  venueId,
}: {
  children: ReactNode;
  venueId?: string | null;
}) {
  const { t } = useTranslation('pos');
  const [orders, setOrders] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(null);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  // Resolve venue ID from props, localStorage, or user data
  useEffect(() => {
    const resolveVenueId = async () => {
      // 0) Highest priority: explicit prop
      if (venueId && isUuid(venueId)) {
        localStorage.setItem("jv_current_venue_id", venueId);
        setResolvedVenueId(venueId);
        return;
      }

      // 1) localStorage
      const storedVenueIdRaw = localStorage.getItem("jv_current_venue_id");
      const storedVenueId =
        storedVenueIdRaw && isUuid(storedVenueIdRaw) ? storedVenueIdRaw : null;

      if (storedVenueId) {
        setResolvedVenueId(storedVenueId);
        return;
      }

      // If localStorage contains junk like "default", purge it so we don't keep breaking queries.
      if (storedVenueIdRaw && !storedVenueId) {
        localStorage.removeItem("jv_current_venue_id");
      }

      // 2) Try to get from user's venues
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: venue } = await supabase
            .from("venues")
            .select("id")
            .eq("owner_user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (venue?.id) {
            localStorage.setItem("jv_current_venue_id", venue.id);
            setResolvedVenueId(venue.id);
          }
        }
      } catch (e) {
        console.error("Failed to resolve venue ID:", e);
      }
    };

    resolveVenueId();
  }, [venueId]);

  // Fetch menu from database
  const fetchMenuFromDB = useCallback(async () => {
    if (!resolvedVenueId) {
      setMenuLoading(false);
      return;
    }

    setMenuLoading(true);
    try {
      const { data, error } = await supabase
        .from("venue_menu_items")
        .select("*")
        .eq("venue_id", resolvedVenueId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const posItems: MenuItem[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description || "",
          category: item.category,
          basePrice: Number(item.base_price),
          price: Number(item.base_price) || (item.sizes?.[0]?.price || 0),
          sizes: item.sizes || [],
          imageUrl: item.image_url || "",
          available: item.available,
        }));
        setMenu(posItems);
      } else {
        setMenu([]);
      }
    } catch (error) {
      console.error("Error fetching menu from DB:", error);
    } finally {
      setMenuLoading(false);
    }
  }, [resolvedVenueId]);

  // Load menu when venueId is resolved
  useEffect(() => {
    if (resolvedVenueId) {
      fetchMenuFromDB();
    }
  }, [resolvedVenueId, fetchMenuFromDB]);

  // Subscribe to realtime menu updates
  useEffect(() => {
    if (!resolvedVenueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`pos-menu-${resolvedVenueId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_menu_items",
          filter: `venue_id=eq.${resolvedVenueId}`,
        },
        () => {
          console.log("Menu updated, refreshing...");
          fetchMenuFromDB();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [resolvedVenueId, fetchMenuFromDB]);

  const addToCart = (item: MenuItem, quantity = 1, selectedSize: MenuItemSize | null = null) => {
    setCart(prev => {
      const cartItemId = selectedSize ? `${item.id}-${selectedSize.id}` : item.id;
      const existing = prev.find(cartItem => 
        selectedSize 
          ? cartItem.menuItem.id === item.id && cartItem.selectedSize?.id === selectedSize.id
          : cartItem.menuItem.id === item.id && !cartItem.selectedSize
      );
      
      if (existing) {
        return prev.map(cartItem =>
          cartItem.id === existing.id
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem
        );
      }
      
      const newItem: CartItem = {
        id: `cart-${Date.now()}-${cartItemId}`,
        menuItem: {
          ...item,
          price: selectedSize ? selectedSize.price : item.basePrice || item.price
        },
        quantity,
        selectedSize
      };
      return [...prev, newItem];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const updateCartItem = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart(prev =>
      prev.map(item => (item.id === itemId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const createOrder = async (orderData: any) => {
    const newOrder = {
      id: `order-${Date.now()}`,
      items: cart,
      ...orderData,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    setOrders(prev => [newOrder, ...prev]);
    clearCart();
    console.log('Order created:', newOrder);
  };

  const refreshMenu = () => {
    fetchMenuFromDB();
  };

  return (
    <POSContext.Provider
      value={{
        orders,
        cart,
        menu,
        currentStaff,
        venueId: resolvedVenueId || '',
        addToCart,
        removeFromCart,
        updateCartItem,
        clearCart,
        createOrder,
        setCurrentStaff,
        refreshMenu,
        menuLoading,
      }}
    >
      {children}
    </POSContext.Provider>
  );
}

export const usePOS = () => {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within POSProvider');
  }
  return context;
};

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Store, 
  Plus, 
  Minus, 
  ShoppingCart, 
  CreditCard,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { KioskPaymentScreen } from '@/components/POS/KioskPaymentScreen';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import './pos-kiosk.css';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  image_url?: string;
}

interface CartItem extends MenuItem {
  quantity: number;
}

export default function KioskMode() {
  const { t } = useTranslation('pos');
  const { formatCurrency } = useCurrency();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string>('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get venue from localStorage
    const storedVenueId = localStorage.getItem('jv_current_venue_id');
    const storedVenueName = localStorage.getItem('jv_current_venue_name');
    
    if (storedVenueId) {
      setVenueId(storedVenueId);
      setVenueName(storedVenueName || 'Venue');
      fetchMenu(storedVenueId);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchMenu = async (venueId: string) => {
    try {
      const { data: items, error } = await supabase
        .from('venue_menu_items')
        .select('*')
        .eq('venue_id', venueId)
        .eq('available', true)
        .order('category');

      if (error) throw error;

      const menuData: MenuItem[] = (items || []).map(item => ({
        id: item.id,
        name: item.name,
        price: item.base_price,
        category: item.category,
        image_url: item.image_url
      }));

      setMenuItems(menuData);
      
      // Extract unique categories
      const uniqueCategories = [...new Set(menuData.map(item => item.category))];
      setCategories(uniqueCategories);
      if (uniqueCategories.length > 0) {
        setSelectedCategory(uniqueCategories[0]);
      }
    } catch (error) {
      console.error('Error fetching menu:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => 
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === itemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.10;
  const total = subtotal + tax;

  const handlePaymentComplete = async (transactionId: string, method: string) => {
    // Create order in database
    if (venueId) {
      try {
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            venue_id: venueId,
            customer_name: 'Kiosk Order',
            subtotal,
            tax,
            total,
            status: 'paid',
            notes: `Kiosk order - ${method}`
          })
          .select()
          .single();

        if (!orderError && order) {
          // Add order items
          const orderItems = cart.map(item => ({
            order_id: order.id,
            menu_item_id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
          }));

          await supabase.from('order_items').insert(orderItems);
        }
      } catch (error) {
        console.error('Error creating order:', error);
      }
    }

    setShowPayment(false);
    setOrderComplete(true);
    
    // Reset after 3 seconds
    setTimeout(() => {
      setCart([]);
      setOrderComplete(false);
    }, 3000);
  };

  if (loading) {
    return (
      <div className="pos-kiosk-state">
        <div className="pos-kiosk-state__spinner" />
      </div>
    );
  }

  if (!venueId) {
    return (
      <div className="pos-kiosk-state">
        <Card className="pos-kiosk-state__card">
          <CardContent>
            <Store aria-hidden="true" />
            <h2>No Venue Selected</h2>
            <p>
              Please access this page from the venue dashboard to enable kiosk mode.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showPayment) {
    return (
      <KioskPaymentScreen
        venueId={venueId}
        venueName={venueName}
        amount={total}
        onPaymentComplete={handlePaymentComplete}
        onCancel={() => setShowPayment(false)}
      />
    );
  }

  if (orderComplete) {
    return (
      <div className="pos-kiosk-complete">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="pos-kiosk-complete__content"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
          >
            <CheckCircle2 className="pos-kiosk-complete__icon" />
          </motion.div>
          <h1>Thank you!</h1>
          <p>Your order has been placed.</p>
        </motion.div>
      </div>
    );
  }

  const filteredItems = selectedCategory 
    ? menuItems.filter(item => item.category === selectedCategory)
    : menuItems;

  return (
    <div className="pos-kiosk">
      {/* Menu Section */}
      <div className="pos-kiosk__catalog">
        {/* Header */}
        <header className="pos-kiosk__header">
          <h1>{venueName}</h1>
          <p>Self-Service Kiosk</p>
        </header>

        {/* Categories */}
        <div className="pos-kiosk__categories">
          <div>
            {categories.map(cat => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                onClick={() => setSelectedCategory(cat)}
                className="pos-kiosk__category"
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {/* Menu Items */}
        <ScrollArea className="pos-kiosk__menu">
          <div className="pos-kiosk__grid">
            {filteredItems.length === 0 ? (
              <div className="pos-kiosk__empty">
                <Store aria-hidden="true" />
                <strong>No menu items available</strong>
                <span>Ask the venue team to add items before accepting kiosk orders.</span>
              </div>
            ) : filteredItems.map(item => (
              <motion.div
                key={item.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card 
                  className="pos-kiosk__item"
                  onClick={() => addToCart(item)}
                >
                  {item.image_url && (
                    <div className="pos-kiosk__item-image">
                      <img 
                        src={item.image_url} 
                        alt={item.name}
                        className="pos-kiosk__item-image-media"
                      />
                    </div>
                  )}
                  <CardContent className="pos-kiosk__item-content">
                    <p>{item.name}</p>
                    <strong>{formatCurrency(item.price)}</strong>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Cart Section */}
      <aside className="pos-kiosk__cart">
        <header className="pos-kiosk__cart-header">
          <h2>
            <ShoppingCart aria-hidden="true" />
            Your Order
          </h2>
        </header>

        <ScrollArea className="pos-kiosk__cart-items">
          {cart.length === 0 ? (
            <div className="pos-kiosk__cart-empty">
              <ShoppingCart aria-hidden="true" />
              <p>Your cart is empty</p>
              <span>Tap items to add them</span>
            </div>
          ) : (
            <div className="pos-kiosk__cart-list">
              {cart.map(item => (
                <div
                  key={item.id}
                  className="pos-kiosk__cart-item"
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {formatCurrency(item.price)} each
                    </span>
                  </div>
                  <div className="pos-kiosk__cart-quantity">
                    <Button
                      size="icon"
                      variant="outline"
                      className="pos-kiosk__cart-icon-button"
                      onClick={() => updateQuantity(item.id, -1)}
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                    <span>{item.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="pos-kiosk__cart-icon-button"
                      onClick={() => updateQuantity(item.id, 1)}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="pos-kiosk__cart-icon-button pos-kiosk__cart-icon-button--danger"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Totals & Checkout */}
        <footer className="pos-kiosk__summary">
          <div>
            <div>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div>
              <span>Tax (10%)</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="pos-kiosk__summary-total">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          <Button
            size="lg"
            className="pos-kiosk__pay"
            disabled={cart.length === 0}
            onClick={() => setShowPayment(true)}
          >
            <CreditCard aria-hidden="true" />
            Pay {formatCurrency(total)}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

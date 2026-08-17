import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePOS } from "@/contexts/POSContext";
import { Order, useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import { usePOSTableAvailability } from "@/hooks/usePOSTableAvailability";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertCircle,
  Armchair,
  Bike,
  Check,
  CircleCheck,
  CreditCard,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { CollectPaymentModal } from "@/components/POS/CollectPaymentModal";
import { POSTableSelector } from "@/components/POS/POSTableSelector";
import { supabase } from "@/integrations/supabase/client";
import "./new-order.css";

interface MenuItemSize {
  id: string;
  name: string;
  price: number;
}

type ServiceType = "dine_in" | "takeaway" | "delivery";

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

export default function NewOrder() {
  const { menu, cart, addToCart, updateCartItem, clearCart, venueId } = usePOS();
  const [searchParams] = useSearchParams();
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sizeSelectItem, setSizeSelectItem] = useState<(typeof menu)[number] | null>(null);
  const [orderType, setOrderType] = useState<ServiceType>("takeaway");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [, setSelectedCustomerId] = useState<string | undefined>();
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [venueName, setVenueName] = useState("Venue");
  const { toast } = useToast();

  useEffect(() => {
    const storedVenueIdRaw = localStorage.getItem("jv_current_venue_id");
    const storedVenueId = storedVenueIdRaw && isUuid(storedVenueIdRaw) ? storedVenueIdRaw : null;

    if (storedVenueIdRaw && !storedVenueId) {
      localStorage.removeItem("jv_current_venue_id");
    }

    const contextVenueId = venueId && isUuid(venueId) ? venueId : null;
    setResolvedVenueId(contextVenueId || storedVenueId || null);
  }, [venueId]);

  const { addOrder, updateOrderStatus } = useVenueOrdersDB(resolvedVenueId);
  const { tables, loading: tablesLoading } = usePOSTableAvailability(resolvedVenueId);

  useEffect(() => {
    const requestedTable = searchParams.get("table")?.trim();
    if (!requestedTable) return;

    const matchingTable = tables.find((table) => table.tableNumber === requestedTable);
    setOrderType("dine_in");
    setSelectedTable(matchingTable?.tableNumber || requestedTable);
  }, [searchParams, tables]);

  useEffect(() => {
    if (!resolvedVenueId) return;

    const fetchVenueName = async () => {
      const { data } = await supabase
        .from("venues")
        .select("name")
        .eq("id", resolvedVenueId)
        .single();

      if (data?.name) {
        setVenueName(data.name);
      }
    };

    fetchVenueName();
  }, [resolvedVenueId]);

  const categories = ["All", ...new Set(menu.map((item) => item.category))];
  const filteredMenu = menu.filter((item) => {
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && item.available;
  });

  const getItemPrice = (item: (typeof cart)[number]) => {
    const unitPrice = item.selectedSize?.price || item.menuItem.basePrice || item.menuItem.price;
    return unitPrice * item.quantity;
  };

  const cartTotal = cart.reduce((sum, item) => sum + getItemPrice(item), 0);
  const tax = cartTotal * 0.1;
  const total = cartTotal + tax;
  const serviceLabel = orderType === "dine_in" ? "Dine-in" : orderType === "delivery" ? "Delivery" : "Takeaway";

  const handleItemClick = (item: (typeof menu)[number]) => {
    if (item.sizes && item.sizes.length > 0) {
      setSizeSelectItem(item);
      return;
    }

    addToCart(item);
    sonnerToast.success(`${item.name} added`, {
      duration: 1500,
      icon: <Check className="h-4 w-4" />,
    });
  };

  const handleSizeSelect = (size: MenuItemSize) => {
    if (!sizeSelectItem) return;

    addToCart(sizeSelectItem, 1, size);
    setSizeSelectItem(null);
    sonnerToast.success(`${sizeSelectItem.name} (${size.name}) added`, {
      duration: 1500,
      icon: <Check className="h-4 w-4" />,
    });
  };

  const selectOrderType = (nextOrderType: ServiceType) => {
    setOrderType(nextOrderType);

    if (nextOrderType !== "dine_in") {
      setSelectedTable(null);
      setSelectedCustomerId(undefined);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items to place an order" });
      return;
    }

    const tableNumber =
      orderType === "dine_in" && selectedTable
        ? selectedTable
        : orderType === "delivery"
          ? "Delivery"
          : "Takeaway";
    const orderItems = cart.map((item) => ({
      id: item.id,
      name: item.menuItem.name,
      quantity: item.quantity,
      price: item.selectedSize?.price || item.menuItem.basePrice || item.menuItem.price,
      size: item.selectedSize?.name,
    }));
    const newOrder = await addOrder({
      tableNumber,
      items: orderItems,
      total,
      status: "pending",
      source: "pos",
      priority: "normal",
    });

    if (!newOrder) {
      toast({ title: "Error", description: "Failed to create order" });
      return;
    }

    clearCart();
    setPendingOrder(newOrder);
    setShowPaymentModal(true);
    sonnerToast.info(`Order #${newOrder.orderNumber} created`, {
      description: `Awaiting payment - ${tableNumber}`,
    });
  };

  const handlePaymentComplete = async () => {
    if (!pendingOrder) return;

    await updateOrderStatus(pendingOrder.id, "preparing");
    sonnerToast.success(`Order #${pendingOrder.orderNumber} paid`, {
      description: `Sent to kitchen - ${pendingOrder.tableNumber}`,
    });
    setPendingOrder(null);
  };

  return (
    <div className="pos-new-order">
      <div className="pos-new-order__catalog-top">
        <header className="pos-new-order__topbar">
          <div>
            <span className="pos-new-order__topbar-label">{venueName}</span>
            <strong>Point of Sale</strong>
          </div>
          <span className="pos-new-order__terminal-status">
            <CircleCheck aria-hidden="true" />
            Terminal ready
          </span>
        </header>

        <section className="pos-new-order__heading">
          <div>
            <h1>New order</h1>
            <p>Build an order, choose the service type, and take payment.</p>
          </div>
        </section>

        <div className="pos-new-order__tools">
          <label className="pos-new-order__search" htmlFor="pos-menu-search">
            <Search aria-hidden="true" />
            <input
              id="pos-menu-search"
              type="search"
              placeholder="Search menu"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              autoComplete="off"
            />
          </label>

          <div className="pos-new-order__tabs" role="tablist" aria-label="Menu categories">
            {categories.map((category) => {
              const isActive = selectedCategory === category;

              return (
                <button
                  key={category}
                  className={`pos-new-order__tab${isActive ? " is-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="pos-new-order__catalog" aria-label="Menu catalog">
        {filteredMenu.length === 0 ? (
          <div className="pos-new-order__empty-catalog">
            <AlertCircle aria-hidden="true" />
            <strong>No menu items found</strong>
            <p>Add items in Menu Management to see them here.</p>
          </div>
        ) : (
          <div className="pos-new-order__menu-grid">
            {filteredMenu.map((item) => {
              const hasSizes = Boolean(item.sizes?.length);
              const displayPrice = hasSizes
                ? Math.min(...item.sizes!.map((size: MenuItemSize) => size.price))
                : item.basePrice || item.price;

              return (
                <button
                  key={item.id}
                  className="pos-new-order__menu-item"
                  type="button"
                  onClick={() => handleItemClick(item)}
                >
                  <span className="pos-new-order__menu-image">
                    <UtensilsCrossed aria-hidden="true" />
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </span>
                  <span className="pos-new-order__menu-copy">
                    <strong>{item.name}</strong>
                    <small>{item.category}</small>
                    <b>{hasSizes ? "From " : ""}{formatCurrency(displayPrice)}</b>
                  </span>
                  {hasSizes && (
                    <span className="pos-new-order__size-count" aria-label={`${item.sizes!.length} sizes available`}>
                      <Layers aria-hidden="true" />
                      {item.sizes!.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="pos-new-order__order" aria-labelledby="pos-current-order-title">
        <div className="pos-new-order__order-header">
          <div>
            <p className="pos-new-order__eyebrow">Current order</p>
            <h2 id="pos-current-order-title">New order</h2>
          </div>
          <button
            className="pos-new-order__clear-order"
            type="button"
            onClick={clearCart}
            disabled={cart.length === 0}
          >
            <RotateCcw aria-hidden="true" />
            Clear
          </button>
        </div>

        <div className="pos-new-order__service" role="group" aria-label="Service type">
          <button
            className={orderType === "takeaway" ? "is-active" : ""}
            type="button"
            aria-pressed={orderType === "takeaway"}
            onClick={() => selectOrderType("takeaway")}
          >
            <ShoppingBag aria-hidden="true" />
            Takeaway
          </button>
          <button
            className={orderType === "dine_in" ? "is-active" : ""}
            type="button"
            aria-pressed={orderType === "dine_in"}
            onClick={() => selectOrderType("dine_in")}
          >
            <Armchair aria-hidden="true" />
            Dine-in
          </button>
          <button
            className={orderType === "delivery" ? "is-active" : ""}
            type="button"
            aria-pressed={orderType === "delivery"}
            onClick={() => selectOrderType("delivery")}
          >
            <Bike aria-hidden="true" />
            Delivery
          </button>
        </div>

        {orderType === "dine_in" && (
          <div className="pos-new-order__table">
            <label>Table</label>
            <POSTableSelector
              tables={tables}
              selectedTable={selectedTable}
              onTableSelect={(tableNumber, customerId) => {
                setSelectedTable(tableNumber);
                setSelectedCustomerId(customerId);
              }}
              loading={tablesLoading}
            />
          </div>
        )}

        <div className="pos-new-order__items">
          {cart.length === 0 ? (
            <div className="pos-new-order__empty-order">
              <ShoppingCart aria-hidden="true" />
              <strong>Your order is empty</strong>
              <p>Choose items from the menu to get started.</p>
            </div>
          ) : (
            cart.map((item) => {
              const unitPrice = item.selectedSize?.price || item.menuItem.basePrice || item.menuItem.price;

              return (
                <article className="pos-new-order__line-item" key={item.id}>
                  <div className="pos-new-order__line-copy">
                    <strong>{item.menuItem.name}</strong>
                    {item.selectedSize && <small>{item.selectedSize.name}</small>}
                    <span>{formatCurrency(getItemPrice(item))}</span>
                  </div>
                  <div className="pos-new-order__line-controls">
                    <button
                      className="pos-new-order__quantity-button"
                      type="button"
                      aria-label={`Remove one ${item.menuItem.name}`}
                      onClick={() => updateCartItem(item.id, item.quantity - 1)}
                    >
                      <Minus aria-hidden="true" />
                    </button>
                    <span className="pos-new-order__quantity">{item.quantity}</span>
                    <button
                      className="pos-new-order__quantity-button"
                      type="button"
                      aria-label={`Add one ${item.menuItem.name}`}
                      onClick={() => updateCartItem(item.id, item.quantity + 1)}
                    >
                      <Plus aria-hidden="true" />
                    </button>
                    <span className="sr-only">{formatCurrency(unitPrice)} each</span>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="pos-new-order__summary">
          <div>
            <span>Subtotal</span>
            <strong>{formatCurrency(cartTotal)}</strong>
          </div>
          <div>
            <span>Tax (10%)</span>
            <strong>{formatCurrency(tax)}</strong>
          </div>
          <div className="pos-new-order__total">
            <span>Total</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
        </div>

        <button
          className="pos-new-order__take-payment"
          type="button"
          onClick={handleCheckout}
          disabled={cart.length === 0}
        >
          <CreditCard aria-hidden="true" />
          Take payment
        </button>
      </aside>

      <Dialog open={Boolean(sizeSelectItem)} onOpenChange={() => setSizeSelectItem(null)}>
        <DialogContent className="pos-new-order__size-dialog">
          <DialogHeader>
            <DialogTitle>Select a size</DialogTitle>
          </DialogHeader>

          {sizeSelectItem && (
            <div className="pos-new-order__size-dialog-content">
              <div className="pos-new-order__size-dialog-heading">
                <h3>{sizeSelectItem.name}</h3>
                {sizeSelectItem.description && <p>{sizeSelectItem.description}</p>}
              </div>

              <div className="pos-new-order__size-options">
                {sizeSelectItem.sizes?.map((size: MenuItemSize) => (
                  <button
                    key={size.id}
                    className="pos-new-order__size-option"
                    type="button"
                    onClick={() => handleSizeSelect(size)}
                  >
                    <span>{size.name}</span>
                    <strong>{formatCurrency(size.price)}</strong>
                  </button>
                ))}
                {sizeSelectItem.basePrice > 0 && (
                  <button
                    className="pos-new-order__size-option"
                    type="button"
                    onClick={() => {
                      addToCart(sizeSelectItem, 1, null);
                      setSizeSelectItem(null);
                    }}
                  >
                    <span>Regular</span>
                    <strong>{formatCurrency(sizeSelectItem.basePrice)}</strong>
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pendingOrder && (
        <CollectPaymentModal
          open={showPaymentModal}
          onOpenChange={(open) => {
            setShowPaymentModal(open);
            if (!open) setPendingOrder(null);
          }}
          venueId={resolvedVenueId || undefined}
          venueName={venueName}
          orderId={pendingOrder.id}
          orderTotal={pendingOrder.total}
          orderNumber={pendingOrder.orderNumber}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
}

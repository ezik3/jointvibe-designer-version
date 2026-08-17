import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  Armchair,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Eye,
  MapPin,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type DeliveryOrderDetails, useVenueDeliveryOrders } from "@/hooks/useVenueDeliveryOrders";
import { type Order, useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import PreOrders from "@/pages/POS/PreOrders";
import { getUrgencyBadge, sortByUrgency } from "@/utils/orderUrgency";
import { formatDistanceToNow } from "date-fns";
import "./pos-orders.css";

type OrdersTab = "orders" | "preorders";
type OrderFilter = "all" | "active" | Order["status"];

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function getStoredVenueId() {
  const storedVenueIdRaw = localStorage.getItem("jv_current_venue_id");
  const storedVenueId = storedVenueIdRaw && isUuid(storedVenueIdRaw) ? storedVenueIdRaw : null;

  if (storedVenueIdRaw && !storedVenueId) {
    localStorage.removeItem("jv_current_venue_id");
  }

  return storedVenueId;
}

function formatTime(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "Just now";
  }
}

function getStatusPresentation(status: Order["status"]) {
  switch (status) {
    case "pending":
      return { label: "New", className: "pos-orders-status--pending" };
    case "preparing":
      return { label: "Preparing", className: "pos-orders-status--preparing" };
    case "ready":
      return { label: "Ready", className: "pos-orders-status--ready" };
    case "served":
      return { label: "Completed", className: "pos-orders-status--served" };
    case "cancelled":
      return { label: "Cancelled", className: "pos-orders-status--cancelled" };
  }
}

function getService(order: Order, delivery?: DeliveryOrderDetails) {
  if (delivery) {
    return { label: delivery.deliveryAddress || "Delivery", Icon: MapPin };
  }

  if (order.tableNumber === "Delivery") {
    return { label: "Driver pickup", Icon: Truck };
  }

  if (order.tableNumber === "Takeaway") {
    return { label: "Collection counter", Icon: ShoppingBag };
  }

  if (order.tableNumber) {
    return {
      label: order.tableNumber.startsWith("Table") ? order.tableNumber : `Table ${order.tableNumber}`,
      Icon: Armchair,
    };
  }

  return { label: "Walk-in", Icon: ShoppingBag };
}

export default function Orders() {
  const { t } = useTranslation("pos");
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: OrdersTab = searchParams.get("tab") === "preorders" ? "preorders" : "orders";
  const [activeTab, setActiveTab] = useState<OrdersTab>(initialTab);
  const [venueId, setVenueId] = useState<string | null>(getStoredVenueId);
  const [venueName, setVenueName] = useState("JointVibe");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderFilter>("all");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!venueId) {
      setVenueId(getStoredVenueId());
    }

    const storedVenueName = localStorage.getItem("jv_current_venue_name");
    if (storedVenueName) {
      setVenueName(storedVenueName);
    }
  }, [venueId]);

  useEffect(() => {
    setSearchParams(activeTab === "preorders" ? { tab: "preorders" } : {}, { replace: true });
  }, [activeTab, setSearchParams]);

  const { orders, updateOrderStatus, loading } = useVenueOrdersDB(venueId);
  const { deliveryOrders, markReadyForPickup } = useVenueDeliveryOrders(venueId);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sortByUrgency(orders).filter((order) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active"
          ? ["pending", "preparing", "ready"].includes(order.status)
          : order.status === statusFilter);

      if (!matchesStatus) return false;
      if (!query) return true;

      const delivery = deliveryOrders.get(order.id);
      const searchable = [
        order.orderNumber,
        order.tableNumber,
        order.customerName,
        order.status,
        delivery?.customerName,
        delivery?.deliveryAddress,
        ...order.items.map((item) => item.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [deliveryOrders, orders, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pageOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);
  const newCount = orders.filter((order) => order.status === "pending").length;
  const preparingCount = orders.filter((order) => order.status === "preparing").length;
  const readyCount = orders.filter((order) => order.status === "ready").length;
  const selectedDelivery = selectedOrder ? deliveryOrders.get(selectedOrder.id) : undefined;

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, searchQuery, statusFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleAdvance = (order: Order, delivery?: DeliveryOrderDetails) => {
    if (order.status === "pending") {
      void updateOrderStatus(order.id, "preparing");
      return;
    }

    if (order.status === "preparing") {
      void updateOrderStatus(order.id, "ready");
      if (delivery) {
        void markReadyForPickup(delivery.id, order.id);
      }
      return;
    }

    if (order.status === "ready" && !delivery) {
      void updateOrderStatus(order.id, "served");
    }
  };

  const getAdvanceAction = (order: Order, delivery?: DeliveryOrderDetails) => {
    if (order.status === "pending") {
      return { label: "Start preparing", Icon: ChefHat };
    }

    if (order.status === "preparing") {
      return { label: delivery ? "Mark ready for pickup" : "Mark ready", Icon: PackageCheck };
    }

    if (order.status === "ready" && !delivery) {
      return { label: "Complete order", Icon: CircleCheck };
    }

    return null;
  };

  return (
    <div className={`pos-orders-page${activeTab === "preorders" ? " is-preorders" : ""}`}>
      <header className="pos-orders-topbar">
        <div>
          <span>{venueName.toUpperCase()}</span>
          <strong>Point of Sale</strong>
        </div>
        <p className={loading ? "is-syncing" : undefined}>
          <CircleCheck aria-hidden="true" />
          {loading ? "Syncing orders" : "Orders live"}
        </p>
      </header>

      <section className="pos-orders-heading">
        <div className="pos-orders-heading__copy">
          <div className="pos-orders-heading__title-row">
            <h1>Orders</h1>
            <section className="pos-orders-summary" aria-label="Order summary">
              <article className="pos-orders-summary__metric"><span>New orders</span><strong>{newCount}</strong></article>
              <article className="pos-orders-summary__metric"><span>Preparing</span><strong>{preparingCount}</strong></article>
              <article className="pos-orders-summary__metric"><span>Ready to serve</span><strong>{readyCount}</strong></article>
            </section>
          </div>
          <p>Track orders from creation through collection or table service.</p>
        </div>
        <Link className="pos-orders-new-order" to="/venue/pos/new-order">
          <Plus aria-hidden="true" />
          <span>{t("nav.new_order", { defaultValue: "New order" })}</span>
        </Link>
      </section>

      <div className="pos-orders-mode-tabs" role="tablist" aria-label="Order views">
        <button
          className={activeTab === "orders" ? "is-active" : undefined}
          type="button"
          role="tab"
          aria-selected={activeTab === "orders"}
          onClick={() => setActiveTab("orders")}
        >
          Orders
        </button>
        <button
          className={activeTab === "preorders" ? "is-active" : undefined}
          type="button"
          role="tab"
          aria-selected={activeTab === "preorders"}
          onClick={() => setActiveTab("preorders")}
        >
          <CalendarDays aria-hidden="true" />
          Pre-orders
        </button>
      </div>

      {activeTab === "preorders" ? (
        <PreOrders />
      ) : (
        <section className="pos-orders-workspace" aria-label="Orders">
          <div className="pos-orders-table-wrap">
            <div className="pos-orders-table-toolbar">
              <label className="pos-orders-search" htmlFor="pos-orders-search">
                <Search aria-hidden="true" />
                <input
                  id="pos-orders-search"
                  type="search"
                  placeholder="Search orders"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="pos-orders-filter" htmlFor="pos-orders-filter">
                <span className="sr-only">Filter orders</span>
                <select
                  id="pos-orders-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as OrderFilter)}
                >
                  <option value="all">All orders</option>
                  <option value="active">Active orders</option>
                  <option value="pending">New</option>
                  <option value="preparing">Preparing</option>
                  <option value="ready">Ready</option>
                  <option value="served">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
            </div>

            <div className="pos-orders-table-scroll">
              <table className="pos-orders-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Service</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th aria-label="Order actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageOrders.length === 0 ? (
                    <tr>
                      <td className="pos-orders-empty" colSpan={6}>
                        {loading ? "Loading orders..." : "No orders match this filter."}
                      </td>
                    </tr>
                  ) : (
                    pageOrders.map((order) => {
                      const delivery = deliveryOrders.get(order.id);
                      const service = getService(order, delivery);
                      const status = getStatusPresentation(order.status);
                      const action = getAdvanceAction(order, delivery);
                      const ServiceIcon = service.Icon;
                      const ActionIcon = action?.Icon;
                      const urgency = getUrgencyBadge(order);

                      return (
                        <tr key={order.id}>
                          <td>
                            <div className="pos-orders-table__order">
                              <strong>#{order.orderNumber}</strong>
                              <small>
                                {[order.customerName || "Walk-in", formatTime(order.createdAt), urgency.label].filter(Boolean).join(" / ")}
                              </small>
                            </div>
                          </td>
                          <td>
                            <span className="pos-orders-table__service">
                              <ServiceIcon aria-hidden="true" />
                              <span>{service.label}</span>
                            </span>
                          </td>
                          <td>{order.items.length} {order.items.length === 1 ? "item" : "items"}</td>
                          <td className="pos-orders-table__total">${order.total.toFixed(2)}</td>
                          <td><span className={`pos-orders-status ${status.className}`}>{status.label}</span></td>
                          <td className="pos-orders-table__actions">
                            <div>
                              {action && ActionIcon && (
                                <button
                                  className="pos-orders-action"
                                  type="button"
                                  onClick={() => handleAdvance(order, delivery)}
                                  aria-label={action.label}
                                  title={action.label}
                                >
                                  <ActionIcon aria-hidden="true" />
                                </button>
                              )}
                              <button
                                className="pos-orders-details-action"
                                type="button"
                                onClick={() => setSelectedOrder(order)}
                                aria-label={`View order ${order.orderNumber}`}
                                title="View order"
                              >
                                <Eye aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <footer className="pos-orders-pagination" aria-label="Order table pagination">
              <label className="pos-orders-pagination__size" htmlFor="pos-orders-page-size">
                <span>Rows per page</span>
                <select
                  id="pos-orders-page-size"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div className="pos-orders-pagination__pages" aria-live="polite">
                <span className="pos-orders-pagination__summary">{filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"}</span>
                <button
                  className="pos-orders-pagination__page"
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                {pageNumbers.map((page) => (
                  <button
                    className={`pos-orders-pagination__page${page === currentPage ? " is-active" : ""}`}
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    aria-label={`Page ${page}`}
                    aria-current={page === currentPage ? "page" : undefined}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="pos-orders-pagination__page"
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </footer>
          </div>
        </section>
      )}

      {selectedOrder && (
        <Dialog open onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="pos-orders-details-dialog">
            <DialogHeader className="pos-orders-details-dialog__header">
              <DialogTitle>Order #{selectedOrder.orderNumber}</DialogTitle>
              <DialogDescription>{formatTime(selectedOrder.createdAt)}</DialogDescription>
            </DialogHeader>
            <div className="pos-orders-details-dialog__body">
              <div className="pos-orders-details-dialog__meta">
                <div>
                  <span>Service</span>
                  <strong>{getService(selectedOrder, selectedDelivery).label}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>${selectedOrder.total.toFixed(2)}</strong>
                </div>
              </div>
              <div className="pos-orders-details-dialog__items">
                <span>Items</span>
                {selectedOrder.items.map((item) => (
                  <article key={item.id}>
                    <span>{item.quantity} x {item.name}{item.size ? ` (${item.size})` : ""}</span>
                    <strong>${(item.price * item.quantity).toFixed(2)}</strong>
                  </article>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

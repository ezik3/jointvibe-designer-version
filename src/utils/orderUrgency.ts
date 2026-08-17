/**
 * Smart Priority Queue — Order Urgency Scoring & Sorting
 * 
 * Pure utility: no side effects, no hooks, no component imports.
 * Used by Orders, KDS, Kitchen, and Dashboard to auto-sort orders.
 */

export type UrgencyLevel = "now" | "soon" | "upcoming" | "queued" | "scheduled";

export interface UrgencyBadge {
  level: UrgencyLevel;
  label: string;
  colorClass: string;
  minutesLeft: number;
}

interface OrderLike {
  id: string;
  status: string;
  createdAt: string;
  scheduledFor?: string;
  isPreorder?: boolean;
  reservationId?: string;
  notes?: string;
}

/**
 * Detect order type from notes string (set by RemoteOrderModal)
 */
function getOrderType(order: OrderLike): "delivery" | "pickup" | "dine-in" | "walk-in" {
  const notes = (order as any).notes || "";
  if (notes.includes("DELIVERY ORDER")) return "delivery";
  if (notes.includes("PICKUP ORDER")) return "pickup";
  if (notes.includes("DINE-IN PRE-ORDER") || order.isPreorder || order.reservationId) return "dine-in";
  return "walk-in";
}

/**
 * Type weight for tiebreaking (lower = higher priority)
 */
function getTypeWeight(type: ReturnType<typeof getOrderType>): number {
  switch (type) {
    case "delivery": return 0;
    case "dine-in": return 1;
    case "pickup": return 2;
    case "walk-in": return 3;
  }
}

/**
 * Calculate the deadline timestamp for an order.
 * Returns epoch ms of when this order should be ready.
 */
export function getOrderDeadline(order: OrderLike): number {
  const type = getOrderType(order);
  const created = new Date(order.createdAt).getTime();

  if (order.scheduledFor) {
    const scheduled = new Date(order.scheduledFor).getTime();
    switch (type) {
      case "delivery": return scheduled - 5 * 60 * 1000; // 5 min driver buffer
      case "dine-in": return scheduled - 15 * 60 * 1000; // 15 min prep buffer
      case "pickup": return scheduled;
      default: return scheduled;
    }
  }

  // ASAP defaults
  switch (type) {
    case "delivery": return created + 20 * 60 * 1000;
    case "dine-in": return created + 15 * 60 * 1000;
    case "pickup": return created + 15 * 60 * 1000;
    case "walk-in": return created + 10 * 60 * 1000;
  }
}

/**
 * Get urgency score (lower = more urgent). Includes type tiebreaker.
 */
export function getOrderUrgencyScore(order: OrderLike): number {
  const deadline = getOrderDeadline(order);
  const type = getOrderType(order);
  // Tiebreaker: add a tiny fraction based on type weight
  return deadline + getTypeWeight(type) * 0.001;
}

/**
 * Get the urgency badge for display
 */
export function getUrgencyBadge(order: OrderLike): UrgencyBadge {
  const deadline = getOrderDeadline(order);
  const now = Date.now();
  const minutesLeft = Math.round((deadline - now) / 60000);

  // Future pre-orders/reservations (more than 60 min away & is scheduled)
  if (minutesLeft > 60 && (order.scheduledFor || order.isPreorder)) {
    return {
      level: "scheduled",
      label: "SCHEDULED",
      colorClass: "bg-blue-500/20 text-blue-400",
      minutesLeft,
    };
  }

  if (minutesLeft <= 5) {
    return {
      level: "now",
      label: "NOW",
      colorClass: "bg-red-500/20 text-red-400",
      minutesLeft,
    };
  }

  if (minutesLeft <= 15) {
    return {
      level: "soon",
      label: "SOON",
      colorClass: "bg-orange-500/20 text-orange-400",
      minutesLeft,
    };
  }

  if (minutesLeft <= 30) {
    return {
      level: "upcoming",
      label: "UPCOMING",
      colorClass: "bg-yellow-500/20 text-yellow-400",
      minutesLeft,
    };
  }

  return {
    level: "queued",
    label: "QUEUED",
    colorClass: "bg-green-500/20 text-green-400",
    minutesLeft,
  };
}

/**
 * Format the ETA for display (e.g., "Ready by 7:30 PM" or "ASAP")
 */
export function formatOrderETA(order: OrderLike): string {
  if (!order.scheduledFor) return "ASAP";
  try {
    return `Ready by ${new Date(order.scheduledFor).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "ASAP";
  }
}

/**
 * Sort orders by urgency (most urgent first).
 * Only sorts active orders (pending/preparing). Ready/served stay in original order.
 */
export function sortByUrgency<T extends OrderLike>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    // Active orders first
    const activeStatuses = ["pending", "preparing"];
    const aActive = activeStatuses.includes(a.status);
    const bActive = activeStatuses.includes(b.status);
    
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    
    // Both active or both inactive — sort by urgency
    return getOrderUrgencyScore(a) - getOrderUrgencyScore(b);
  });
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Armchair,
  CalendarClock,
  CalendarX,
  CircleCheck,
  Clock3,
  PanelsTopLeft,
  Plus,
  ReceiptText,
  SearchX,
  ShoppingCart,
  Trash2,
  UserCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePOS } from "@/contexts/POSContext";
import { supabase } from "@/integrations/supabase/client";
import { type Order, useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import { type TableReservation, useReservations } from "@/hooks/useReservations";
import { usePOSTableAvailability } from "@/hooks/usePOSTableAvailability";
import { toast } from "sonner";
import "./tables.css";

type TableStatus = "available" | "occupied" | "reserved";
type TableFilter = "all" | TableStatus;

interface CheckedInGuest {
  displayName: string;
  checkedInAt: string;
}

interface TableViewModel {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string;
  status: TableStatus;
  customer?: CheckedInGuest;
  orders: Order[];
  reservation?: TableReservation;
  duration: string;
  openSpend: number;
}

const tableFilters: Array<{ value: TableFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "occupied", label: "In service" },
  { value: "reserved", label: "Reserved" },
];

const activeReservationStatuses = new Set(["pending", "confirmed", "awaiting_deposit"]);

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

function normalizeTableReference(value?: string | null) {
  const compact = (value || "").trim().toLowerCase().replace(/\s+/g, "");

  if (compact.startsWith("table")) {
    return compact.slice(5);
  }

  if (/^t\d/.test(compact)) {
    return compact.slice(1);
  }

  return compact;
}

function isSameTable(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeTableReference(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeTableReference(right);
}

function formatTableNumber(tableNumber: string) {
  const trimmed = tableNumber.trim();

  if (/^table\s*/i.test(trimmed)) {
    return `T${trimmed.replace(/^table\s*/i, "")}`;
  }

  if (/^t/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return `T${trimmed}`;
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatDuration(startedAt: string | undefined, now: number) {
  if (!startedAt) {
    return "";
  }

  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) {
    return "";
  }

  const minutes = Math.max(0, Math.floor((now - start) / 60000));
  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatReservationTime(time?: string) {
  if (!time) {
    return "Scheduled";
  }

  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return time;
  }

  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, hours, minutes),
  );
}

function getRequestedTable(reservation: TableReservation) {
  return reservation.specialRequests?.match(/requested table:\s*((?:table|t)\s*[^,;\s]+|[^,;\s]+)/i)?.[1];
}

function getStatusLabel(status: TableStatus) {
  return status === "occupied" ? "In service" : status[0].toUpperCase() + status.slice(1);
}

function getStatusClass(status: TableStatus) {
  return `pos-tables-status--${status}`;
}

function getNextTableNumber(tables: TableViewModel[]) {
  const largestNumber = tables.reduce((largest, table) => {
    const match = table.tableNumber.match(/(\d+)\s*$/);
    return Math.max(largest, match ? Number(match[1]) : 0);
  }, 0);

  return String(largestNumber + 1 || tables.length + 1);
}

function getTableNumberVariants(tableNumber: string) {
  const normalized = normalizeTableReference(tableNumber);
  return [...new Set([tableNumber, `Table ${normalized}`, `T${normalized}`])];
}

function canManageFloorplan() {
  if (localStorage.getItem("work_mode") !== "true") {
    return true;
  }

  try {
    return JSON.parse(localStorage.getItem("work_mode_permissions") || "{}").floorplan === true;
  } catch {
    return false;
  }
}

export default function Tables() {
  const { venueId: contextVenueId } = usePOS();
  const navigate = useNavigate();
  const venueId = isUuid(contextVenueId) ? contextVenueId : getStoredVenueId();
  const [venueName, setVenueName] = useState("JointVibe");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TableFilter>("all");
  const [now, setNow] = useState(() => Date.now());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("4");
  const [newTableSection, setNewTableSection] = useState("Main floor");
  const [createError, setCreateError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const {
    tables,
    loading: tablesLoading,
    createTable,
    updateTable,
    deleteTable,
    refresh: refreshTables,
  } = usePOSTableAvailability(venueId);
  const { orders, loading: ordersLoading, updateOrderStatus } = useVenueOrdersDB(venueId);
  const {
    reservations,
    loading: reservationsLoading,
    fetchReservations,
    updateReservationStatus,
  } = useReservations(venueId);
  const allowFloorplanEditing = useMemo(canManageFloorplan, []);

  useEffect(() => {
    const storedVenueName = localStorage.getItem("jv_current_venue_name");
    if (storedVenueName) {
      setVenueName(storedVenueName);
    }
  }, []);

  useEffect(() => {
    void fetchReservations();
  }, [fetchReservations]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const activeOrders = useMemo(
    () => orders.filter((order) => ["pending", "preparing", "ready"].includes(order.status)),
    [orders],
  );

  const activeReservations = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    return reservations
      .filter((reservation) => activeReservationStatuses.has(reservation.status) && reservation.reservationDate >= today)
      .sort((left, right) => `${left.reservationDate}T${left.startTime}`.localeCompare(`${right.reservationDate}T${right.startTime}`));
  }, [reservations]);

  const tableViews = useMemo<TableViewModel[]>(() => {
    return tables.map((table) => {
      const tableOrders = activeOrders.filter((order) => isSameTable(order.tableNumber, table.tableNumber));
      const reservation = activeReservations.find(
        (entry) =>
          entry.tableId === table.id ||
          isSameTable(entry.tableName, table.tableNumber) ||
          isSameTable(getRequestedTable(entry), table.tableNumber),
      );
      const openSpend = tableOrders.reduce((sum, order) => sum + order.total, 0);
      const orderStart = tableOrders
        .map((order) => order.createdAt)
        .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];
      const isOccupied = table.status === "occupied" || tableOrders.length > 0 || Boolean(table.customer);
      const status: TableStatus = isOccupied ? "occupied" : reservation || table.status === "reserved" ? "reserved" : "available";

      return {
        id: table.id,
        tableNumber: table.tableNumber,
        capacity: table.capacity,
        section: table.section || "Main floor",
        status,
        customer: table.customer,
        orders: tableOrders,
        reservation,
        duration: formatDuration(table.customer?.checkedInAt || orderStart, now),
        openSpend,
      };
    });
  }, [activeOrders, activeReservations, now, tables]);

  useEffect(() => {
    setSelectedTableId((current) => (current && !tableViews.some((table) => table.id === current) ? null : current));
  }, [tableViews]);

  const filteredTables = filter === "all" ? tableViews : tableViews.filter((table) => table.status === filter);
  const selectedTable = tableViews.find((table) => table.id === selectedTableId);
  const availableCount = tableViews.filter((table) => table.status === "available").length;
  const occupiedCount = tableViews.filter((table) => table.status === "occupied").length;
  const reservedCount = tableViews.filter((table) => table.status === "reserved").length;
  const openSpend = tableViews.reduce((sum, table) => sum + table.openSpend, 0);
  const loading = tablesLoading || ordersLoading || reservationsLoading;
  const floorSummary = tableViews.length === 0
    ? "Configure your floor plan to add tables."
    : `${availableCount} ready to seat, ${occupiedCount} currently in service.`;

  const startOrder = (table?: TableViewModel) => {
    if (!table) {
      navigate("/venue/pos/new-order");
      return;
    }

    navigate(`/venue/pos/new-order?table=${encodeURIComponent(table.tableNumber)}`);
  };

  const handleSeatGuests = async () => {
    if (!selectedTable) return;

    setIsMutating(true);
    try {
      const updated = await updateTable(selectedTable.id, { status: "occupied" });
      if (!updated) {
        toast.error("The table could not be seated. Try again.");
        return;
      }

      startOrder(selectedTable);
    } catch (error) {
      console.error("Failed to seat table:", error);
      toast.error("The table could not be seated. Try again.");
    } finally {
      setIsMutating(false);
    }
  };

  const openReservations = () => navigate("/venue/reservations");

  const openCreateTableDialog = () => {
    setNewTableNumber(getNextTableNumber(tableViews));
    setNewTableCapacity("4");
    setNewTableSection("Main floor");
    setCreateError("");
    setIsCreateDialogOpen(true);
  };

  const handleCreateTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tableNumber = newTableNumber.trim();
    const capacity = Number(newTableCapacity);

    if (!tableNumber) {
      setCreateError("Enter a table number.");
      return;
    }

    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 30) {
      setCreateError("Capacity must be between 1 and 30 guests.");
      return;
    }

    if (tableViews.some((table) => isSameTable(table.tableNumber, tableNumber))) {
      setCreateError(`Table ${tableNumber} already exists.`);
      return;
    }

    setIsMutating(true);
    try {
      const created = await createTable({
        tableNumber,
        capacity,
        section: newTableSection,
      });

      if (!created) {
        setCreateError("The table could not be saved. Try again.");
        return;
      }

      setSelectedTableId(created.id);
      setIsCreateDialogOpen(false);
      toast.success(`Table ${created.tableNumber} created`);
    } finally {
      setIsMutating(false);
    }
  };

  const handleClearTable = async () => {
    if (!selectedTable) return;

    setIsMutating(true);
    try {
      await Promise.all(selectedTable.orders.map((order) => updateOrderStatus(order.id, "served")));

      if (venueId) {
        const { error } = await supabase
          .from("check_ins")
          .update({ checked_out_at: new Date().toISOString() })
          .eq("venue_id", venueId)
          .in("table_number", getTableNumberVariants(selectedTable.tableNumber))
          .is("checked_out_at", null);

        if (error) throw error;
      }

      const updated = await updateTable(selectedTable.id, { status: "available" });
      if (!updated) throw new Error("Table status could not be updated.");

      await refreshTables();
      toast.success(`${formatTableNumber(selectedTable.tableNumber)} is ready to seat`);
    } catch (error) {
      console.error("Failed to clear table:", error);
      toast.error("Failed to clear this table");
    } finally {
      setIsMutating(false);
    }
  };

  const handleReleaseTable = async () => {
    if (!selectedTable) return;

    setIsMutating(true);
    try {
      if (selectedTable.reservation) {
        const released = await updateReservationStatus(
          selectedTable.reservation.id,
          "cancelled",
          "Released from the POS tables panel",
        );
        if (!released) return;
      }

      const updated = await updateTable(selectedTable.id, { status: "available" });
      if (!updated) throw new Error("Table status could not be updated.");

      await refreshTables();
      toast.success(`${formatTableNumber(selectedTable.tableNumber)} is available again`);
    } catch (error) {
      console.error("Failed to release table:", error);
      toast.error("Failed to release this table");
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!selectedTable) return;

    setIsMutating(true);
    try {
      const deleted = await deleteTable(selectedTable.id);
      if (!deleted) throw new Error("Table could not be deleted.");

      setSelectedTableId(null);
      setPendingDelete(false);
      toast.success(`${formatTableNumber(selectedTable.tableNumber)} deleted`);
    } catch (error) {
      console.error("Failed to delete table:", error);
      toast.error("Failed to delete this table");
    } finally {
      setIsMutating(false);
    }
  };

  const requestDeleteTable = () => {
    if (!selectedTable) return;
    if (selectedTable.status !== "available") {
      toast.error("Clear or release this table before deleting it.");
      return;
    }
    setPendingDelete(true);
  };

  return (
    <div className="pos-tables-page">
      <header className="pos-tables-topbar">
        <div>
          <span>{venueName.toUpperCase()}</span>
          <strong>Point of Sale</strong>
        </div>
        {allowFloorplanEditing && (
          <Link className="pos-tables-button pos-tables-button--secondary pos-tables-button--compact" to="/venue/pos/floorplan">
            <PanelsTopLeft aria-hidden="true" />
            <span>Edit floorplan</span>
          </Link>
        )}
      </header>

      <section className="pos-tables-heading">
        <div className="pos-tables-heading__copy">
          <div className="pos-tables-heading__title-row">
            <h1>Tables</h1>
            <section className="pos-tables-summary" aria-label="Table summary">
              <article className="pos-tables-summary__metric"><span>Available</span><strong>{availableCount}</strong></article>
              <article className="pos-tables-summary__metric"><span>In service</span><strong>{occupiedCount}</strong></article>
              <article className="pos-tables-summary__metric"><span>Reserved</span><strong>{reservedCount}</strong></article>
              <article className="pos-tables-summary__metric"><span>Open spend</span><strong>{formatCurrency(openSpend)}</strong></article>
            </section>
          </div>
          <p>Manage your floor, capacity, and active table service.</p>
        </div>
        {allowFloorplanEditing && (
          <button className="pos-tables-button pos-tables-button--primary" type="button" onClick={openCreateTableDialog}>
            <Plus aria-hidden="true" />
            <span>Create table</span>
          </button>
        )}
      </section>

      <section className="pos-tables-workspace" aria-label="Floor tables">
        <div className="pos-tables-floor">
          <div className="pos-tables-floor__header">
            <div>
              <h2>Main floor</h2>
              <p>{floorSummary}</p>
            </div>
            <div className="pos-tables-tabs" role="tablist" aria-label="Table status filters">
              {tableFilters.map(({ value, label }) => (
                <button
                  className={filter === value ? "is-active" : undefined}
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading && tableViews.length === 0 ? (
            <p className="pos-tables-empty" role="status">
              <Clock3 aria-hidden="true" />
              Loading floor tables...
            </p>
          ) : filteredTables.length === 0 ? (
            <p className="pos-tables-empty">
              <SearchX aria-hidden="true" />
              {tableViews.length === 0 ? "No tables are configured yet." : "No tables match this filter."}
            </p>
          ) : (
            <div className="pos-tables-grid">
              {filteredTables.map((table) => (
                <button
                  className={`pos-tables-card${selectedTableId === table.id ? " is-selected" : ""}`}
                  key={table.id}
                  type="button"
                  onClick={() => setSelectedTableId(table.id)}
                  aria-pressed={selectedTableId === table.id}
                >
                  <span className="pos-tables-card__top">
                    <strong>{formatTableNumber(table.tableNumber)}</strong>
                    <span className={`pos-tables-status ${getStatusClass(table.status)}`}>{getStatusLabel(table.status)}</span>
                  </span>
                  <span className="pos-tables-card__footer">
                    <span className="pos-tables-card__guests"><UsersRound aria-hidden="true" />{table.capacity}</span>
                    {table.status === "occupied" && table.duration ? (
                      <span><Clock3 aria-hidden="true" />{table.duration}</span>
                    ) : table.status === "reserved" ? (
                      <span><CalendarClock aria-hidden="true" />{formatReservationTime(table.reservation?.startTime)}</span>
                    ) : (
                      <span>Ready to seat</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="pos-tables-detail" aria-live="polite">
          {selectedTable ? (
            <>
              <header className="pos-tables-detail__header">
                <div>
                  <h2>{formatTableNumber(selectedTable.tableNumber)}</h2>
                  <p>{selectedTable.section}</p>
                </div>
                <span className={`pos-tables-status ${getStatusClass(selectedTable.status)}`}>{getStatusLabel(selectedTable.status)}</span>
              </header>

              <dl className="pos-tables-detail__facts">
                {selectedTable.status === "available" ? (
                  <>
                    <div><dt>Capacity</dt><dd>{selectedTable.capacity} guests</dd></div>
                    <div><dt>Area</dt><dd>{selectedTable.section}</dd></div>
                    <div><dt>Status</dt><dd>Ready to seat</dd></div>
                  </>
                ) : selectedTable.status === "occupied" ? (
                  <>
                    <div><dt>Guests</dt><dd>{selectedTable.customer?.displayName || "Active table service"}</dd></div>
                    <div><dt>Area</dt><dd>{selectedTable.section}</dd></div>
                    <div><dt>Open check</dt><dd>{formatCurrency(selectedTable.openSpend)}</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt>Guest</dt><dd>{selectedTable.reservation?.customerName || "Reserved guest"}</dd></div>
                    <div><dt>Area</dt><dd>{selectedTable.section}</dd></div>
                    <div><dt>Arrival</dt><dd>{formatReservationTime(selectedTable.reservation?.startTime)}</dd></div>
                  </>
                )}
              </dl>

              <div className="pos-tables-detail__actions">
                {selectedTable.status === "available" && (
                  <button className="pos-tables-button pos-tables-button--primary" type="button" disabled={isMutating} onClick={() => void handleSeatGuests()}>
                    <UserPlus aria-hidden="true" />
                    <span>{isMutating ? "Seating..." : "Seat guests"}</span>
                  </button>
                )}
                {selectedTable.status === "occupied" && (
                  <button className="pos-tables-button pos-tables-button--primary" type="button" onClick={() => startOrder(selectedTable)}>
                    <ShoppingCart aria-hidden="true" />
                    <span>Add to order</span>
                  </button>
                )}
                {selectedTable.status === "reserved" && (
                  <button className="pos-tables-button pos-tables-button--primary" type="button" onClick={openReservations}>
                    <CalendarClock aria-hidden="true" />
                    <span>Open reservations</span>
                  </button>
                )}
                {selectedTable.status === "occupied" && (
                  <button className="pos-tables-button pos-tables-button--secondary" type="button" onClick={() => navigate("/venue/pos/orders")}>
                    <ReceiptText aria-hidden="true" />
                    <span>View orders</span>
                  </button>
                )}
                {selectedTable.status === "occupied" && (
                  <button className="pos-tables-button pos-tables-button--secondary" type="button" disabled={isMutating} onClick={() => void handleClearTable()}>
                    <CircleCheck aria-hidden="true" />
                    <span>{isMutating ? "Clearing..." : "Clear table"}</span>
                  </button>
                )}
                {selectedTable.status === "reserved" && (
                  <button className="pos-tables-button pos-tables-button--secondary" type="button" disabled={isMutating} onClick={() => void handleReleaseTable()}>
                    <CalendarX aria-hidden="true" />
                    <span>{isMutating ? "Releasing..." : "Release table"}</span>
                  </button>
                )}
                {allowFloorplanEditing && (
                  <Link className="pos-tables-button pos-tables-button--secondary" to="/venue/pos/floorplan">
                    <PanelsTopLeft aria-hidden="true" />
                    <span>Edit floorplan</span>
                  </Link>
                )}
                {allowFloorplanEditing && (
                  <button className="pos-tables-button pos-tables-button--danger" type="button" disabled={isMutating} onClick={requestDeleteTable}>
                    <Trash2 aria-hidden="true" />
                    <span>Delete table</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="pos-tables-detail__empty">
              <Armchair aria-hidden="true" />
              <span>Select a table to view its service details.</span>
            </div>
          )}
        </aside>
      </section>

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        setIsCreateDialogOpen(open);
        if (!open) setCreateError("");
      }}>
        <DialogContent className="pos-tables-dialog">
          <DialogHeader>
            <DialogTitle>Create table</DialogTitle>
            <DialogDescription>Add a table and place it in a floor-plan area.</DialogDescription>
          </DialogHeader>
          <form className="pos-tables-create-form" onSubmit={(event) => void handleCreateTable(event)}>
            <label>
              <span>Table number</span>
              <input value={newTableNumber} onChange={(event) => setNewTableNumber(event.target.value)} inputMode="numeric" autoFocus required />
            </label>
            <label>
              <span>Capacity</span>
              <input type="number" min="1" max="30" value={newTableCapacity} onChange={(event) => setNewTableCapacity(event.target.value)} required />
            </label>
            <label className="pos-tables-create-form__wide">
              <span>Area in floor plan</span>
              <input value={newTableSection} onChange={(event) => setNewTableSection(event.target.value)} required />
            </label>
            {createError && <p className="pos-tables-create-form__error" role="alert">{createError}</p>}
            <footer>
              <button className="pos-tables-button pos-tables-button--secondary" type="button" disabled={isMutating} onClick={() => setIsCreateDialogOpen(false)}>Cancel</button>
              <button className="pos-tables-button pos-tables-button--primary" type="submit" disabled={isMutating}>
                <UserCheck aria-hidden="true" />
                <span>{isMutating ? "Creating..." : "Create table"}</span>
              </button>
            </footer>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent className="pos-tables-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTable ? formatTableNumber(selectedTable.tableNumber) : "table"}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the table from the venue floor plan. Existing order history is retained.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="pos-tables-confirm-dialog__delete" disabled={isMutating} onClick={() => void handleDeleteTable()}>
              {isMutating ? "Deleting..." : "Delete table"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

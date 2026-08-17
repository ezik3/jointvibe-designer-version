import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { addDays, endOfDay, endOfWeek, format, isBefore, isToday, isTomorrow, parseISO, startOfDay, startOfWeek } from "date-fns";
import {
  CalendarDays,
  CalendarCheck2,
  CalendarPlus,
  ChevronDown,
  CheckCircle2,
  ChefHat,
  Clock,
  DollarSign,
  Eye,
  ListFilter,
  Plus,
  Table2,
  Users,
  XCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReservations, type TableReservation } from "@/hooks/useReservations";
import { supabase } from "@/integrations/supabase/client";
import { readVenueTablesSync } from "@/lib/venueFloorplanStorage";
import { toast } from "sonner";
import "./venue-reservations.css";

const reservationViews = {
  today: {
    label: "Today's reservations",
    title: "No reservations today",
    copy: "Reservations for today will appear here when guests book a table.",
  },
  upcoming: {
    label: "Upcoming reservations",
    title: "No upcoming reservations",
    copy: "New reservations will appear here as guests book a table.",
  },
  preorders: {
    label: "Pre-orders",
    title: "No pre-orders yet",
    copy: "Guest pre-orders linked to reservations will appear here.",
  },
  pending: {
    label: "Pending confirmations",
    title: "No confirmations pending",
    copy: "Reservations waiting for a staff response will appear here.",
  },
  past: {
    label: "Past reservations",
    title: "No past reservations",
    copy: "Completed and cancelled reservations will appear here.",
  },
} as const;

type ReservationView = keyof typeof reservationViews;

const reservationTabs: ReservationView[] = ["today", "upcoming", "preorders", "pending", "past"];

type ReservationDateRange = "this_week" | "next_seven_days" | "all_dates";
type ReservationStatusFilter = "all" | "confirmed" | "pending" | "preorders";

const reservationDateRanges: Array<{ id: ReservationDateRange; label: string }> = [
  { id: "this_week", label: "This week" },
  { id: "next_seven_days", label: "Next 7 days" },
  { id: "all_dates", label: "All dates" },
];

const reservationStatusFilters: Array<{ id: ReservationStatusFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "confirmed", label: "Confirmed" },
  { id: "pending", label: "Pending" },
  { id: "preorders", label: "Pre-orders" },
];

interface ReservationTableOption {
  id: string;
  label: string;
}

interface ManualReservationFormData {
  customerName: string;
  partySize: string;
  reservationDate: string;
  startTime: string;
  tableId: string;
  specialRequests: string;
}

const createManualReservationForm = (): ManualReservationFormData => ({
  customerName: "",
  partySize: "2",
  reservationDate: format(new Date(), "yyyy-MM-dd"),
  startTime: "19:00",
  tableId: "",
  specialRequests: "",
});

const getStatusBadge = (
  status: string,
  depositRequired: boolean,
  depositPaid: boolean,
  depositDeadline: string | null,
) => {
  if (status === "awaiting_deposit" && depositRequired && !depositPaid && depositDeadline) {
    const deadline = parseISO(depositDeadline);
    if (isBefore(deadline, new Date())) {
      return <span className="venue-reservations-status venue-reservations-status--overdue">Deposit overdue</span>;
    }
  }

  const statusLabels: Record<string, string> = {
    confirmed: "Confirmed",
    pending: "Pending",
    awaiting_deposit: "Awaiting deposit",
    cancelled: "Cancelled",
    completed: "Completed",
    no_show: "No show",
  };

  return (
    <span className={`venue-reservations-status venue-reservations-status--${status}`}>
      {statusLabels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
};

const getDateLabel = (dateStr: string) => {
  const date = parseISO(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
};

export default function VenueReservations() {
  const [venueId, setVenueId] = useState<string | null>(() => localStorage.getItem("jv_current_venue_id"));
  const [venueLoading, setVenueLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReservationView>("upcoming");
  const [dateRange, setDateRange] = useState<ReservationDateRange>("this_week");
  const [statusFilter, setStatusFilter] = useState<ReservationStatusFilter>("all");
  const [openToolbarMenu, setOpenToolbarMenu] = useState<"date" | "filter" | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<TableReservation | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showNewReservationModal, setShowNewReservationModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [manualReservation, setManualReservation] = useState<ManualReservationFormData>(createManualReservationForm);
  const [creatingReservation, setCreatingReservation] = useState(false);
  const [tableOptions, setTableOptions] = useState<ReservationTableOption[]>([]);

  useEffect(() => {
    const fetchVenueFromUser = async () => {
      let resolvedVenueId: string | null = null;

      try {
        const storedVenueId = localStorage.getItem("jv_current_venue_id");
        if (storedVenueId) {
          resolvedVenueId = storedVenueId;
          setVenueId(storedVenueId);
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data: venue } = await supabase
          .from("venues")
          .select("id")
          .eq("owner_user_id", user.id)
          .maybeSingle();

        resolvedVenueId = venue?.id ?? null;

        if (!resolvedVenueId) {
          const { data: link } = await supabase
            .from("employee_venue_links")
            .select("venue_id")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .maybeSingle();

          resolvedVenueId = link?.venue_id ?? null;
        }

        if (resolvedVenueId) {
          localStorage.setItem("jv_current_venue_id", resolvedVenueId);
          setVenueId(resolvedVenueId);
        }
      } finally {
        if (!resolvedVenueId) setVenueLoading(false);
      }
    };

    void fetchVenueFromUser();
  }, []);

  const {
    reservations,
    loading,
    fetchReservations,
    createManualReservation,
    updateReservationStatus,
    markDepositPaid,
  } = useReservations(venueId);

  useEffect(() => {
    if (venueId) {
      void fetchReservations().finally(() => setVenueLoading(false));
    }
  }, [fetchReservations, venueId]);

  useEffect(() => {
    if (!venueId) {
      setTableOptions([]);
      return;
    }

    let active = true;

    const loadTableOptions = async () => {
      const { data: floorplans } = await supabase
        .from("floorplans")
        .select("id")
        .eq("venue_id", venueId);

      if (!active) return;

      const floorplanIds = (floorplans || []).map((floorplan) => floorplan.id);
      if (floorplanIds.length > 0) {
        const { data: tables } = await supabase
          .from("venue_tables")
          .select("id, table_number")
          .in("floorplan_id", floorplanIds)
          .order("table_number");

        if (tables?.length) {
          setTableOptions(tables.map((table) => ({
            id: table.id,
            label: `Table ${table.table_number}`,
          })));
          return;
        }
      }

      const storedTables = readVenueTablesSync<unknown[]>(venueId);
      if (!Array.isArray(storedTables)) {
        if (active) setTableOptions([]);
        return;
      }

      const localOptions = storedTables.flatMap((table, index) => {
        if (!table || typeof table !== "object" || !("id" in table)) return [];
        const localTable = table as Record<string, unknown>;
        const id = String(localTable.id);
        const number = localTable.number ?? index + 1;
        return [{ id, label: `Table ${String(number)}` }];
      });
      if (active) setTableOptions(localOptions);
    };

    void loadTableOptions();
    return () => {
      active = false;
    };
  }, [venueId]);

  const filterReservations = (tab: ReservationView): TableReservation[] => {
    const today = format(new Date(), "yyyy-MM-dd");
    const baseReservations = (() => {
      switch (tab) {
      case "today":
          return reservations.filter((reservation) => reservation.reservationDate === today && reservation.status !== "cancelled");
      case "upcoming":
          return reservations.filter((reservation) => reservation.reservationDate >= today && reservation.status !== "cancelled");
      case "preorders":
          return reservations.filter((reservation) => reservation.hasPreOrder && reservation.status !== "cancelled");
      case "pending":
          return reservations.filter((reservation) => ["pending", "awaiting_deposit"].includes(reservation.status));
      case "past":
          return reservations.filter((reservation) => reservation.reservationDate < today || ["completed", "cancelled", "no_show"].includes(reservation.status));
      }
    })();

    const now = new Date();
    const dateRangeStart = dateRange === "this_week"
      ? startOfWeek(now, { weekStartsOn: 1 })
      : startOfDay(now);
    const dateRangeEnd = dateRange === "this_week"
      ? endOfWeek(now, { weekStartsOn: 1 })
      : endOfDay(addDays(now, 6));

    return baseReservations.filter((reservation) => {
      const reservationDate = parseISO(reservation.reservationDate);
      const isInSelectedDateRange = dateRange === "all_dates" || (
        reservationDate >= dateRangeStart && reservationDate <= dateRangeEnd
      );

      if (!isInSelectedDateRange) return false;
      if (statusFilter === "confirmed") return reservation.status === "confirmed";
      if (statusFilter === "pending") return ["pending", "awaiting_deposit"].includes(reservation.status);
      if (statusFilter === "preorders") return reservation.hasPreOrder;
      return true;
    });
  };

  const handleConfirm = async (reservation: TableReservation) => {
    await updateReservationStatus(reservation.id, "confirmed");
  };

  const handleCancel = async () => {
    if (!selectedReservation) return;

    await updateReservationStatus(selectedReservation.id, "cancelled", cancelReason);
    setShowCancelModal(false);
    setCancelReason("");
    setSelectedReservation(null);
  };

  const handleMarkComplete = async (reservation: TableReservation) => {
    await updateReservationStatus(reservation.id, "completed");
  };

  const handleMarkNoShow = async (reservation: TableReservation) => {
    await updateReservationStatus(reservation.id, "no_show");
  };

  const handleDepositConfirm = async (reservation: TableReservation) => {
    await markDepositPaid(reservation.id);
  };

  const filteredList = filterReservations(activeTab);
  const activeView = reservationViews[activeTab];
  const activeDateRangeLabel = reservationDateRanges.find((range) => range.id === dateRange)?.label ?? "This week";

  const openDetails = (reservation: TableReservation) => {
    setSelectedReservation(reservation);
    setShowDetailsModal(true);
  };

  const openCancel = (reservation: TableReservation) => {
    setSelectedReservation(reservation);
    setShowCancelModal(true);
  };

  const openNewReservation = () => {
    setManualReservation(createManualReservationForm());
    setShowNewReservationModal(true);
  };

  const handleManualReservationChange = <Field extends keyof ManualReservationFormData>(
    field: Field,
    value: ManualReservationFormData[Field],
  ) => {
    setManualReservation((current) => ({ ...current, [field]: value }));
  };

  const handleCreateManualReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!venueId) {
      toast.error("No venue selected");
      return;
    }

    const partySize = Number.parseInt(manualReservation.partySize, 10);
    if (!manualReservation.customerName.trim() || !manualReservation.reservationDate || !manualReservation.startTime || partySize < 1 || partySize > 30) {
      toast.error("Enter the guest, party size, date, and time");
      return;
    }

    setCreatingReservation(true);
    try {
      const created = await createManualReservation({
        venueId,
        tableId: manualReservation.tableId || null,
        reservationDate: parseISO(manualReservation.reservationDate),
        startTime: manualReservation.startTime,
        partySize,
        customerName: manualReservation.customerName,
        specialRequests: manualReservation.specialRequests,
      });

      if (!created) return;

      setActiveTab("upcoming");
      setShowNewReservationModal(false);
      setManualReservation(createManualReservationForm());
      toast.success("Reservation created");
    } finally {
      setCreatingReservation(false);
    }
  };

  return (
    <div className="venue-reservations-page">
      <header className="venue-reservations-heading">
        <div>
          <h1>Reservations</h1>
          <p>Manage upcoming guest tables and pre-orders.</p>
        </div>
        <button className="venue-reservations-button venue-reservations-button--primary" type="button" onClick={openNewReservation}>
          <Plus aria-hidden="true" />
          <span>New reservation</span>
        </button>
      </header>

      <section className="venue-reservations-toolbar" aria-label="Reservation filters">
        <div className="venue-reservations-tabs" role="tablist" aria-label="Reservation status">
          {reservationTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                className={`venue-reservations-tab${isActive ? " venue-reservations-tab--active" : ""}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "preorders" ? "Pre-orders" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            );
          })}
        </div>
        <div className="venue-reservations-toolbar__actions">
          <div className="venue-reservations-toolbar-menu">
            <button
              className="venue-reservations-toolbar-button"
              type="button"
              aria-expanded={openToolbarMenu === "date"}
              onClick={() => setOpenToolbarMenu((menu) => menu === "date" ? null : "date")}
            >
              <CalendarDays aria-hidden="true" />
              <span>{activeDateRangeLabel}</span>
              <ChevronDown aria-hidden="true" />
            </button>
            {openToolbarMenu === "date" && (
              <div className="venue-reservations-toolbar-menu__content" role="menu" aria-label="Reservation date range">
                {reservationDateRanges.map((range) => (
                  <button
                    key={range.id}
                    className={dateRange === range.id ? "is-active" : undefined}
                    type="button"
                    role="menuitemradio"
                    aria-checked={dateRange === range.id}
                    onClick={() => {
                      setDateRange(range.id);
                      setOpenToolbarMenu(null);
                    }}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="venue-reservations-toolbar-menu">
            <button
              className={`venue-reservations-toolbar-icon${statusFilter !== "all" ? " is-active" : ""}`}
              type="button"
              aria-label="Filter reservations"
              title="Filter reservations"
              aria-pressed={statusFilter !== "all"}
              aria-expanded={openToolbarMenu === "filter"}
              onClick={() => setOpenToolbarMenu((menu) => menu === "filter" ? null : "filter")}
            >
              <ListFilter aria-hidden="true" />
            </button>
            {openToolbarMenu === "filter" && (
              <div className="venue-reservations-toolbar-menu__content" role="menu" aria-label="Reservation status filter">
                {reservationStatusFilters.map((filter) => (
                  <button
                    key={filter.id}
                    className={statusFilter === filter.id ? "is-active" : undefined}
                    type="button"
                    role="menuitemradio"
                    aria-checked={statusFilter === filter.id}
                    onClick={() => {
                      setStatusFilter(filter.id);
                      setOpenToolbarMenu(null);
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="venue-reservations-panel" aria-live="polite">
        <div className="venue-reservations-panel__summary">
          <span>{filteredList.length} {filteredList.length === 1 ? "reservation" : "reservations"}</span>
          <span>{activeView.label}</span>
        </div>

        {venueLoading || loading ? (
          <div className="venue-reservations-empty">
            <div className="venue-reservations-empty__icon">
              <CalendarCheck2 aria-hidden="true" />
            </div>
            <h2>Loading reservations...</h2>
            <p>Fetching the latest table bookings for your venue.</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="venue-reservations-empty">
            <div className="venue-reservations-empty__icon">
              <CalendarCheck2 aria-hidden="true" />
            </div>
            <h2>{activeView.title}</h2>
            <p>{activeView.copy}</p>
            <button className="venue-reservations-button venue-reservations-button--secondary venue-reservations-empty__action" type="button" onClick={openNewReservation}>
              <Plus aria-hidden="true" />
              <span>Add reservation</span>
            </button>
          </div>
        ) : (
          <div className="venue-reservations-list">
            {filteredList.map((reservation) => (
              <article
                key={reservation.id}
                className={`venue-reservations-item${reservation.hasPreOrder ? " venue-reservations-item--preorder" : ""}`}
              >
                <div className="venue-reservations-item__time">
                  <span>{getDateLabel(reservation.reservationDate)}</span>
                  <strong>{reservation.startTime.slice(0, 5)}</strong>
                  <small>
                    <Clock aria-hidden="true" />
                    {reservation.endTime.slice(0, 5)}
                  </small>
                </div>

                <div className="venue-reservations-item__content">
                  <div className="venue-reservations-item__title-row">
                    <h2>{reservation.customerName}</h2>
                    {getStatusBadge(
                      reservation.status,
                      reservation.depositRequired,
                      reservation.depositPaid,
                      reservation.depositDeadline,
                    )}
                    {reservation.hasPreOrder && (
                      <span className="venue-reservations-preorder">
                        <ChefHat aria-hidden="true" />
                        Pre-order
                      </span>
                    )}
                  </div>

                  <div className="venue-reservations-item__meta">
                    <span>
                      <Users aria-hidden="true" />
                      {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
                    </span>
                    <span>
                      <Table2 aria-hidden="true" />
                      {reservation.tableName ? `Table ${reservation.tableName}` : "Table to be assigned"}
                    </span>
                    {reservation.customerPhone && <span>{reservation.customerPhone}</span>}
                  </div>

                  {reservation.specialRequests && (
                    <p className="venue-reservations-item__request">&quot;{reservation.specialRequests}&quot;</p>
                  )}

                  {reservation.depositRequired && !reservation.depositPaid && (
                    <p className="venue-reservations-item__deposit">
                      <DollarSign aria-hidden="true" />
                      <span>
                        Deposit: ${reservation.depositAmount.toFixed(2)}
                        {reservation.depositDeadline && (
                          <small>Due by {format(parseISO(reservation.depositDeadline), "MMM d, h:mm a")}</small>
                        )}
                      </span>
                    </p>
                  )}

                  {reservation.hasPreOrder && reservation.orderTotal && (
                    <p className="venue-reservations-item__preorder-total">Pre-order total: ${reservation.orderTotal.toFixed(2)}</p>
                  )}
                </div>

                <div className="venue-reservations-item__actions">
                  <button className="venue-reservations-button venue-reservations-button--secondary" type="button" onClick={() => openDetails(reservation)}>
                    <Eye aria-hidden="true" />
                    <span>View</span>
                  </button>

                  {reservation.status === "awaiting_deposit" && (
                    <button className="venue-reservations-button venue-reservations-button--primary" type="button" onClick={() => void handleDepositConfirm(reservation)}>
                      <DollarSign aria-hidden="true" />
                      <span>Confirm deposit</span>
                    </button>
                  )}

                  {reservation.status === "pending" && (
                    <button className="venue-reservations-button venue-reservations-button--primary" type="button" onClick={() => void handleConfirm(reservation)}>
                      <CheckCircle2 aria-hidden="true" />
                      <span>Confirm</span>
                    </button>
                  )}

                  {["confirmed", "pending", "awaiting_deposit"].includes(reservation.status) && (
                    <button className="venue-reservations-button venue-reservations-button--danger" type="button" onClick={() => openCancel(reservation)}>
                      <XCircle aria-hidden="true" />
                      <span>Cancel</span>
                    </button>
                  )}

                  {reservation.status === "confirmed" && isToday(parseISO(reservation.reservationDate)) && (
                    <>
                      <button className="venue-reservations-button venue-reservations-button--secondary" type="button" onClick={() => void handleMarkComplete(reservation)}>
                        Complete
                      </button>
                      <button className="venue-reservations-button venue-reservations-button--danger" type="button" onClick={() => void handleMarkNoShow(reservation)}>
                        No show
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog open={showNewReservationModal} onOpenChange={setShowNewReservationModal}>
        <DialogContent className="venue-dialog-surface venue-reservations-modal venue-reservations-modal--new">
          <DialogHeader className="venue-reservations-modal__header">
            <DialogTitle>New reservation</DialogTitle>
            <DialogDescription>Record a table booking for your guest.</DialogDescription>
          </DialogHeader>

          <form className="venue-reservations-form" onSubmit={handleCreateManualReservation}>
            <div className="venue-reservations-form__grid">
              <label className="venue-reservations-form__field" htmlFor="manual-reservation-guest">
                <span>Guest name</span>
                <input
                  id="manual-reservation-guest"
                  autoComplete="name"
                  placeholder="Guest name"
                  value={manualReservation.customerName}
                  onChange={(event) => handleManualReservationChange("customerName", event.target.value)}
                  required
                />
              </label>

              <label className="venue-reservations-form__field" htmlFor="manual-reservation-party">
                <span>Party size</span>
                <input
                  id="manual-reservation-party"
                  type="number"
                  min={1}
                  max={30}
                  value={manualReservation.partySize}
                  onChange={(event) => handleManualReservationChange("partySize", event.target.value)}
                  required
                />
              </label>

              <label className="venue-reservations-form__field" htmlFor="manual-reservation-date">
                <span>Date</span>
                <input
                  id="manual-reservation-date"
                  type="date"
                  value={manualReservation.reservationDate}
                  onChange={(event) => handleManualReservationChange("reservationDate", event.target.value)}
                  required
                />
              </label>

              <label className="venue-reservations-form__field" htmlFor="manual-reservation-time">
                <span>Time</span>
                <input
                  id="manual-reservation-time"
                  type="time"
                  value={manualReservation.startTime}
                  onChange={(event) => handleManualReservationChange("startTime", event.target.value)}
                  required
                />
              </label>
            </div>

            <label className="venue-reservations-form__field" htmlFor="manual-reservation-table">
              <span>Table <em>(optional)</em></span>
              <select
                id="manual-reservation-table"
                value={manualReservation.tableId}
                onChange={(event) => handleManualReservationChange("tableId", event.target.value)}
              >
                <option value="">Assign later</option>
                {tableOptions.map((table) => <option key={table.id} value={table.id}>{table.label}</option>)}
              </select>
            </label>

            <label className="venue-reservations-form__field" htmlFor="manual-reservation-notes">
              <span>Guest note <em>(optional)</em></span>
              <textarea
                id="manual-reservation-notes"
                placeholder="Accessibility, celebration, or service note"
                value={manualReservation.specialRequests}
                onChange={(event) => handleManualReservationChange("specialRequests", event.target.value)}
              />
            </label>

            <div className="venue-reservations-modal__actions">
              <button className="venue-reservations-button venue-reservations-button--secondary" type="button" onClick={() => setShowNewReservationModal(false)} disabled={creatingReservation}>
                Cancel
              </button>
              <button className="venue-reservations-button venue-reservations-button--primary" type="submit" disabled={creatingReservation}>
                <CalendarPlus aria-hidden="true" />
                <span>{creatingReservation ? "Creating..." : "Create reservation"}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="venue-dialog-surface venue-reservations-modal">
          <DialogHeader className="venue-reservations-modal__header">
            <DialogTitle>Reservation details</DialogTitle>
            <DialogDescription>Guest and booking information for this table reservation.</DialogDescription>
          </DialogHeader>

          {selectedReservation && (
            <div className="venue-reservations-detail-grid">
              <div>
                <span>Customer</span>
                <strong>{selectedReservation.customerName}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{selectedReservation.customerPhone || "N/A"}</strong>
              </div>
              <div>
                <span>Date</span>
                <strong>{format(parseISO(selectedReservation.reservationDate), "EEEE, MMMM d, yyyy")}</strong>
              </div>
              <div>
                <span>Time</span>
                <strong>{selectedReservation.startTime.slice(0, 5)} - {selectedReservation.endTime.slice(0, 5)}</strong>
              </div>
              <div>
                <span>Party size</span>
                <strong>{selectedReservation.partySize} {selectedReservation.partySize === 1 ? "guest" : "guests"}</strong>
              </div>
              <div>
                <span>Table</span>
                <strong>{selectedReservation.tableName ? `Table ${selectedReservation.tableName}` : "Not assigned"}</strong>
              </div>
            </div>
          )}

          {selectedReservation?.specialRequests && (
            <div className="venue-reservations-detail-section">
              <span>Special requests</span>
              <p>{selectedReservation.specialRequests}</p>
            </div>
          )}

          {selectedReservation?.hasPreOrder && (
            <div className="venue-reservations-detail-section venue-reservations-detail-section--preorder">
              <span>
                <ChefHat aria-hidden="true" />
                Pre-order
              </span>
              <p>Total: ${selectedReservation.orderTotal?.toFixed(2) || "0.00"}</p>
            </div>
          )}

          {selectedReservation && (
            <div className="venue-reservations-detail-status">
              <span>Status</span>
              {getStatusBadge(
                selectedReservation.status,
                selectedReservation.depositRequired,
                selectedReservation.depositPaid,
                selectedReservation.depositDeadline,
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="venue-dialog-surface venue-reservations-modal venue-reservations-modal--cancel">
          <DialogHeader className="venue-reservations-modal__header">
            <DialogTitle>Cancel reservation</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this reservation for {selectedReservation?.customerName}?
              {selectedReservation?.depositPaid && (
                <span className="venue-reservations-cancel-note">
                  Deposit of ${selectedReservation.depositAmount.toFixed(2)} will be forfeited.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <label className="venue-reservations-cancel-reason" htmlFor="reservation-cancel-reason">
            <span>Reason for cancellation <em>(optional)</em></span>
            <textarea
              id="reservation-cancel-reason"
              placeholder="Reason for cancellation"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </label>

          <div className="venue-reservations-modal__actions">
            <button className="venue-reservations-button venue-reservations-button--secondary" type="button" onClick={() => setShowCancelModal(false)}>
              Keep reservation
            </button>
            <button className="venue-reservations-button venue-reservations-button--danger-solid" type="button" onClick={() => void handleCancel()}>
              Cancel reservation
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

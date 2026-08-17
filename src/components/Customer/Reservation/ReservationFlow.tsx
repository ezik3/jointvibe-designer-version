import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { parse } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTableAvailability } from "@/hooks/useTableAvailability";
import { useReservations } from "@/hooks/useReservations";
import { ReservationCalendar } from "./ReservationCalendar";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { TableSelector } from "./TableSelector";
import { PartySizeSelector } from "./PartySizeSelector";
import { ReservationConfirmation } from "./ReservationConfirmation";
import { useTranslation } from 'react-i18next';

interface ReservationFlowProps {
  venueId: string;
  venueName: string;
  onClose: () => void;
  onComplete?: () => void;
  onProceedToMenu?: (reservationId: string) => void;
}

type Step = "party-size" | "date" | "time" | "table" | "details" | "confirm";

export function ReservationFlow({
  onClose,
  venueId,
  venueName,
  onComplete,
  onProceedToMenu,
}: ReservationFlowProps) {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const {
    venueSettings,
    tables,
    reservations: existingReservations,
    fetchVenueSettings,
    fetchTables,
    fetchReservationsForDate,
    generateTimeSlots,
    getAvailableTables,
    calculateDepositRequirements,
  } = useTableAvailability(venueId);
  const { createReservation } = useReservations(venueId);

  const [step, setStep] = useState<Step>("party-size");
  const [partySize, setPartySize] = useState(2);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [createdReservationId, setCreatedReservationId] = useState<string | null>(null);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);

  // Time slots for selected date
  const [timeSlots, setTimeSlots] = useState<Array<{ time: string; available: boolean }>>([]);
  const [availableTables, setAvailableTables] = useState<typeof tables>([]);

  // Deposit info
  const [depositInfo, setDepositInfo] = useState<{
    depositRequired: boolean;
    depositAmount: number;
    depositDeadline: Date | null;
  }>({ depositRequired: false, depositAmount: 0, depositDeadline: null });

  // Load venue settings on mount
  useEffect(() => {
    if (venueId) {
      fetchVenueSettings();
      fetchTables();
    }
  }, [venueId, fetchVenueSettings, fetchTables]);

  // Auto-fill verified identity details
  useEffect(() => {
    const verifiedName = localStorage.getItem("jv_verified_name");
    const profilePic = localStorage.getItem("jv_profile_picture");

    setCustomerName(
      (verifiedName || user?.user_metadata?.full_name || "").toString().trim() ||
        user?.email?.split("@")[0] ||
        ""
    );

    setProfilePicture(profilePic || null);

    // Prefer not to share phone with venues by default.
    // (We keep it available for future no-show escalation rules.)
    setCustomerPhone("");
  }, [user]);

  // Update time slots when date changes
  useEffect(() => {
    if (selectedDate && venueSettings) {
      const slots = generateTimeSlots(selectedDate, venueSettings);
      setTimeSlots(slots);
      fetchReservationsForDate(selectedDate);
    }
  }, [selectedDate, venueSettings, generateTimeSlots, fetchReservationsForDate]);

  // Update available tables when time changes
  useEffect(() => {
    if (selectedTime && venueSettings && tables.length > 0) {
      const available = getAvailableTables(
        selectedTime,
        partySize,
        existingReservations,
        tables,
        venueSettings.defaultReservationDurationMinutes
      );
      setAvailableTables(available);
    }
  }, [selectedTime, partySize, venueSettings, tables, existingReservations, getAvailableTables]);

  // Calculate deposit when date/time selected
  useEffect(() => {
    if (selectedDate && selectedTime && venueSettings) {
      const reservationDateTime = parse(selectedTime, "HH:mm", selectedDate);
      // Estimate only (pre-order may change totals later)
      const estimatedTotal = 50;
      const deposit = calculateDepositRequirements(reservationDateTime, venueSettings, estimatedTotal);
      setDepositInfo(deposit);
    }
  }, [selectedDate, selectedTime, venueSettings, calculateDepositRequirements]);

  const resetFlow = useCallback(() => {
    setStep("party-size");
    setPartySize(2);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setSelectedTableId(null);
    setSpecialRequests("");
    setCreatedReservationId(null);
  }, []);

  const handleClose = () => {
    resetFlow();
    onClose();
  };

  const goBack = () => {
    const stepOrder: Step[] = ["party-size", "date", "time", "table", "details", "confirm"];
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex > 0) {
      setStep(stepOrder[currentIndex - 1]);
    }
  };

  const goNext = () => {
    const stepOrder: Step[] = ["party-size", "date", "time", "table", "details", "confirm"];
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex < stepOrder.length - 1) {
      setStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleConfirm = useCallback(
    async (opts?: { closeOnSuccess?: boolean }): Promise<string | null> => {
      if (!user || !selectedDate || !selectedTime || !selectedTableId || !venueSettings) {
        toast.error("Missing reservation details");
        return null;
      }

      const selectedTable = availableTables.find((t) => t.id === selectedTableId);
      const tableNote = selectedTable?.tableNumber ? `Requested table: ${selectedTable.tableNumber}` : null;
      const combinedSpecialRequests = [specialRequests.trim(), tableNote].filter(Boolean).join(" • ");

      setIsConfirming(true);

      try {
        const reservation = await createReservation({
          venueId,
          tableId: selectedTableId,
          customerId: user.id,
          reservationDate: selectedDate,
          startTime: selectedTime,
          partySize,
          customerName: customerName.trim() || user.email?.split("@")[0] || "Guest",
          customerPhone: customerPhone.trim() || undefined,
          specialRequests: combinedSpecialRequests || undefined,
          durationMinutes: venueSettings.defaultReservationDurationMinutes,
          depositRequired: depositInfo.depositRequired,
          depositAmount: depositInfo.depositAmount,
          depositDeadline: depositInfo.depositDeadline,
        });

        if (reservation) {
          setCreatedReservationId(reservation.id);
          
          // Only show toast if closing (not proceeding to pre-order)
          const closeOnSuccess = opts?.closeOnSuccess ?? true;
          if (closeOnSuccess) {
            toast.success("Reservation confirmed!");
            if (onComplete) onComplete();
            else handleClose();
          }

          return reservation.id;
        }

        return null;
      } catch (error) {
        console.error("Error creating reservation:", error);
        toast.error("Failed to create reservation");
        return null;
      } finally {
        setIsConfirming(false);
      }
    },
    [
      user,
      selectedDate,
      selectedTime,
      selectedTableId,
      venueSettings,
      availableTables,
      createReservation,
      venueId,
      partySize,
      customerName,
      customerPhone,
      specialRequests,
      depositInfo.depositRequired,
      depositInfo.depositAmount,
      depositInfo.depositDeadline,
      onComplete,
      handleClose,
    ]
  );

  const handleAddPreOrder = useCallback(async () => {
    if (!onProceedToMenu) return;

    const reservationId = createdReservationId || (await handleConfirm({ closeOnSuccess: false }));
    if (!reservationId) return;

    onProceedToMenu(reservationId);
  }, [createdReservationId, handleConfirm, onProceedToMenu]);

  const selectedTable = availableTables.find((t) => t.id === selectedTableId);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="customer-modal-overlay absolute inset-0" onClick={handleClose} />

        <motion.div
          className="customer-modal-panel relative w-full max-w-md h-[85vh] sm:rounded-[8px] overflow-hidden flex flex-col"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="p-5 pb-4 border-b border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step !== "party-size" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="customer-modal-secondary w-10 h-10 p-0"
                  onClick={goBack}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              )}
              <div>
                <h2 className="text-xl font-bold text-[var(--customer-modal-text)] flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-primary" />
                  {t('reservation.dine_in_title')}
                </h2>
                <p className="text-sm text-[var(--customer-modal-muted)]">{venueName}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="customer-modal-secondary w-10 h-10 p-0"
              onClick={handleClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Indicator */}
          <div className="px-5 pb-4">
            <div className="flex gap-1">
              {["party-size", "date", "time", "table", "details", "confirm"].map((s, i) => {
                const stepOrder: Step[] = ["party-size", "date", "time", "table", "details", "confirm"];
                const currentIndex = stepOrder.indexOf(step);
                return (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i <= currentIndex ? "bg-[var(--customer-modal-cyan)]" : "bg-[var(--customer-modal-line)]"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ scrollbarWidth: "none" }}>
            <AnimatePresence mode="wait">
              {step === "party-size" && (
                <motion.div key="party-size" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <PartySizeSelector partySize={partySize} onPartySizeChange={setPartySize} maxSize={20} />
                  <Button
                    className="customer-modal-primary w-full mt-6 h-14 text-lg font-bold"
                    onClick={goNext}
                  >
                    {t('reservation.continue')}
                  </Button>
                </motion.div>
              )}

              {step === "date" && venueSettings && (
                <motion.div key="date" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ReservationCalendar
                    selectedDate={selectedDate}
                    onDateSelect={(date) => {
                      setSelectedDate(date);
                      if (date) goNext();
                    }}
                    maxAdvanceDays={venueSettings.maxAdvanceBookingDays}
                    minLeadMinutes={venueSettings.minBookingLeadMinutes}
                  />
                </motion.div>
              )}

              {step === "time" && (
                <motion.div key="time" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <TimeSlotPicker
                    slots={timeSlots}
                    selectedTime={selectedTime}
                    onTimeSelect={(time) => {
                      setSelectedTime(time);
                      goNext();
                    }}
                  />
                </motion.div>
              )}

              {step === "table" && (
                <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <TableSelector
                    tables={availableTables}
                    selectedTableId={selectedTableId}
                    onTableSelect={(tableId) => {
                      setSelectedTableId(tableId);
                      goNext();
                    }}
                    partySize={partySize}
                  />
                </motion.div>
              )}

              {step === "details" && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <h3 className="text-lg font-semibold text-[var(--customer-modal-text)]">{t('reservation.your_details')}</h3>

                  <div className="bg-[var(--customer-modal-raised)] border border-[var(--customer-modal-line)] rounded-[6px] p-4">
                    <div className="text-sm text-[var(--customer-modal-muted)] mb-3">{t('reservation.booking_made_by')}</div>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profilePicture || undefined} alt="Verified profile picture" />
                        <AvatarFallback>
                          {(customerName || "U").slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--customer-modal-text)] truncate">{customerName || t('reservation.your_verified_name')}</div>
                        <div className="text-xs text-[var(--customer-modal-muted)]">{t('reservation.phone_private_note')}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-[var(--customer-modal-muted)] mb-2 block">{t('reservation.special_requests_optional')}</label>
                    <Textarea
                      placeholder={t('reservation.special_requests_placeholder')}
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      className="customer-modal-field min-h-[80px]"
                    />
                  </div>

                  <Button
                    className="customer-modal-primary w-full h-14 text-lg font-bold"
                    onClick={goNext}
                    disabled={!customerName.trim()}
                  >
                    {t('reservation.review_reservation')}
                  </Button>
                </motion.div>
              )}

              {step === "confirm" && selectedDate && selectedTime && selectedTable && (
                <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ReservationConfirmation
                    date={selectedDate}
                    time={selectedTime}
                    partySize={partySize}
                    tableName={selectedTable.tableNumber}
                    customerName={customerName}
                    specialRequests={specialRequests || undefined}
                    depositRequired={depositInfo.depositRequired}
                    depositAmount={depositInfo.depositAmount}
                    depositDeadline={depositInfo.depositDeadline}
                    hasPreOrder={false}
                    orderTotal={0}
                    onConfirm={(paymentOption) => {
                      // TODO: Handle payment option (reserve_only, deposit, full) when payment processing is implemented
                      console.log("Payment option selected:", paymentOption);
                      void handleConfirm();
                    }}
                    onAddPreOrder={handleAddPreOrder}
                    isConfirming={isConfirming}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

import { motion } from "framer-motion";
import { format, parse } from "date-fns";
import { Calendar, Clock, Users, Table2, AlertCircle, CreditCard, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useTranslation } from 'react-i18next';

interface ReservationConfirmationProps {
  date: Date;
  time: string;
  partySize: number;
  tableName: string;
  customerName: string;
  specialRequests?: string;
  depositRequired: boolean;
  depositAmount: number;
  depositDeadline: Date | null;
  hasPreOrder: boolean;
  orderTotal: number;
  onConfirm: (paymentOption: "reserve_only" | "deposit" | "full") => void;
  onAddPreOrder: () => void;
  isConfirming: boolean;
}

export function ReservationConfirmation({
  date,
  time,
  partySize,
  tableName,
  customerName,
  specialRequests,
  depositRequired,
  depositAmount,
  depositDeadline,
  hasPreOrder,
  orderTotal,
  onConfirm,
  onAddPreOrder,
  isConfirming,
}: ReservationConfirmationProps) {
  const { t } = useTranslation('common');
  // If deposit is required NOW, default to deposit; otherwise reserve_only
  const [paymentOption, setPaymentOption] = useState<"reserve_only" | "deposit" | "full">(
    depositRequired ? "deposit" : "reserve_only"
  );
  
  // Full amount = pre-order total (if any), deposit is always separate
  const fullPaymentAmount = hasPreOrder ? orderTotal : 0;

  // Determine which options to show:
  // - If depositRequired (within 24hrs), they MUST pay deposit - no reserve_only option
  // - Otherwise they can choose reserve_only (pay later) or pay deposit now
  const showReserveOnly = !depositRequired && depositDeadline;
  const showPayFull = hasPreOrder && orderTotal > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4"
    >
      <h3 className="text-xl font-bold text-[var(--customer-modal-text)] text-center mb-2">
        {t('reservation.confirm_title')}
      </h3>

      {/* Reservation Details Card */}
      <div className="bg-[var(--customer-modal-raised)] rounded-[6px] p-4 space-y-3 border border-[var(--customer-modal-line)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-sm text-white/50">{t('reservation.date')}</div>
            <div className="font-semibold text-white">{format(date, "EEEE, MMMM d, yyyy")}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-sm text-white/50">{t('reservation.time')}</div>
            <div className="font-semibold text-white">{time}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-sm text-white/50">{t('reservation.party_size')}</div>
            <div className="font-semibold text-white">{partySize} {partySize === 1 ? t('reservation.guest_one') : t('reservation.guest_other')}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Table2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-sm text-white/50">{t('reservation.table')}</div>
            <div className="font-semibold text-white">{t('reservation.table_label', { number: tableName })}</div>
          </div>
        </div>

        {specialRequests && (
          <div className="pt-2 border-t border-white/10">
            <div className="text-sm text-white/50 mb-1">{t('reservation.special_requests')}</div>
            <div className="text-white">{specialRequests}</div>
          </div>
        )}
      </div>

      {/* Pre-Order Section */}
      <div className="bg-[var(--customer-modal-raised)] rounded-[6px] p-4 border border-[var(--customer-modal-line)]">
        {hasPreOrder ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-400" />
            <div>
              <div className="font-semibold text-white">{t('reservation.pre_order_added')}</div>
              <div className="text-sm text-white/70">{t('reservation.order_total', { amount: orderTotal.toFixed(2) })}</div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🍽️</span>
              <span className="font-semibold text-white">{t('reservation.want_food_ready')}</span>
            </div>
            <p className="text-sm text-white/70 mb-3">
              {t('reservation.preorder_skip_wait')}
            </p>
            <Button
              variant="outline"
              className="customer-modal-secondary w-full"
              onClick={onAddPreOrder}
            >
              {t('reservation.add_pre_order')}
            </Button>
          </div>
        )}
      </div>

      {/* Payment Options */}
      <div className="bg-[var(--customer-modal-canvas)] rounded-[6px] p-4 border border-[var(--customer-modal-line)]">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-5 h-5 text-[var(--customer-modal-cyan)]" />
          <span className="font-semibold text-[var(--customer-modal-text)]">{t('reservation.payment_option')}</span>
        </div>
        
        <RadioGroup 
          value={paymentOption} 
          onValueChange={(value) => setPaymentOption(value as "reserve_only" | "deposit" | "full")}
          className="space-y-3"
        >
          {/* Option 1: Reserve Only (if deposit not immediately required) */}
          {showReserveOnly && (
            <div className={`flex items-center space-x-3 rounded-[6px] p-3 border transition-all cursor-pointer ${
              paymentOption === "reserve_only" 
                ? "bg-[var(--customer-modal-cyan-soft)] border-[var(--customer-modal-cyan)]" 
                : "bg-[var(--customer-modal-raised)] border-[var(--customer-modal-line)] hover:border-[var(--customer-modal-faint)]"
            }`}>
              <RadioGroupItem value="reserve_only" id="reserve_only" className="border-[var(--customer-modal-cyan)] text-[var(--customer-modal-cyan)]" />
              <Label htmlFor="reserve_only" className="flex-1 cursor-pointer">
                <div className="font-medium text-white">{t('reservation.reserve_only')}</div>
                <div className="text-sm text-white/60">
                  {t('reservation.no_payment_now')}
                  {depositDeadline && (
                    <span className="text-orange-400 font-medium"> {t('reservation.deposit_due_by', { when: format(depositDeadline, "MMM d, h:mm a") })}</span>
                  )}
                </div>
              </Label>
            </div>
          )}
          
          {/* Option 2: Pay Deposit Now */}
          <div className={`flex items-center space-x-3 rounded-[6px] p-3 border transition-all cursor-pointer ${
            paymentOption === "deposit" 
              ? "bg-[var(--customer-modal-cyan-soft)] border-[var(--customer-modal-cyan)]" 
              : "bg-[var(--customer-modal-raised)] border-[var(--customer-modal-line)] hover:border-[var(--customer-modal-faint)]"
          }`}>
            <RadioGroupItem value="deposit" id="deposit" className="border-[var(--customer-modal-cyan)] text-[var(--customer-modal-cyan)]" />
            <Label htmlFor="deposit" className="flex-1 cursor-pointer">
              <div className="font-medium text-white">{t('reservation.pay_deposit_now')}</div>
              <div className="text-sm text-white/60">
                {t('reservation.amount_now', { amount: depositAmount.toFixed(2) })}
              </div>
            </Label>
          </div>
          
          {/* Option 3: Pay Full Amount (only if pre-order exists) */}
          {showPayFull && (
            <div className={`flex items-center space-x-3 rounded-[6px] p-3 border transition-all cursor-pointer ${
              paymentOption === "full" 
                ? "bg-[var(--customer-modal-cyan-soft)] border-[var(--customer-modal-cyan)]" 
                : "bg-[var(--customer-modal-raised)] border-[var(--customer-modal-line)] hover:border-[var(--customer-modal-faint)]"
            }`}>
              <RadioGroupItem value="full" id="full" className="border-[var(--customer-modal-cyan)] text-[var(--customer-modal-cyan)]" />
              <Label htmlFor="full" className="flex-1 cursor-pointer">
                <div className="font-medium text-white">{t('reservation.pay_full_now')}</div>
                <div className="text-sm text-white/60">
                  {t('reservation.total_amount', { amount: (fullPaymentAmount + depositAmount).toFixed(2) })}
                  <span className="text-green-400"> {t('reservation.deposit_plus_preorder')}</span>
                </div>
              </Label>
            </div>
          )}
        </RadioGroup>
      </div>

      {/* Info Box based on selection */}
      {paymentOption === "reserve_only" && depositDeadline ? (
        <div className="bg-[var(--customer-modal-raised)] rounded-[6px] p-4 border border-orange-500/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-white mb-1">{t('reservation.deposit_required_later')}</div>
              <p
                className="text-sm text-white/70"
                dangerouslySetInnerHTML={{
                  __html: t('reservation.deposit_required_msg', {
                    amount: depositAmount.toFixed(2),
                    when: format(depositDeadline, "MMM d, h:mm a"),
                  }),
                }}
              />
            </div>
          </div>
        </div>
      ) : paymentOption === "deposit" ? (
        <div className="bg-[var(--customer-modal-raised)] rounded-[6px] p-4 border border-[var(--customer-modal-line)]">
          <div className="flex items-start gap-3">
            <CreditCard className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-white mb-1">{t('reservation.paying_deposit')}</div>
              <p className="text-sm text-white/70">
                <span dangerouslySetInnerHTML={{ __html: t('reservation.paying_deposit_msg', { amount: depositAmount.toFixed(2) }) }} />
                {hasPreOrder && t('reservation.preorder_at_venue')}
              </p>
            </div>
          </div>
        </div>
      ) : paymentOption === "full" ? (
        <div className="bg-[var(--customer-modal-raised)] rounded-[6px] p-4 border border-green-500/30">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-white mb-1">{t('reservation.paying_full')}</div>
              <p
                className="text-sm text-white/70"
                dangerouslySetInnerHTML={{
                  __html: t('reservation.paying_full_msg', { amount: (fullPaymentAmount + depositAmount).toFixed(2) }),
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirm Button */}
      <Button
        className="customer-modal-primary w-full h-14 text-lg font-bold"
        onClick={() => onConfirm(paymentOption)}
        disabled={isConfirming}
      >
        {isConfirming ? (
          <span className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
            />
            {t('reservation.confirming')}
          </span>
        ) : paymentOption === "full" ? (
          t('reservation.pay_and_confirm', { amount: (fullPaymentAmount + depositAmount).toFixed(2) })
        ) : paymentOption === "deposit" ? (
          t('reservation.pay_deposit_and_confirm', { amount: depositAmount.toFixed(2) })
        ) : (
          t('reservation.confirm_reservation')
        )}
      </Button>

      <p className="text-xs text-white/40 text-center">
        {t('reservation.cancellation_note')}
      </p>
    </motion.div>
  );
}

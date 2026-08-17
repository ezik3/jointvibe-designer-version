import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import "./venue-add-funds-modal.css";

interface VenueAddFundsModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  currencySymbol: string;
}

const MINIMUM_DEPOSIT = 25;
const DEFAULT_DEPOSIT = "100.00";

export default function VenueAddFundsModal({
  open,
  onClose,
  onConfirm,
  currencySymbol,
}: VenueAddFundsModalProps) {
  const [amount, setAmount] = useState(DEFAULT_DEPOSIT);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(DEFAULT_DEPOSIT);
      setError("");
    }
  }, [open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < MINIMUM_DEPOSIT) {
      setError(`Enter a budget of at least ${currencySymbol}${MINIMUM_DEPOSIT.toFixed(2)}.`);
      return;
    }

    onConfirm(Math.round(parsedAmount * 100) / 100);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="venue-add-funds-dialog">
        <DialogHeader className="venue-add-funds-dialog__heading">
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>Set a promotion budget, then select the push-credit package to purchase.</DialogDescription>
        </DialogHeader>

        <form className="venue-add-funds-dialog__form" onSubmit={handleSubmit}>
          <div className="venue-add-funds-dialog__field">
            <label htmlFor="venue-fund-amount">Budget</label>
            <div className={`venue-add-funds-dialog__input${error ? " venue-add-funds-dialog__input--error" : ""}`}>
              <span aria-hidden="true">{currencySymbol}</span>
              <Input
                id="venue-fund-amount"
                type="number"
                min={MINIMUM_DEPOSIT}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  if (error) setError("");
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "venue-fund-amount-error" : undefined}
              />
            </div>
            {error && <p id="venue-fund-amount-error" className="venue-add-funds-dialog__error">{error}</p>}
            <small>Minimum promotion budget: {currencySymbol}{MINIMUM_DEPOSIT.toFixed(2)}</small>
          </div>

          <DialogFooter className="venue-add-funds-dialog__actions">
            <button className="venue-wallet-button venue-wallet-button--secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="venue-wallet-button venue-wallet-button--primary" type="submit">
              <Plus aria-hidden="true" />
              <span>Continue to credits</span>
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

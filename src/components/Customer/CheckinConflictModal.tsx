import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./checkin-conflict-modal.css";

interface CheckinConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVenueName: string;
  newVenueName: string;
  onCheckoutAndContinue: () => void;
  isLoading?: boolean;
}

const CheckinConflictModal = ({
  isOpen,
  onClose,
  currentVenueName,
  newVenueName,
  onCheckoutAndContinue,
  isLoading = false,
}: CheckinConflictModalProps) => {
  const { t } = useTranslation("common");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="customer-dialog-surface checkin-conflict-dialog !max-w-[460px] !gap-0 !p-0">
        <div className="checkin-conflict-modal__body">
          <div className="checkin-conflict-modal__icon" aria-hidden="true">
            <MapPin />
          </div>

          <DialogTitle className="checkin-conflict-modal__title">
            {t("checkin_conflict.title")}
          </DialogTitle>

          <DialogDescription className="checkin-conflict-modal__description">
            {t("checkin_conflict.description")} <strong>{currentVenueName}</strong>
          </DialogDescription>

          <div className="checkin-conflict-modal__route" aria-label={`${currentVenueName} to ${newVenueName}`}>
            <div className="checkin-conflict-modal__venue">
              <span className="checkin-conflict-modal__venue-icon" aria-hidden="true"><MapPin /></span>
              <span>{currentVenueName}</span>
            </div>

            <ArrowRight className="checkin-conflict-modal__route-arrow" aria-hidden="true" />

            <div className="checkin-conflict-modal__venue checkin-conflict-modal__venue--destination">
              <span className="checkin-conflict-modal__venue-icon" aria-hidden="true"><MapPin /></span>
              <span>{newVenueName}</span>
            </div>
          </div>

          <div className="checkin-conflict-modal__actions">
            <Button
              onClick={onCheckoutAndContinue}
              disabled={isLoading}
              className="checkin-conflict-modal__continue"
            >
              {isLoading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              <span>{isLoading ? t("checkin_conflict.switching") : t("checkin_conflict.checkout_and_continue", { venue: newVenueName })}</span>
            </Button>

            <Button
              onClick={onClose}
              variant="outline"
              className="checkin-conflict-modal__cancel"
            >
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CheckinConflictModal;

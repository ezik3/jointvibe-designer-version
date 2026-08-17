import { Gift, MoreHorizontal, Tag } from "lucide-react";
import "./reference-venue-deal-card.css";

interface ReferenceVenueDealCardProps {
  onRedeem: () => void;
  onOptions: () => void;
}

const ReferenceVenueDealCard = ({ onRedeem, onOptions }: ReferenceVenueDealCardProps) => (
  <article className="reference-venue-deal-card">
    <span className="reference-venue-deal-card__icon"><Tag aria-hidden="true" /></span>
    <div className="reference-venue-deal-card__copy">
      <strong>My Spot</strong>
      <b>Up to 40% off</b>
      <p>Flash Sale - Tonight only!</p>
    </div>
    <button
      className="reference-venue-deal-card__options"
      type="button"
      aria-label="More options for My Spot deal"
      onClick={onOptions}
    >
      <MoreHorizontal aria-hidden="true" />
    </button>
    <button className="reference-venue-deal-card__redeem" type="button" onClick={onRedeem}>
      <Gift aria-hidden="true" />
      <span>Redeem</span>
    </button>
  </article>
);

export default ReferenceVenueDealCard;

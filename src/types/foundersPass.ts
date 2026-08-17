export type PassType = 'user' | 'venue';
export type CityTier = 'A' | 'B' | 'C';
export type PurchaseStatus = 'created' | 'paid' | 'claimed' | 'pending_kyc' | 'active' | 'refunded';
export type EntitlementStatus = 'pending_claim' | 'pending_kyc' | 'active' | 'canceled' | 'expired';

export interface CityProduct {
  id: string;
  country: string;
  city: string;
  slug: string;
  tier: CityTier;
  pass_type: PassType;
  total_supply: number;
  sold_count: number;
  is_active: boolean;
  stripe_price_id: string | null;
  price_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface FoundersPurchase {
  id: string;
  city_product_id: string;
  pass_type: PassType;
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  purchaser_email: string;
  claim_code_hash: string;
  claim_code_prefix: string;
  claimed_by_user_id: string | null;
  claim_attempts: number;
  status: PurchaseStatus;
  purchased_at: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
  city_product?: CityProduct;
}

export interface FounderEntitlement {
  id: string;
  user_id: string;
  pass_type: PassType;
  city_product_id: string;
  status: EntitlementStatus;
  start_at: string | null;
  end_at: string | null;
  metadata: {
    benefits?: string[];
    platinum_access?: boolean;
  };
  created_at: string;
  updated_at: string;
  city_product?: CityProduct;
}

export interface FounderBenefit {
  icon: string;
  title: string;
  description: string;
}

export const USER_BENEFITS: FounderBenefit[] = [
  { icon: 'Crown', title: 'Platinum City Access', description: 'Unlock Platinum tier status in your licensed city. Access premium features, priority bookings, and exclusive perks—for life.' },
  { icon: 'Clock', title: 'Pre-Launch Access', description: 'Get a minimum 7-day head start to register venues before public launch.' },
  { icon: 'Building2', title: 'Venue Pre-Registration', description: 'Exclusive ability to scout and pre-register venues in your city.' },
  { icon: 'Gift', title: 'Activation Rewards', description: 'Earn activation credits when venues you pre-register complete signup.' },
  { icon: 'Star', title: 'Founder Badge', description: 'Stand out with an exclusive Founder badge on your profile.' },
  { icon: 'BadgeCheck', title: 'Priority Everything', description: 'Skip the queues with priority support and early feature access.' },
];

export const VENUE_BENEFITS: FounderBenefit[] = [
  { icon: 'Crown', title: 'Platinum Venue Status', description: 'Unlock permanent Platinum tier status with maximum feed reach and geographic visibility.' },
  { icon: 'Zap', title: 'Priority Listing', description: 'Your venue is boosted in discovery, search, and city feeds permanently.' },
  { icon: 'Building2', title: 'Pre-Registration Access', description: 'Onboard and secure your spot before public launch in your city.' },
  { icon: 'Gift', title: 'Activation Rewards', description: 'Earn 60% reward rate for 12 months for every venue you onboard.' },
  { icon: 'Star', title: 'Founder Crown Badge', description: 'A permanent Founder Crown badge displayed on your venue profile.' },
  { icon: 'BadgeCheck', title: 'Priority Support', description: 'Dedicated support channel and early feature access for founders.' },
];

export const USER_FAQS = [
  { question: 'Is this a one-time purchase or a subscription?', answer: 'The City Founders License is a one-time purchase. You pay once and receive lifetime access—no recurring fees.' },
  { question: 'How do I claim my license after purchase?', answer: "After purchase, you'll receive an email with a unique claim code. Enter it in the app to activate your license." },
  { question: 'What is the verification (KYC) process?', answer: 'We verify that you reside in the country of your licensed city. This typically takes just a few minutes.' },
  { question: 'Can I buy a license for any city?', answer: 'You can purchase a license for cities in your country of residence, verified during KYC.' },
  { question: 'How do activation rewards work?', answer: 'When you pre-register a venue and it goes live, you earn credits for up to 12 months.' },
  { question: 'Is the license transferable?', answer: 'No, each license is tied to a single verified account and cannot be transferred.' },
];

export const VENUE_FAQS = [
  { question: 'Is this a one-time purchase or a subscription?', answer: 'The Venue Founders License is a one-time purchase with lifetime benefits—no recurring fees.' },
  { question: 'How does the Founder Crown badge work?', answer: 'Once activated, a permanent Founder Crown appears next to your venue name across the platform.' },
  { question: 'Does this replace the tier system?', answer: 'No. Founder status is separate from the merit-based tier system. You keep the Crown regardless of your earned tier.' },
  { question: 'What are activation rewards?', answer: 'Earn a 60% reward rate for 12 months for every venue you help onboard to the platform.' },
  { question: 'Can I change the licensed city?', answer: 'Your license is locked to the city selected at purchase. Contact support if you relocate.' },
  { question: 'What if my verification fails?', answer: "If your location doesn't match, you'll receive a full refund." },
];

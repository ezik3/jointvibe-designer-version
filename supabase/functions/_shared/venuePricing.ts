interface VenuePrice {
  amount: number;
  currency: string;
  display: string;
}

const VENUE_PRICES: Record<string, VenuePrice> = {
  US: { amount: 30, currency: 'USD', display: '$30/mo' },
  AU: { amount: 45, currency: 'AUD', display: 'A$45/mo' },
  CA: { amount: 40, currency: 'CAD', display: 'C$40/mo' },
  GB: { amount: 24, currency: 'GBP', display: '£24/mo' },
  NZ: { amount: 50, currency: 'NZD', display: 'NZ$50/mo' },
  SG: { amount: 40, currency: 'SGD', display: 'S$40/mo' },
  AE: { amount: 110, currency: 'AED', display: 'AED 110/mo' },
  HK: { amount: 235, currency: 'HKD', display: 'HK$235/mo' },
  JP: { amount: 4500, currency: 'JPY', display: '¥4,500/mo' },
  CH: { amount: 27, currency: 'CHF', display: 'CHF 27/mo' },
  DE: { amount: 28, currency: 'EUR', display: '€28/mo' },
  FR: { amount: 28, currency: 'EUR', display: '€28/mo' },
  NL: { amount: 28, currency: 'EUR', display: '€28/mo' },
  AT: { amount: 28, currency: 'EUR', display: '€28/mo' },
  BE: { amount: 28, currency: 'EUR', display: '€28/mo' },
  FI: { amount: 28, currency: 'EUR', display: '€28/mo' },
  IT: { amount: 28, currency: 'EUR', display: '€28/mo' },
  ES: { amount: 28, currency: 'EUR', display: '€28/mo' },
  PT: { amount: 28, currency: 'EUR', display: '€28/mo' },
  IE: { amount: 28, currency: 'EUR', display: '€28/mo' },
  LU: { amount: 28, currency: 'EUR', display: '€28/mo' },
  MT: { amount: 28, currency: 'EUR', display: '€28/mo' },
  CY: { amount: 28, currency: 'EUR', display: '€28/mo' },
  EE: { amount: 28, currency: 'EUR', display: '€28/mo' },
  LV: { amount: 28, currency: 'EUR', display: '€28/mo' },
  LT: { amount: 28, currency: 'EUR', display: '€28/mo' },
  SI: { amount: 28, currency: 'EUR', display: '€28/mo' },
  SK: { amount: 28, currency: 'EUR', display: '€28/mo' },
  GI: { amount: 24, currency: 'GBP', display: '£24/mo' },
  LI: { amount: 27, currency: 'CHF', display: 'CHF 27/mo' },
  DK: { amount: 210, currency: 'DKK', display: '210 DKK/mo' },
  SE: { amount: 320, currency: 'SEK', display: '320 SEK/mo' },
  NO: { amount: 330, currency: 'NOK', display: '330 NOK/mo' },
  TH: { amount: 499, currency: 'THB', display: '฿499/mo' },
  MY: { amount: 69, currency: 'MYR', display: 'RM69/mo' },
  BR: { amount: 99, currency: 'BRL', display: 'R$99/mo' },
  MX: { amount: 299, currency: 'MXN', display: 'MX$299/mo' },
  PL: { amount: 79, currency: 'PLN', display: '79 zł/mo' },
  CZ: { amount: 449, currency: 'CZK', display: '449 Kč/mo' },
  HU: { amount: 6999, currency: 'HUF', display: '6,999 Ft/mo' },
  RO: { amount: 89, currency: 'RON', display: '89 lei/mo' },
  HR: { amount: 15, currency: 'EUR', display: '€15/mo' },
  BG: { amount: 29, currency: 'BGN', display: '29 лв/mo' },
  GR: { amount: 19, currency: 'EUR', display: '€19/mo' },
  ZA: { amount: 299, currency: 'ZAR', display: 'R299/mo' },
  IN: { amount: 499, currency: 'INR', display: '₹499/mo' },
  ID: { amount: 99000, currency: 'IDR', display: 'Rp99,000/mo' },
  PH: { amount: 399, currency: 'PHP', display: '₱399/mo' },
  VN: { amount: 149000, currency: 'VND', display: '₫149,000/mo' },
  CO: { amount: 29900, currency: 'COP', display: 'COP$29,900/mo' },
  PE: { amount: 29, currency: 'PEN', display: 'S/29/mo' },
  EG: { amount: 299, currency: 'EGP', display: 'EGP 299/mo' },
  PK: { amount: 1499, currency: 'PKR', display: 'Rs1,499/mo' },
  BD: { amount: 699, currency: 'BDT', display: '৳699/mo' },
  LK: { amount: 1999, currency: 'LKR', display: 'Rs1,999/mo' },
  KH: { amount: 7, currency: 'USD', display: '$7/mo' },
  NP: { amount: 999, currency: 'NPR', display: 'Rs999/mo' },
  KE: { amount: 999, currency: 'KES', display: 'KES 999/mo' },
  NG: { amount: 4999, currency: 'NGN', display: '₦4,999/mo' },
  GH: { amount: 79, currency: 'GHS', display: 'GH₵79/mo' },
  AR: { amount: 5999, currency: 'ARS', display: 'AR$5,999/mo' },
  CL: { amount: 5999, currency: 'CLP', display: 'CLP$5,999/mo' },
};

// Zero-decimal currencies in Stripe
const ZERO_DECIMAL_CURRENCIES = new Set([
  'JPY', 'HUF', 'KRW', 'VND', 'CLP', 'IDR', 'PYG', 'RWF', 'UGX', 'BIF', 'GNF', 'XOF', 'XAF', 'KMF', 'DJF',
]);

export function getVenuePrice(countryCode: string): VenuePrice {
  return VENUE_PRICES[countryCode?.toUpperCase()] || { amount: 30, currency: 'USD', display: '$30/mo' };
}

export function getStripeUnitAmount(countryCode: string): number {
  const price = getVenuePrice(countryCode);
  if (ZERO_DECIMAL_CURRENCIES.has(price.currency.toUpperCase())) {
    return price.amount;
  }
  return Math.round(price.amount * 100);
}

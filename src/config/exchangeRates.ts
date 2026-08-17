/**
 * Static exchange rates for display purposes only.
 * Updated quarterly. Internal ledger stays in USD (JVC = 1 USD).
 * Approximate rates as of March 2026.
 */
export const USD_EXCHANGE_RATES: Record<string, number> = {
  USD: 1, AUD: 1.53, CAD: 1.36, GBP: 0.79, EUR: 0.93,
  NZD: 1.71, SGD: 1.35, AED: 3.67, HKD: 7.82, JPY: 150,
  CHF: 0.88, DKK: 6.92, SEK: 10.5, NOK: 10.8,
  THB: 35.5, MYR: 4.47, BRL: 5.1, MXN: 17.2,
  PLN: 4.05, CZK: 23.5, HUF: 370, RON: 4.65,
  BGN: 1.82, ZAR: 18.5,
  INR: 83.5, IDR: 15800, PHP: 56, VND: 25000,
  COP: 4100, PEN: 3.75, EGP: 49, PKR: 280,
  BDT: 110, LKR: 320, MMK: 2100, NPR: 133,
  KES: 153, NGN: 1550, GHS: 15.5, ARS: 900, CLP: 950,
};

export function usdToLocal(usdAmount: number, currencyCode: string): number {
  const rate = USD_EXCHANGE_RATES[currencyCode] || 1;
  return usdAmount * rate;
}

export function localToUsd(localAmount: number, currencyCode: string): number {
  const rate = USD_EXCHANGE_RATES[currencyCode] || 1;
  return localAmount / rate;
}

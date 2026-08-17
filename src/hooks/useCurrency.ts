import { useState, useEffect, useCallback } from 'react';

// Common currency codes and their display info
export const CURRENCIES: Record<string, { symbol: string; name: string; decimals: number }> = {
  USD: { symbol: '$', name: 'US Dollar', decimals: 2 },
  AUD: { symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  EUR: { symbol: '€', name: 'Euro', decimals: 2 },
  GBP: { symbol: '£', name: 'British Pound', decimals: 2 },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2 },
  JPY: { symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  CNY: { symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  INR: { symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2 },
  KRW: { symbol: '₩', name: 'South Korean Won', decimals: 0 },
  MXN: { symbol: 'MX$', name: 'Mexican Peso', decimals: 2 },
  BRL: { symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
  CHF: { symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
  SEK: { symbol: 'kr', name: 'Swedish Krona', decimals: 2 },
  NOK: { symbol: 'kr', name: 'Norwegian Krone', decimals: 2 },
  DKK: { symbol: 'kr', name: 'Danish Krone', decimals: 2 },
  PHP: { symbol: '₱', name: 'Philippine Peso', decimals: 2 },
  THB: { symbol: '฿', name: 'Thai Baht', decimals: 2 },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah', decimals: 0 },
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit', decimals: 2 },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', decimals: 2 },
  ZAR: { symbol: 'R', name: 'South African Rand', decimals: 2 },
};

// Simulated exchange rates (USD base) - In production, fetch from API
// These represent: 1 USD = X local currency
const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.00,
  AUD: 1.53,    // 1 USD = 1.53 AUD
  EUR: 0.92,    // 1 USD = 0.92 EUR
  GBP: 0.79,    // 1 USD = 0.79 GBP
  CAD: 1.36,
  NZD: 1.64,
  JPY: 149.50,
  CNY: 7.24,
  INR: 83.12,
  SGD: 1.34,
  HKD: 7.82,
  KRW: 1320.00,
  MXN: 17.15,
  BRL: 4.97,
  CHF: 0.88,
  SEK: 10.42,
  NOK: 10.58,
  DKK: 6.87,
  PHP: 55.80,
  THB: 35.50,
  IDR: 15650.00,
  MYR: 4.72,
  AED: 3.67,
  ZAR: 18.50,
};

// Country to currency mapping
const COUNTRY_CURRENCY: Record<string, string> = {
  US: 'USD', AU: 'AUD', GB: 'GBP', CA: 'CAD', NZ: 'NZD',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR', FI: 'EUR',
  JP: 'JPY', CN: 'CNY', IN: 'INR', SG: 'SGD', HK: 'HKD',
  KR: 'KRW', MX: 'MXN', BR: 'BRL', CH: 'CHF', SE: 'SEK',
  NO: 'NOK', DK: 'DKK', PH: 'PHP', TH: 'THB', ID: 'IDR',
  MY: 'MYR', AE: 'AED', ZA: 'ZAR',
};

// JVC is pegged to USDT/USD at 1:1
export const JVC_TO_USD = 1.00;

// Platform transaction fee in USD
export const TRANSACTION_FEE_USD = 0.10;

export const useCurrency = () => {
  const [userCurrency, setUserCurrency] = useState<string>('USD');
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(EXCHANGE_RATES);
  const [loading, setLoading] = useState(true);

  // Detect user's country and set currency
  useEffect(() => {
    const detectCurrency = async () => {
      try {
        // Check localStorage first for user preference
        const savedCurrency = localStorage.getItem('jv_display_currency');
        if (savedCurrency && CURRENCIES[savedCurrency]) {
          setUserCurrency(savedCurrency);
          setLoading(false);
          return;
        }

        // Check user's signup location
        const signupCountry = localStorage.getItem('jv_signup_country');
        if (signupCountry && COUNTRY_CURRENCY[signupCountry]) {
          const currency = COUNTRY_CURRENCY[signupCountry];
          setUserCurrency(currency);
          localStorage.setItem('jv_display_currency', currency);
          setLoading(false);
          return;
        }

        // Try to detect from timezone/locale
        const locale = navigator.language || 'en-US';
        const countryCode = locale.split('-')[1] || 'US';
        const currency = COUNTRY_CURRENCY[countryCode] || 'USD';
        setUserCurrency(currency);
        localStorage.setItem('jv_display_currency', currency);
      } catch (error) {
        console.error('Currency detection error:', error);
      } finally {
        setLoading(false);
      }
    };

    detectCurrency();
  }, []);

  // In production, fetch live exchange rates from an API
  // For now, using static rates
  useEffect(() => {
    // TODO: Fetch live rates from exchangerate-api.com or similar
    // const fetchRates = async () => {
    //   const response = await fetch('https://api.exchangerate.host/latest?base=USD');
    //   const data = await response.json();
    //   setExchangeRates(data.rates);
    // };
    // fetchRates();
  }, []);

  // Convert USD to local currency
  const usdToLocal = useCallback((amountUsd: number): number => {
    const rate = exchangeRates[userCurrency] || 1;
    return amountUsd * rate;
  }, [userCurrency, exchangeRates]);

  // Convert local currency to USD
  const localToUsd = useCallback((amountLocal: number): number => {
    const rate = exchangeRates[userCurrency] || 1;
    return amountLocal / rate;
  }, [userCurrency, exchangeRates]);

  // Convert JVC to local currency (JVC -> USD -> Local)
  const jvcToLocal = useCallback((jvcAmount: number): number => {
    const usdValue = jvcAmount * JVC_TO_USD;
    return usdToLocal(usdValue);
  }, [usdToLocal]);

  // Convert local currency to JVC (Local -> USD -> JVC)
  const localToJvc = useCallback((localAmount: number): number => {
    const usdValue = localToUsd(localAmount);
    return usdValue / JVC_TO_USD;
  }, [localToUsd]);

  // Format currency with proper symbol and decimals
  const formatCurrency = useCallback((amount: number, currencyCode?: string): string => {
    const code = currencyCode || userCurrency;
    const currencyInfo = CURRENCIES[code] || CURRENCIES.USD;
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: currencyInfo.decimals,
      maximumFractionDigits: currencyInfo.decimals,
    }).format(amount);
  }, [userCurrency]);

  // Format JVC amount (always 2 decimals)
  const formatJVC = useCallback((amount: number): string => {
    return `${amount.toFixed(2)} JVC`;
  }, []);

  // Get the current exchange rate for user's currency
  const getCurrentRate = useCallback((): number => {
    return exchangeRates[userCurrency] || 1;
  }, [userCurrency, exchangeRates]);

  // Change display currency
  const setDisplayCurrency = useCallback((currencyCode: string) => {
    if (CURRENCIES[currencyCode]) {
      setUserCurrency(currencyCode);
      localStorage.setItem('jv_display_currency', currencyCode);
    }
  }, []);

  // Get currency info
  const getCurrencyInfo = useCallback((code?: string) => {
    return CURRENCIES[code || userCurrency] || CURRENCIES.USD;
  }, [userCurrency]);

  // Calculate transaction fee in local currency
  const getTransactionFeeLocal = useCallback((): number => {
    return usdToLocal(TRANSACTION_FEE_USD);
  }, [usdToLocal]);

  return {
    userCurrency,
    loading,
    exchangeRates,
    usdToLocal,
    localToUsd,
    jvcToLocal,
    localToJvc,
    formatCurrency,
    formatJVC,
    getCurrentRate,
    setDisplayCurrency,
    getCurrencyInfo,
    getTransactionFeeLocal,
    TRANSACTION_FEE_USD,
    JVC_TO_USD,
    availableCurrencies: Object.keys(CURRENCIES),
  };
};

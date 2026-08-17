export interface CountryConfig {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  decimals: number;
  tier: 'A' | 'B' | 'C' | 'D';
  paymentRail: 'stripe' | 'gateway' | 'both' | 'blocked';
  enabled: boolean;
  locale: string;
  flag: string;
}

export const COUNTRIES: CountryConfig[] = [
  // ===== TIER A — Premium ($30 USD equiv, $0.10 flat fee, Stripe) =====
  { code: 'US', name: 'United States', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-US', flag: '🇺🇸' },
  { code: 'AU', name: 'Australia', currency: 'AUD', currencySymbol: 'A$', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-AU', flag: '🇦🇺' },
  { code: 'CA', name: 'Canada', currency: 'CAD', currencySymbol: 'C$', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-CA', flag: '🇨🇦' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', currencySymbol: '£', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-GB', flag: '🇬🇧' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-IE', flag: '🇮🇪' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', currencySymbol: 'NZ$', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-NZ', flag: '🇳🇿' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', currencySymbol: 'S$', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-SG', flag: '🇸🇬' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', currencySymbol: 'AED', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-AE', flag: '🇦🇪' },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD', currencySymbol: 'HK$', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-HK', flag: '🇭🇰' },
  { code: 'JP', name: 'Japan', currency: 'JPY', currencySymbol: '¥', currencyPosition: 'before', decimals: 0, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'ja-JP', flag: '🇯🇵' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', currencySymbol: 'CHF', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'de-CH', flag: '🇨🇭' },
  { code: 'DE', name: 'Germany', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'de-DE', flag: '🇩🇪' },
  { code: 'FR', name: 'France', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'fr-FR', flag: '🇫🇷' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'nl-NL', flag: '🇳🇱' },
  { code: 'AT', name: 'Austria', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'de-AT', flag: '🇦🇹' },
  { code: 'BE', name: 'Belgium', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'nl-BE', flag: '🇧🇪' },
  { code: 'DK', name: 'Denmark', currency: 'DKK', currencySymbol: 'DKK', currencyPosition: 'after', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'da-DK', flag: '🇩🇰' },
  { code: 'SE', name: 'Sweden', currency: 'SEK', currencySymbol: 'SEK', currencyPosition: 'after', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'sv-SE', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', currency: 'NOK', currencySymbol: 'NOK', currencyPosition: 'after', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'nb-NO', flag: '🇳🇴' },
  { code: 'FI', name: 'Finland', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'fi-FI', flag: '🇫🇮' },
  { code: 'IT', name: 'Italy', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'it-IT', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'es-ES', flag: '🇪🇸' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'pt-PT', flag: '🇵🇹' },
  { code: 'LU', name: 'Luxembourg', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'fr-LU', flag: '🇱🇺' },
  { code: 'MT', name: 'Malta', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-MT', flag: '🇲🇹' },
  { code: 'CY', name: 'Cyprus', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-CY', flag: '🇨🇾' },
  { code: 'EE', name: 'Estonia', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'et-EE', flag: '🇪🇪' },
  { code: 'LV', name: 'Latvia', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'lv-LV', flag: '🇱🇻' },
  { code: 'LT', name: 'Lithuania', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'lt-LT', flag: '🇱🇹' },
  { code: 'SI', name: 'Slovenia', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'sl-SI', flag: '🇸🇮' },
  { code: 'SK', name: 'Slovakia', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'sk-SK', flag: '🇸🇰' },
  { code: 'GI', name: 'Gibraltar', currency: 'GBP', currencySymbol: '£', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'en-GI', flag: '🇬🇮' },
  { code: 'LI', name: 'Liechtenstein', currency: 'CHF', currencySymbol: 'CHF', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'de-LI', flag: '🇱🇮' },
  // NEW Tier A
  { code: 'SM', name: 'San Marino', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: true, locale: 'it-SM', flag: '🇸🇲' },
  { code: 'VA', name: 'Vatican City', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'A', paymentRail: 'stripe', enabled: false, locale: 'it-VA', flag: '🇻🇦' },

  // ===== TIER B — Standard ($15-20 equiv, $0.05 flat fee, Stripe) =====
  { code: 'TH', name: 'Thailand', currency: 'THB', currencySymbol: '฿', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'both', enabled: true, locale: 'th-TH', flag: '🇹🇭' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', currencySymbol: 'RM', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'ms-MY', flag: '🇲🇾' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', currencySymbol: 'R$', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'pt-BR', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', currencySymbol: 'MX$', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'es-MX', flag: '🇲🇽' },
  { code: 'PL', name: 'Poland', currency: 'PLN', currencySymbol: 'zł', currencyPosition: 'after', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'pl-PL', flag: '🇵🇱' },
  { code: 'CZ', name: 'Czech Republic', currency: 'CZK', currencySymbol: 'Kč', currencyPosition: 'after', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'cs-CZ', flag: '🇨🇿' },
  { code: 'HU', name: 'Hungary', currency: 'HUF', currencySymbol: 'Ft', currencyPosition: 'after', decimals: 0, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'hu-HU', flag: '🇭🇺' },
  { code: 'RO', name: 'Romania', currency: 'RON', currencySymbol: 'lei', currencyPosition: 'after', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'ro-RO', flag: '🇷🇴' },
  { code: 'HR', name: 'Croatia', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'hr-HR', flag: '🇭🇷' },
  { code: 'BG', name: 'Bulgaria', currency: 'BGN', currencySymbol: 'лв', currencyPosition: 'after', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'bg-BG', flag: '🇧🇬' },
  { code: 'GR', name: 'Greece', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'el-GR', flag: '🇬🇷' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', currencySymbol: 'R', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'both', enabled: true, locale: 'en-ZA', flag: '🇿🇦' },
  // NEW Tier B
  { code: 'AD', name: 'Andorra', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'ca-AD', flag: '🇦🇩' },
  { code: 'BH', name: 'Bahrain', currency: 'BHD', currencySymbol: 'BD', currencyPosition: 'before', decimals: 3, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'ar-BH', flag: '🇧🇭' },
  { code: 'CR', name: 'Costa Rica', currency: 'CRC', currencySymbol: '₡', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'es-CR', flag: '🇨🇷' },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', currencySymbol: 'CFA', currencyPosition: 'after', decimals: 0, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'fr-CI', flag: '🇨🇮' },
  { code: 'SV', name: 'El Salvador', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'es-SV', flag: '🇸🇻' },
  { code: 'GE', name: 'Georgia', currency: 'GEL', currencySymbol: '₾', currencyPosition: 'after', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'ka-GE', flag: '🇬🇪' },
  { code: 'IS', name: 'Iceland', currency: 'ISK', currencySymbol: 'ISK', currencyPosition: 'after', decimals: 0, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'is-IS', flag: '🇮🇸' },
  { code: 'IL', name: 'Israel', currency: 'ILS', currencySymbol: '₪', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'he-IL', flag: '🇮🇱' },
  { code: 'KZ', name: 'Kazakhstan', currency: 'KZT', currencySymbol: '₸', currencyPosition: 'after', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'kk-KZ', flag: '🇰🇿' },
  { code: 'KR', name: 'South Korea', currency: 'KRW', currencySymbol: '₩', currencyPosition: 'before', decimals: 0, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'ko-KR', flag: '🇰🇷' },
  { code: 'MC', name: 'Monaco', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'fr-MC', flag: '🇲🇨' },
  { code: 'RS', name: 'Serbia', currency: 'RSD', currencySymbol: 'din', currencyPosition: 'after', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'sr-RS', flag: '🇷🇸' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', currencySymbol: 'SAR', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'ar-SA', flag: '🇸🇦' },
  { code: 'TW', name: 'Taiwan', currency: 'TWD', currencySymbol: 'NT$', currencyPosition: 'before', decimals: 0, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'zh-TW', flag: '🇹🇼' },
  { code: 'TT', name: 'Trinidad and Tobago', currency: 'TTD', currencySymbol: 'TT$', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'en-TT', flag: '🇹🇹' },
  { code: 'TR', name: 'Turkey', currency: 'TRY', currencySymbol: '₺', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'tr-TR', flag: '🇹🇷' },
  { code: 'UA', name: 'Ukraine', currency: 'UAH', currencySymbol: '₴', currencyPosition: 'after', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'uk-UA', flag: '🇺🇦' },
  { code: 'UY', name: 'Uruguay', currency: 'UYU', currencySymbol: '$U', currencyPosition: 'before', decimals: 2, tier: 'B', paymentRail: 'stripe', enabled: true, locale: 'es-UY', flag: '🇺🇾' },

  // ===== TIER C — Growth ($5-10 equiv, percentage fee, Gateway) =====
  { code: 'IN', name: 'India', currency: 'INR', currencySymbol: '₹', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'en-IN', flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', currencySymbol: 'Rp', currencyPosition: 'before', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'id-ID', flag: '🇮🇩' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', currencySymbol: '₱', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'en-PH', flag: '🇵🇭' },
  { code: 'VN', name: 'Vietnam', currency: 'VND', currencySymbol: '₫', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'vi-VN', flag: '🇻🇳' },
  { code: 'CO', name: 'Colombia', currency: 'COP', currencySymbol: 'COP$', currencyPosition: 'before', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'es-CO', flag: '🇨🇴' },
  { code: 'PE', name: 'Peru', currency: 'PEN', currencySymbol: 'S/', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'es-PE', flag: '🇵🇪' },
  { code: 'EG', name: 'Egypt', currency: 'EGP', currencySymbol: 'EGP', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'ar-EG', flag: '🇪🇬' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', currencySymbol: 'Rs', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'en-PK', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', currencySymbol: '৳', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'bn-BD', flag: '🇧🇩' },
  { code: 'LK', name: 'Sri Lanka', currency: 'LKR', currencySymbol: 'Rs', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'en-LK', flag: '🇱🇰' },
  { code: 'KH', name: 'Cambodia', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'km-KH', flag: '🇰🇭' },
  { code: 'MM', name: 'Myanmar', currency: 'MMK', currencySymbol: 'K', currencyPosition: 'before', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'my-MM', flag: '🇲🇲' },
  { code: 'NP', name: 'Nepal', currency: 'NPR', currencySymbol: 'Rs', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'ne-NP', flag: '🇳🇵' },
  { code: 'KE', name: 'Kenya', currency: 'KES', currencySymbol: 'KES', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'en-KE', flag: '🇰🇪' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', currencySymbol: '₦', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'en-NG', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana', currency: 'GHS', currencySymbol: 'GH₵', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'en-GH', flag: '🇬🇭' },
  { code: 'AR', name: 'Argentina', currency: 'ARS', currencySymbol: 'AR$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'es-AR', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', currency: 'CLP', currencySymbol: 'CLP$', currencyPosition: 'before', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: true, locale: 'es-CL', flag: '🇨🇱' },
  // NEW Tier C (all disabled)
  { code: 'AL', name: 'Albania', currency: 'ALL', currencySymbol: 'L', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'sq-AL', flag: '🇦🇱' },
  { code: 'AO', name: 'Angola', currency: 'AOA', currencySymbol: 'Kz', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'pt-AO', flag: '🇦🇴' },
  { code: 'AG', name: 'Antigua and Barbuda', currency: 'XCD', currencySymbol: 'EC$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-AG', flag: '🇦🇬' },
  { code: 'AM', name: 'Armenia', currency: 'AMD', currencySymbol: '֏', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'hy-AM', flag: '🇦🇲' },
  { code: 'AZ', name: 'Azerbaijan', currency: 'AZN', currencySymbol: '₼', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'az-AZ', flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas', currency: 'BSD', currencySymbol: 'B$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-BS', flag: '🇧🇸' },
  { code: 'BB', name: 'Barbados', currency: 'BBD', currencySymbol: 'Bds$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-BB', flag: '🇧🇧' },
  { code: 'BZ', name: 'Belize', currency: 'BZD', currencySymbol: 'BZ$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-BZ', flag: '🇧🇿' },
  { code: 'BJ', name: 'Benin', currency: 'XOF', currencySymbol: 'CFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-BJ', flag: '🇧🇯' },
  { code: 'BT', name: 'Bhutan', currency: 'BTN', currencySymbol: 'Nu', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'dz-BT', flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia', currency: 'BOB', currencySymbol: 'Bs', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'es-BO', flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina', currency: 'BAM', currencySymbol: 'KM', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'bs-BA', flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana', currency: 'BWP', currencySymbol: 'P', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-BW', flag: '🇧🇼' },
  { code: 'BN', name: 'Brunei', currency: 'BND', currencySymbol: 'B$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ms-BN', flag: '🇧🇳' },
  { code: 'BF', name: 'Burkina Faso', currency: 'XOF', currencySymbol: 'CFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-BF', flag: '🇧🇫' },
  { code: 'CV', name: 'Cabo Verde', currency: 'CVE', currencySymbol: 'CVE', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'pt-CV', flag: '🇨🇻' },
  { code: 'CM', name: 'Cameroon', currency: 'XAF', currencySymbol: 'FCFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-CM', flag: '🇨🇲' },
  { code: 'CF', name: 'Central African Republic', currency: 'XAF', currencySymbol: 'FCFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-CF', flag: '🇨🇫' },
  { code: 'TD', name: 'Chad', currency: 'XAF', currencySymbol: 'FCFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-TD', flag: '🇹🇩' },
  { code: 'CG', name: 'Congo Republic', currency: 'XAF', currencySymbol: 'FCFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-CG', flag: '🇨🇬' },
  { code: 'DJ', name: 'Djibouti', currency: 'DJF', currencySymbol: 'Fdj', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-DJ', flag: '🇩🇯' },
  { code: 'DM', name: 'Dominica', currency: 'XCD', currencySymbol: 'EC$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-DM', flag: '🇩🇲' },
  { code: 'DO', name: 'Dominican Republic', currency: 'DOP', currencySymbol: 'RD$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'es-DO', flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'es-EC', flag: '🇪🇨' },
  { code: 'SZ', name: 'Eswatini', currency: 'SZL', currencySymbol: 'E', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-SZ', flag: '🇸🇿' },
  { code: 'GA', name: 'Gabon', currency: 'XAF', currencySymbol: 'FCFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-GA', flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia', currency: 'GMD', currencySymbol: 'D', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-GM', flag: '🇬🇲' },
  { code: 'GD', name: 'Grenada', currency: 'XCD', currencySymbol: 'EC$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-GD', flag: '🇬🇩' },
  { code: 'GT', name: 'Guatemala', currency: 'GTQ', currencySymbol: 'Q', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'es-GT', flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea', currency: 'GNF', currencySymbol: 'FG', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-GN', flag: '🇬🇳' },
  { code: 'GY', name: 'Guyana', currency: 'GYD', currencySymbol: 'G$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-GY', flag: '🇬🇾' },
  { code: 'HN', name: 'Honduras', currency: 'HNL', currencySymbol: 'L', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'es-HN', flag: '🇭🇳' },
  { code: 'JM', name: 'Jamaica', currency: 'JMD', currencySymbol: 'J$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-JM', flag: '🇯🇲' },
  { code: 'JO', name: 'Jordan', currency: 'JOD', currencySymbol: 'JD', currencyPosition: 'before', decimals: 3, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ar-JO', flag: '🇯🇴' },
  { code: 'XK', name: 'Kosovo', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'sq-XK', flag: '🇽🇰' },
  { code: 'KW', name: 'Kuwait', currency: 'KWD', currencySymbol: 'KD', currencyPosition: 'before', decimals: 3, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ar-KW', flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan', currency: 'KGS', currencySymbol: 'сом', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ky-KG', flag: '🇰🇬' },
  { code: 'LA', name: 'Laos', currency: 'LAK', currencySymbol: '₭', currencyPosition: 'before', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'lo-LA', flag: '🇱🇦' },
  { code: 'LB', name: 'Lebanon', currency: 'LBP', currencySymbol: 'L£', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ar-LB', flag: '🇱🇧' },
  { code: 'MG', name: 'Madagascar', currency: 'MGA', currencySymbol: 'Ar', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'mg-MG', flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi', currency: 'MWK', currencySymbol: 'MK', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-MW', flag: '🇲🇼' },
  { code: 'MV', name: 'Maldives', currency: 'MVR', currencySymbol: 'Rf', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'dv-MV', flag: '🇲🇻' },
  { code: 'ML', name: 'Mali', currency: 'XOF', currencySymbol: 'CFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-ML', flag: '🇲🇱' },
  { code: 'MU', name: 'Mauritius', currency: 'MUR', currencySymbol: '₨', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-MU', flag: '🇲🇺' },
  { code: 'MD', name: 'Moldova', currency: 'MDL', currencySymbol: 'L', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ro-MD', flag: '🇲🇩' },
  { code: 'MN', name: 'Mongolia', currency: 'MNT', currencySymbol: '₮', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'mn-MN', flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro', currency: 'EUR', currencySymbol: '€', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'sr-ME', flag: '🇲🇪' },
  { code: 'MA', name: 'Morocco', currency: 'MAD', currencySymbol: 'MAD', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ar-MA', flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique', currency: 'MZN', currencySymbol: 'MT', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'pt-MZ', flag: '🇲🇿' },
  { code: 'OM', name: 'Oman', currency: 'OMR', currencySymbol: 'OMR', currencyPosition: 'before', decimals: 3, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ar-OM', flag: '🇴🇲' },
  { code: 'PA', name: 'Panama', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'es-PA', flag: '🇵🇦' },
  { code: 'PY', name: 'Paraguay', currency: 'PYG', currencySymbol: '₲', currencyPosition: 'before', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'es-PY', flag: '🇵🇾' },
  { code: 'QA', name: 'Qatar', currency: 'QAR', currencySymbol: 'QR', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ar-QA', flag: '🇶🇦' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF', currencySymbol: 'FRw', currencyPosition: 'before', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'rw-RW', flag: '🇷🇼' },
  { code: 'KN', name: 'Saint Kitts and Nevis', currency: 'XCD', currencySymbol: 'EC$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-KN', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia', currency: 'XCD', currencySymbol: 'EC$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-LC', flag: '🇱🇨' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', currency: 'XCD', currencySymbol: 'EC$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-VC', flag: '🇻🇨' },
  { code: 'WS', name: 'Samoa', currency: 'WST', currencySymbol: 'WS$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'sm-WS', flag: '🇼🇸' },
  { code: 'ST', name: 'São Tomé and Príncipe', currency: 'STN', currencySymbol: 'Db', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'pt-ST', flag: '🇸🇹' },
  { code: 'SN', name: 'Senegal', currency: 'XOF', currencySymbol: 'CFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-SN', flag: '🇸🇳' },
  { code: 'SC', name: 'Seychelles', currency: 'SCR', currencySymbol: '₨', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-SC', flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone', currency: 'SLE', currencySymbol: 'Le', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-SL', flag: '🇸🇱' },
  { code: 'SB', name: 'Solomon Islands', currency: 'SBD', currencySymbol: 'SI$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-SB', flag: '🇸🇧' },
  { code: 'SR', name: 'Suriname', currency: 'SRD', currencySymbol: 'SRD', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'nl-SR', flag: '🇸🇷' },
  { code: 'TJ', name: 'Tajikistan', currency: 'TJS', currencySymbol: 'SM', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'tg-TJ', flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', currencySymbol: 'TSh', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'sw-TZ', flag: '🇹🇿' },
  { code: 'TL', name: 'Timor-Leste', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'pt-TL', flag: '🇹🇱' },
  { code: 'TG', name: 'Togo', currency: 'XOF', currencySymbol: 'CFA', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-TG', flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga', currency: 'TOP', currencySymbol: 'T$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'to-TO', flag: '🇹🇴' },
  { code: 'TN', name: 'Tunisia', currency: 'TND', currencySymbol: 'DT', currencyPosition: 'after', decimals: 3, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'ar-TN', flag: '🇹🇳' },
  { code: 'TV', name: 'Tuvalu', currency: 'AUD', currencySymbol: 'A$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-TV', flag: '🇹🇻' },
  { code: 'UG', name: 'Uganda', currency: 'UGX', currencySymbol: 'USh', currencyPosition: 'before', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-UG', flag: '🇺🇬' },
  { code: 'UZ', name: 'Uzbekistan', currency: 'UZS', currencySymbol: 'сўм', currencyPosition: 'after', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'uz-UZ', flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu', currency: 'VUV', currencySymbol: 'VT', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'bi-VU', flag: '🇻🇺' },
  { code: 'VE', name: 'Venezuela', currency: 'VES', currencySymbol: 'Bs', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'es-VE', flag: '🇻🇪' },
  { code: 'WF', name: 'Wallis and Futuna', currency: 'XPF', currencySymbol: '₣', currencyPosition: 'after', decimals: 0, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'fr-WF', flag: '🇼🇫' },
  { code: 'ZM', name: 'Zambia', currency: 'ZMW', currencySymbol: 'ZK', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-ZM', flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'C', paymentRail: 'gateway', enabled: false, locale: 'en-ZW', flag: '🇿🇼' },

  // ===== TIER D — Deferred / Blocked (disabled, blocked rail) =====
  { code: 'AF', name: 'Afghanistan', currency: 'AFN', currencySymbol: '؋', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ps-AF', flag: '🇦🇫' },
  { code: 'DZ', name: 'Algeria', currency: 'DZD', currencySymbol: 'DA', currencyPosition: 'after', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-DZ', flag: '🇩🇿' },
  { code: 'BY', name: 'Belarus', currency: 'BYN', currencySymbol: 'Br', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'be-BY', flag: '🇧🇾' },
  { code: 'BI', name: 'Burundi', currency: 'BIF', currencySymbol: 'FBu', currencyPosition: 'after', decimals: 0, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'fr-BI', flag: '🇧🇮' },
  { code: 'CN', name: 'China', currency: 'CNY', currencySymbol: '¥', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'zh-CN', flag: '🇨🇳' },
  { code: 'KM', name: 'Comoros', currency: 'KMF', currencySymbol: 'CF', currencyPosition: 'after', decimals: 0, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-KM', flag: '🇰🇲' },
  { code: 'CD', name: 'Congo, Democratic Republic', currency: 'CDF', currencySymbol: 'FC', currencyPosition: 'after', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'fr-CD', flag: '🇨🇩' },
  { code: 'CU', name: 'Cuba', currency: 'CUP', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'es-CU', flag: '🇨🇺' },
  { code: 'GQ', name: 'Equatorial Guinea', currency: 'XAF', currencySymbol: 'FCFA', currencyPosition: 'after', decimals: 0, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'es-GQ', flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea', currency: 'ERN', currencySymbol: 'Nfk', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ti-ER', flag: '🇪🇷' },
  { code: 'ET', name: 'Ethiopia', currency: 'ETB', currencySymbol: 'Br', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'am-ET', flag: '🇪🇹' },
  { code: 'FJ', name: 'Fiji', currency: 'FJD', currencySymbol: 'FJ$', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-FJ', flag: '🇫🇯' },
  { code: 'GW', name: 'Guinea-Bissau', currency: 'XOF', currencySymbol: 'CFA', currencyPosition: 'after', decimals: 0, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'pt-GW', flag: '🇬🇼' },
  { code: 'HT', name: 'Haiti', currency: 'HTG', currencySymbol: 'G', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'fr-HT', flag: '🇭🇹' },
  { code: 'IR', name: 'Iran', currency: 'IRR', currencySymbol: '﷼', currencyPosition: 'after', decimals: 0, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'fa-IR', flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq', currency: 'IQD', currencySymbol: 'ع.د', currencyPosition: 'after', decimals: 3, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-IQ', flag: '🇮🇶' },
  { code: 'KI', name: 'Kiribati', currency: 'AUD', currencySymbol: 'A$', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-KI', flag: '🇰🇮' },
  { code: 'KP', name: 'North Korea', currency: 'KPW', currencySymbol: '₩', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ko-KP', flag: '🇰🇵' },
  { code: 'LS', name: 'Lesotho', currency: 'LSL', currencySymbol: 'L', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-LS', flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia', currency: 'LRD', currencySymbol: 'L$', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-LR', flag: '🇱🇷' },
  { code: 'LY', name: 'Libya', currency: 'LYD', currencySymbol: 'LD', currencyPosition: 'before', decimals: 3, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-LY', flag: '🇱🇾' },
  { code: 'MH', name: 'Marshall Islands', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-MH', flag: '🇲🇭' },
  { code: 'MR', name: 'Mauritania', currency: 'MRU', currencySymbol: 'UM', currencyPosition: 'after', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-MR', flag: '🇲🇷' },
  { code: 'FM', name: 'Micronesia', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-FM', flag: '🇫🇲' },
  { code: 'PW', name: 'Palau', currency: 'USD', currencySymbol: '$', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-PW', flag: '🇵🇼' },
  { code: 'PG', name: 'Papua New Guinea', currency: 'PGK', currencySymbol: 'K', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-PG', flag: '🇵🇬' },
  { code: 'RU', name: 'Russia', currency: 'RUB', currencySymbol: '₽', currencyPosition: 'after', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ru-RU', flag: '🇷🇺' },
  { code: 'SO', name: 'Somalia', currency: 'SOS', currencySymbol: 'Sh', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'so-SO', flag: '🇸🇴' },
  { code: 'SS', name: 'South Sudan', currency: 'SSP', currencySymbol: '£', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'en-SS', flag: '🇸🇸' },
  { code: 'SD', name: 'Sudan', currency: 'SDG', currencySymbol: 'SDG', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-SD', flag: '🇸🇩' },
  { code: 'SY', name: 'Syria', currency: 'SYP', currencySymbol: '£S', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-SY', flag: '🇸🇾' },
  { code: 'TM', name: 'Turkmenistan', currency: 'TMT', currencySymbol: 'T', currencyPosition: 'before', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'tk-TM', flag: '🇹🇲' },
  { code: 'EH', name: 'Western Sahara', currency: 'MAD', currencySymbol: 'MAD', currencyPosition: 'after', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-EH', flag: '🇪🇭' },
  { code: 'YE', name: 'Yemen', currency: 'YER', currencySymbol: '﷼', currencyPosition: 'after', decimals: 2, tier: 'D', paymentRail: 'blocked', enabled: false, locale: 'ar-YE', flag: '🇾🇪' },
];

// Blocked countries — DO NOT allow registration
export const BLOCKED_COUNTRIES = ['KP', 'IR', 'SY', 'CU', 'SD', 'SO', 'AF', 'YE', 'BY', 'RU', 'SS', 'IQ', 'LY'];

// ===== HELPER FUNCTIONS =====

export function getCountryByCode(code: string): CountryConfig | undefined {
  return COUNTRIES.find(c => c.code === code?.toUpperCase());
}

export function getCountryByName(name: string): CountryConfig | undefined {
  return COUNTRIES.find(c => c.name.toLowerCase() === name?.toLowerCase());
}

export function getEnabledCountries(): CountryConfig[] {
  return COUNTRIES
    .filter(c => c.enabled && !BLOCKED_COUNTRIES.includes(c.code))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAllCountriesSorted(): CountryConfig[] {
  return COUNTRIES
    .filter(c => !BLOCKED_COUNTRIES.includes(c.code))
    .sort((a, b) => {
      // Enabled countries first, then alphabetical
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function isCountryEnabled(code: string): boolean {
  const country = getCountryByCode(code);
  if (!country) return false;
  return country.enabled && !BLOCKED_COUNTRIES.includes(code.toUpperCase());
}

export function getCountryTier(code: string): string {
  return getCountryByCode(code)?.tier || 'A';
}

export function getPaymentRail(code: string): string {
  if (BLOCKED_COUNTRIES.includes(code?.toUpperCase())) return 'blocked';
  return getCountryByCode(code)?.paymentRail || 'stripe';
}

/**
 * Format a number as currency for a given country
 */
export function formatCurrency(amount: number, countryCode: string): string {
  const country = getCountryByCode(countryCode);
  if (!country) return `$${amount.toFixed(2)}`;

  const num = Number(amount.toFixed(country.decimals)).toLocaleString(country.locale, {
    minimumFractionDigits: country.decimals,
    maximumFractionDigits: country.decimals,
  });

  if (country.currencyPosition === 'before') {
    return `${country.currencySymbol}${num}`;
  } else {
    return `${num} ${country.currencySymbol}`;
  }
}

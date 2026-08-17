/**
 * Comprehensive CSV Parser for POS & Payment Processor Exports
 * Supports: Square, Toast, Clover, Stripe, Tyro (AU), Lightspeed, Zettle, Westpac, CommBank, and more
 */

export interface ParsedCSVResult {
  totalRevenue: number;
  totalTransactions: number;
  cardCount: number;
  cashCount: number;
  deliveryCount: number;
  amexCount: number;
  totalFees: number;
  detectedSystem: string | null;
  dateRange: { start: string | null; end: string | null };
  avgTransactionSize: number;
  // Exact revenue by type (not averages)
  deliveryRevenue: number; // Exact sum of delivery order amounts
  cardRevenue: number; // Exact sum of card transaction amounts
  cashRevenue: number; // Exact sum of cash transaction amounts
  // Exact fees by type (from CSV fee column if available)
  cardFees: number; // Exact sum of fees for card transactions
  deliveryFees: number; // Exact sum of fees for delivery transactions
  hasActualFees: boolean; // TRUE if CSV contained usable fee data
}

// Column name mappings - comprehensive list from all major POS systems worldwide
const COLUMN_MAPPINGS = {
  // Date/Time columns
  date: [
    'date', 'transaction_date', 'timestamp', 'created_at', 'sale_date',
    'datetime', 'created (utc)', 'transaction date', 'time', 'sale_time',
    'payment_date', 'order_date', 'posted_date', 'settlement_date',
    'transaction time', 'transaction timestamp', 'created', 'order time',
    'completed_at', 'finalized_at', 'close_date', 'business_date'
  ],

  // Amount/Revenue columns
  amount: [
    'amount', 'gross_amount', 'total', 'sale_amount', 'gross_sales',
    'net_sales', 'transaction_amount', 'gross sales', 'net sales',
    'transaction amount', 'total collected', 'payment_amount', 'sum',
    'revenue', 'net_total', 'net total', 'subtotal', 'sub_total',
    'total_amount', 'sale_total', 'order_total', 'check_total',
    'total payments', 'collected', 'payment amount', 'transaction value',
    'amount (aud)', 'amount (usd)', 'value', 'sales', 'sale', 'price'
  ],

  // Payment method columns
  paymentMethod: [
    'payment_method', 'payment_type', 'tender_type', 'card_type',
    'card', 'card brand', 'payment type', 'card entry methods',
    'payments', 'tender', 'payment method', 'method', 'card_brand',
    'payment_channel', 'source', 'type', 'transaction_type',
    'payment_mode', 'tender_name', 'payment_source', 'scheme',
    'card scheme', 'network', 'card network', 'instrument_type'
  ],

  // Provider/Processor columns
  provider: [
    'provider', 'processor', 'gateway', 'payment_processor',
    'merchant', 'source', 'terminal', 'pos', 'channel', 'platform',
    'acquirer', 'issuer', 'revenue_center', 'revenue center',
    'device', 'terminal_id', 'location'
  ],

  // Fee columns
  fees: [
    'fees', 'fee_amount', 'processing_fee', 'merchant_fee',
    'commission', 'fee', 'merchant service fee', 'transaction_fee',
    'card_fee', 'processing fees', 'service_fee', 'interchange',
    'mdr', 'merchant_discount_rate', 'surcharge', 'cost'
  ],

  // Transaction ID columns (for deduplication)
  transactionId: [
    'transaction_id', 'id', 'order_id', 'receipt_id',
    'check_id', 'sale_id', 'sale id', 'reference', 'ref',
    'payment_id', 'invoice_id', 'invoice', 'receipt_number'
  ],

  // Refund indicators
  refund: [
    'refund', 'refund_amount', 'refunded', 'chargeback',
    'disputed', 'void', 'voided', 'cancelled', 'status'
  ],

  // Delivery platform indicators
  delivery: [
    'delivery', 'channel', 'source', 'platform', 'order_type',
    'order type', 'sales_channel', 'sales channel', 'revenue_center'
  ]
};

// Payment type detection patterns
const PAYMENT_PATTERNS = {
  card: [
    'visa', 'mastercard', 'mc', 'amex', 'american express', 'credit',
    'debit', 'card', 'eftpos', 'contactless', 'tap', 'chip',
    'swipe', 'keyed', 'manual', 'apple pay', 'google pay', 'samsung pay',
    'paywave', 'paypass', 'nfc', 'terminal', 'pos', 'discover',
    'diners', 'jcb', 'unionpay', 'maestro', 'electron'
  ],
  cash: [
    'cash', 'currency', 'notes', 'coins', 'change'
  ],
  amex: [
    'amex', 'american express', 'americanexpress'
  ],
  delivery: [
    'uber', 'uber eats', 'ubereats', 'doordash', 'door dash', 'deliveroo',
    'menulog', 'grubhub', 'postmates', 'caviar', 'seamless', 'justeat',
    'just eat', 'skip the dishes', 'skip', 'foodpanda', 'grab', 'gojek',
    'delivery', 'online order', 'third party', '3rd party', 'marketplace'
  ],
  digitalWallet: [
    'apple pay', 'applepay', 'google pay', 'googlepay', 'samsung pay',
    'paypal', 'venmo', 'afterpay', 'zip', 'klarna', 'laybuy', 'humm'
  ]
};

// POS system detection patterns
const POS_DETECTION = {
  'Square': ['square', 'sq_', 'squareup'],
  'Toast': ['toast', 'check id', 'revenue center'],
  'Clover': ['clover', 'clv_'],
  'Stripe': ['stripe', 'ch_', 'pi_', 'card brand', 'card funding'],
  'Tyro': ['tyro', 'merchant id', 'terminal id', 'merchant service fee'],
  'Lightspeed': ['lightspeed', 'retail_id', 'register'],
  'Zettle': ['zettle', 'izettle', 'paypal here'],
  'Westpac': ['westpac', 'presto'],
  'CommBank': ['commbank', 'cba', 'albert'],
  'NAB': ['nab', 'national australia'],
  'ANZ': ['anz', 'worldline'],
  'Shopify': ['shopify', 'shop_'],
  'Vend': ['vend', 'lightspeed retail'],
  'Revel': ['revel', 'revel_'],
  'TouchBistro': ['touchbistro', 'tb_'],
  'Kounta': ['kounta', 'lightspeed hospitality']
};

/**
 * Smart CSV parser that handles quoted fields and various delimiters
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Detect which column index matches a field type
 */
function detectColumnIndex(headers: string[], fieldType: keyof typeof COLUMN_MAPPINGS): number {
  const variations = COLUMN_MAPPINGS[fieldType];
  const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/['"]/g, '').trim());
  
  // First pass: exact match
  for (let i = 0; i < normalizedHeaders.length; i++) {
    if (variations.includes(normalizedHeaders[i])) {
      return i;
    }
  }
  
  // Second pass: partial match
  for (let i = 0; i < normalizedHeaders.length; i++) {
    for (const variation of variations) {
      if (normalizedHeaders[i].includes(variation) || variation.includes(normalizedHeaders[i])) {
        return i;
      }
    }
  }
  
  return -1;
}

/**
 * Detect which POS system the export is from
 */
function detectPOSSystem(headers: string[], sampleData: string[]): string | null {
  const combined = [...headers, ...sampleData].join(' ').toLowerCase();
  
  for (const [system, patterns] of Object.entries(POS_DETECTION)) {
    if (patterns.some(pattern => combined.includes(pattern))) {
      return system;
    }
  }
  
  return null;
}

/**
 * Detect payment type from a value
 */
function detectPaymentType(value: string): { isCard: boolean; isCash: boolean; isAmex: boolean; isDelivery: boolean } {
  const lower = value.toLowerCase();
  
  return {
    isCard: PAYMENT_PATTERNS.card.some(p => lower.includes(p)),
    isCash: PAYMENT_PATTERNS.cash.some(p => lower.includes(p)),
    isAmex: PAYMENT_PATTERNS.amex.some(p => lower.includes(p)),
    isDelivery: PAYMENT_PATTERNS.delivery.some(p => lower.includes(p))
  };
}

/**
 * Parse a numeric value, handling currency symbols and formatting
 */
function parseAmount(value: string): number {
  if (!value) return 0;
  
  // Remove currency symbols, quotes, and thousands separators
  const cleaned = value
    .replace(/[$€£¥₹AUD\s"']/gi, '')
    .replace(/,(?=\d{3})/g, '') // Remove thousands separator
    .trim();
  
  // Handle negative values in parentheses: (100.00) -> -100.00
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -parseFloat(cleaned.slice(1, -1)) || 0;
  }
  
  return parseFloat(cleaned) || 0;
}

/**
 * Check if a row represents a refund
 */
function isRefundRow(cols: string[], headers: string[]): boolean {
  const refundIdx = detectColumnIndex(headers, 'refund');
  
  if (refundIdx >= 0 && cols[refundIdx]) {
    const val = cols[refundIdx].toLowerCase();
    return val.includes('refund') || val.includes('void') || val.includes('cancel') || val === 'true';
  }
  
  // Check for negative amounts
  const amountIdx = detectColumnIndex(headers, 'amount');
  if (amountIdx >= 0 && cols[amountIdx]) {
    const amount = parseAmount(cols[amountIdx]);
    if (amount < 0) return true;
  }
  
  return false;
}

/**
 * Main CSV parsing function
 */
export function parseCSVData(csvText: string): ParsedCSVResult {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV file appears to be empty or invalid');
  }
  
  // Parse headers
  const headers = parseCSVLine(lines[0]);
  
  // Detect column indices
  const amountIdx = detectColumnIndex(headers, 'amount');
  const paymentMethodIdx = detectColumnIndex(headers, 'paymentMethod');
  const providerIdx = detectColumnIndex(headers, 'provider');
  const deliveryIdx = detectColumnIndex(headers, 'delivery');
  const feeIdx = detectColumnIndex(headers, 'fees');
  const dateIdx = detectColumnIndex(headers, 'date');
  
  // Get sample data for POS detection
  const sampleData = lines.slice(1, 6).flatMap(l => parseCSVLine(l));
  const detectedSystem = detectPOSSystem(headers, sampleData);
  
  // Initialize counters
  let totalRevenue = 0;
  let totalTransactions = 0;
  let cardCount = 0;
  let cashCount = 0;
  let deliveryCount = 0;
  let amexCount = 0;
  let totalFees = 0;
  const dates: Date[] = [];
  
  // Track exact revenue by payment type
  let deliveryRevenue = 0;
  let cardRevenue = 0;
  let cashRevenue = 0;
  
  // Track exact fees by payment type (from CSV fee column)
  let cardFees = 0;
  let deliveryFees = 0;
  let feesFound = 0; // Count of transactions with fee data
  
  // Track seen transaction IDs to avoid duplicates
  const seenIds = new Set<string>();
  const txnIdIdx = detectColumnIndex(headers, 'transactionId');
  
  // Process each data row
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    
    if (cols.length < 2) continue;
    
    // Skip refunds
    if (isRefundRow(cols, headers)) continue;
    
    // Skip duplicate transactions
    if (txnIdIdx >= 0 && cols[txnIdIdx]) {
      if (seenIds.has(cols[txnIdIdx])) continue;
      seenIds.add(cols[txnIdIdx]);
    }
    
    // Parse amount
    let amount = 0;
    if (amountIdx >= 0 && cols[amountIdx]) {
      amount = parseAmount(cols[amountIdx]);
    } else {
      // Fallback: find first numeric column that looks like an amount
      for (const col of cols) {
        const parsed = parseAmount(col);
        if (parsed > 0 && parsed < 100000) { // Reasonable transaction amount
          amount = parsed;
          break;
        }
      }
    }
    
    if (amount <= 0) continue;
    
    totalRevenue += amount;
    totalTransactions++;
    
    // Parse payment method
    let paymentValue = '';
    if (paymentMethodIdx >= 0 && cols[paymentMethodIdx]) {
      paymentValue = cols[paymentMethodIdx];
    } else if (providerIdx >= 0 && cols[providerIdx]) {
      paymentValue = cols[providerIdx];
    }
    
    // Check delivery channel
    let isDeliveryOrder = false;
    if (deliveryIdx >= 0 && cols[deliveryIdx]) {
      const { isDelivery } = detectPaymentType(cols[deliveryIdx]);
      isDeliveryOrder = isDelivery;
    }
    
    // Parse fees BEFORE payment type detection (need fee for categorization)
    let rowFee = 0;
    if (feeIdx >= 0 && cols[feeIdx]) {
      rowFee = parseAmount(cols[feeIdx]);
      if (rowFee > 0) {
        totalFees += rowFee;
        feesFound++;
      }
    }
    
    if (paymentValue || isDeliveryOrder) {
      const detection = detectPaymentType(paymentValue);
      
      if (detection.isDelivery || isDeliveryOrder) {
        deliveryCount++;
        deliveryRevenue += amount; // Track exact delivery revenue
        deliveryFees += rowFee; // Track exact delivery fees
      } else if (detection.isCash) {
        cashCount++;
        cashRevenue += amount; // Track exact cash revenue
        // Cash has no fees
      } else if (detection.isCard) {
        cardCount++;
        cardRevenue += amount; // Track exact card revenue
        cardFees += rowFee; // Track exact card fees
        if (detection.isAmex) {
          amexCount++;
        }
      } else {
        // Default to card if can't determine
        cardCount++;
        cardRevenue += amount;
        cardFees += rowFee;
      }
    } else {
      // No payment method specified, assume card (most common)
      cardCount++;
      cardRevenue += amount;
      cardFees += rowFee;
    }
    
    // Parse date
    if (dateIdx >= 0 && cols[dateIdx]) {
      try {
        const dateStr = cols[dateIdx].replace(/["']/g, '');
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          dates.push(parsed);
        }
      } catch {
        // Ignore invalid dates
      }
    }
  }
  
  // Calculate date range
  let dateRange: { start: string | null; end: string | null } = { start: null, end: null };
  if (dates.length > 0) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    dateRange = {
      start: dates[0].toISOString().split('T')[0],
      end: dates[dates.length - 1].toISOString().split('T')[0]
    };
  }
  
  // Determine if CSV has actual fee data (at least 10% of transactions have fees)
  const hasActualFees = feesFound > 0 && (feesFound / totalTransactions) > 0.1;
  
  return {
    totalRevenue,
    totalTransactions,
    cardCount,
    cashCount,
    deliveryCount,
    amexCount,
    totalFees,
    detectedSystem,
    dateRange,
    avgTransactionSize: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
    // Exact revenue figures
    deliveryRevenue,
    cardRevenue,
    cashRevenue,
    // Exact fees by type (from CSV)
    cardFees,
    deliveryFees,
    hasActualFees,
  };
}

/**
 * Calculate monthly projection from parsed data
 */
export function calculateMonthlyProjection(result: ParsedCSVResult): {
  monthlyRevenue: number;
  monthlyTransactions: number;
  cardPercentage: number;
  deliveryPercentage: number;
  daysInData: number;
} {
  let daysInData = 30; // Default assumption
  
  if (result.dateRange.start && result.dateRange.end) {
    const start = new Date(result.dateRange.start);
    const end = new Date(result.dateRange.end);
    daysInData = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }
  
  // Calculate monthly projections
  const dailyRevenue = result.totalRevenue / daysInData;
  const dailyTransactions = result.totalTransactions / daysInData;
  
  const monthlyRevenue = Math.round(dailyRevenue * 30);
  const monthlyTransactions = Math.round(dailyTransactions * 30);
  
  // Calculate percentages
  const totalPayments = result.cardCount + result.cashCount + result.deliveryCount;
  const cardPercentage = totalPayments > 0 ? Math.round((result.cardCount / totalPayments) * 100) : 75;
  const deliveryPercentage = totalPayments > 0 ? Math.round((result.deliveryCount / totalPayments) * 100) : 0;
  
  return {
    monthlyRevenue,
    monthlyTransactions,
    cardPercentage: Math.min(Math.max(cardPercentage, 0), 100),
    deliveryPercentage: Math.min(Math.max(deliveryPercentage, 0), 60),
    daysInData
  };
}

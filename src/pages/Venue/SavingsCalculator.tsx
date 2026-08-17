import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileSpreadsheet,
  HelpCircle,
  Info,
  LockKeyhole,
  Monitor,
  Plus,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useHideBodyScrollbar } from "@/hooks/useHideBodyScrollbar";
import { calculateMonthlyProjection, parseCSVData, type ParsedCSVResult } from "@/utils/csvParser";
import VenuePreSignupShell from "@/components/Venue/VenuePreSignupShell";
import "./savings-calculator.css";

const INDUSTRY_RATES = {
  cardPercentage: 2,
  cardFlatFee: 0.2,
  deliveryCommission: 30,
  posSubscription: 120,
  terminalRental: 40,
};

const ADDITIONAL_COST_OPTIONS = [
  { id: "payment_gateway", label: "Payment Gateway Fees", defaultAmount: 30, jvSaves: true },
  { id: "merchant_services", label: "Merchant Service Fees", defaultAmount: 100, jvSaves: true },
  { id: "terminal_rental", label: "Card Terminal Rental", defaultAmount: 40, jvSaves: true },
  { id: "pos_subscription", label: "POS System Subscription", defaultAmount: 120, jvSaves: true },
  { id: "accounting_software", label: "Accounting Software", defaultAmount: 50, jvSaves: false },
  { id: "inventory_management", label: "Inventory Management", defaultAmount: 80, jvSaves: true },
  { id: "table_management", label: "Table Management System", defaultAmount: 100, jvSaves: true },
  { id: "online_ordering", label: "Online Ordering Platform", defaultAmount: 150, jvSaves: true },
  { id: "loyalty_program", label: "Loyalty Program Software", defaultAmount: 60, jvSaves: true },
  { id: "marketing_tools", label: "Marketing/Email Tools", defaultAmount: 50, jvSaves: false },
  { id: "staff_scheduling", label: "Staff Scheduling App", defaultAmount: 40, jvSaves: true },
  { id: "kitchen_display", label: "Kitchen Display System", defaultAmount: 80, jvSaves: true },
  { id: "reservation_system", label: "Reservation System", defaultAmount: 120, jvSaves: true },
  { id: "website_hosting", label: "Website/Domain Hosting", defaultAmount: 30, jvSaves: false },
  { id: "wifi_service", label: "Customer WiFi Service", defaultAmount: 50, jvSaves: false },
];

const FAQS = [
  {
    id: "calculation",
    question: "How is this estimate calculated?",
    answer: "We combine your payment mix, current processing assumptions, optional service costs, and imported transaction data when it is available.",
  },
  {
    id: "csv",
    question: "What does CSV import use?",
    answer: "The import scans a monthly export for transaction, amount, payment method, delivery, and fee data. Actual fees take priority over industry assumptions.",
  },
  {
    id: "pricing",
    question: "Is this a final quote?",
    answer: "No. This is a private planning estimate. Final pricing depends on your venue setup, payment mix, and service agreement.",
  },
  {
    id: "payouts",
    question: "How fast are payouts?",
    answer: "Funds are available in your JointVibe wallet immediately after payment. Bank withdrawals typically arrive in one to three business days.",
  },
  {
    id: "fees",
    question: "Who pays transaction fees?",
    answer: "JointVibe venues do not pay card processing or delivery commission fees. The customer pays the transaction fee when they use their wallet.",
  },
];

type CostFrequency = "weekly" | "monthly" | "annually";
type InputMode = "csv" | "manual" | null;

interface AdditionalCost {
  id: string;
  label: string;
  amount: number;
  frequency: CostFrequency;
  jvSaves: boolean;
}

const toMonthlyAmount = (amount: number, frequency: CostFrequency) => {
  if (frequency === "weekly") return amount * 4.33;
  if (frequency === "annually") return amount / 12;
  return amount;
};

export default function SavingsCalculator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useHideBodyScrollbar();
  const isReferencePresentation = searchParams.get("presentation") === "reference";

  const [inputMode, setInputMode] = useState<InputMode>(null);
  const [showResults, setShowResults] = useState(false);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const [parsedData, setParsedData] = useState<ParsedCSVResult | null>(null);
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCost[]>([]);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState(50000);
  const [monthlyTransactions, setMonthlyTransactions] = useState(2000);
  const [cardPercentage, setCardPercentage] = useState(75);
  const [deliveryPercentage, setDeliveryPercentage] = useState(20);
  const [hasTerminal, setHasTerminal] = useState(true);
  const [hasPOS, setHasPOS] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projection = useMemo(
    () => (inputMode === "csv" && parsedData ? calculateMonthlyProjection(parsedData) : null),
    [inputMode, parsedData],
  );

  const effectiveMonthlyRevenue = projection?.monthlyRevenue ?? monthlyRevenue;
  const effectiveMonthlyTransactions = projection?.monthlyTransactions ?? monthlyTransactions;
  const effectiveCardPercentage = projection?.cardPercentage ?? cardPercentage;
  const effectiveDeliveryPercentage = projection?.deliveryPercentage ?? deliveryPercentage;
  const effectiveDeliveryRevenue = useMemo(() => {
    if (inputMode === "csv" && parsedData && projection) {
      return Math.round((parsedData.deliveryRevenue / projection.daysInData) * 30);
    }
    return effectiveMonthlyRevenue * (effectiveDeliveryPercentage / 100);
  }, [effectiveDeliveryPercentage, effectiveMonthlyRevenue, inputMode, parsedData, projection]);

  const calculations = useMemo(() => {
    const cardRevenue = effectiveMonthlyRevenue * (effectiveCardPercentage / 100);
    const cardTransactions = Math.round(effectiveMonthlyTransactions * (effectiveCardPercentage / 100));
    let cardFees: number;
    let cardPercentageFee: number;
    let cardFlatFee: number;
    let deliveryFees: number;
    let usingActualFees = false;

    if (inputMode === "csv" && parsedData?.hasActualFees && projection) {
      cardFees = Math.round((parsedData.cardFees / projection.daysInData) * 30);
      cardPercentageFee = cardFees;
      cardFlatFee = 0;
      deliveryFees = Math.round((parsedData.deliveryFees / projection.daysInData) * 30);
      usingActualFees = true;
    } else {
      cardPercentageFee = cardRevenue * (INDUSTRY_RATES.cardPercentage / 100);
      cardFlatFee = cardTransactions * INDUSTRY_RATES.cardFlatFee;
      cardFees = cardPercentageFee + cardFlatFee;
      deliveryFees = effectiveDeliveryRevenue * (INDUSTRY_RATES.deliveryCommission / 100);
    }

    const terminalFees = inputMode === "manual" && hasTerminal ? INDUSTRY_RATES.terminalRental : 0;
    const posFees = inputMode === "manual" && hasPOS ? INDUSTRY_RATES.posSubscription : 0;
    const additionalCurrentCosts = additionalCosts.reduce(
      (total, cost) => total + toMonthlyAmount(cost.amount, cost.frequency),
      0,
    );
    const additionalJVCosts = additionalCosts.reduce(
      (total, cost) => total + (cost.jvSaves ? 0 : toMonthlyAmount(cost.amount, cost.frequency)),
      0,
    );
    const currentTotalMonthly = cardFees + deliveryFees + terminalFees + posFees + additionalCurrentCosts;
    const jvTotalMonthly = additionalJVCosts;
    const monthlySavings = currentTotalMonthly - jvTotalMonthly;

    return {
      cardTransactions,
      usingActualFees,
      current: {
        cardFees,
        cardPercentageFee,
        cardFlatFee,
        deliveryFees,
        terminalFees,
        posFees,
        totalMonthly: currentTotalMonthly,
        effectiveRate: effectiveMonthlyRevenue > 0 ? (currentTotalMonthly / effectiveMonthlyRevenue) * 100 : 0,
      },
      jv: {
        totalMonthly: jvTotalMonthly,
        effectiveRate: effectiveMonthlyRevenue > 0 ? (jvTotalMonthly / effectiveMonthlyRevenue) * 100 : 0,
      },
      savings: {
        monthly: monthlySavings,
        annual: monthlySavings * 12,
        percentage: currentTotalMonthly > 0 ? (monthlySavings / currentTotalMonthly) * 100 : 0,
      },
    };
  }, [
    additionalCosts,
    effectiveCardPercentage,
    effectiveDeliveryRevenue,
    effectiveMonthlyRevenue,
    effectiveMonthlyTransactions,
    hasPOS,
    hasTerminal,
    inputMode,
    parsedData,
    projection,
  ]);

  const formatCurrency = (amount: number) => new Intl.NumberFormat(isReferencePresentation ? "en-IN" : "en-AU", {
    style: "currency",
    currency: isReferencePresentation ? "INR" : "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  const formatInputCurrency = (amount: number) => isReferencePresentation
    ? `Rs. ${amount.toLocaleString("en-IN")}`
    : formatCurrency(amount);

  const handleCalculate = () => {
    if (!inputMode) {
      toast.error("Please upload a CSV or enter your numbers manually first");
      return;
    }

    setShowResults(true);
    window.setTimeout(() => {
      document.getElementById("results-section")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const clearCSV = () => {
    setCsvUploaded(false);
    setCsvFileName("");
    setParsedData(null);
    setInputMode(null);
    setAdditionalCosts([]);
    setShowResults(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const switchToManual = () => {
    setInputMode("manual");
    setShowResults(false);
  };

  const handleCSVUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const result = parseCSVData(loadEvent.target?.result as string);
        if (result.totalTransactions === 0 || result.totalRevenue === 0) {
          toast.error("Could not parse revenue data from CSV. Please check the format.");
          return;
        }

        const detectedName = result.detectedSystem ? ` (${result.detectedSystem} format)` : "";
        const importedProjection = calculateMonthlyProjection(result);
        const dateRange = result.dateRange.start && result.dateRange.end
          ? ` from ${importedProjection.daysInData} days of data`
          : "";
        toast.success(`Imported ${result.totalTransactions.toLocaleString()} transactions${detectedName}${dateRange}`, {
          description: `Revenue: ${formatCurrency(result.totalRevenue)} | Card: ${result.cardCount.toLocaleString()} | Delivery: ${result.deliveryCount.toLocaleString()}`,
        });

        if (isReferencePresentation) {
          setMonthlyRevenue(Math.min(Math.max(importedProjection.monthlyRevenue, 10000), 500000));
          setMonthlyTransactions(Math.min(Math.max(importedProjection.monthlyTransactions, 100), 20000));
          setCardPercentage(importedProjection.cardPercentage);
          setDeliveryPercentage(importedProjection.deliveryPercentage);
          setInputMode("manual");
          setShowResults(false);
          return;
        }

        setParsedData(result);
        setCsvUploaded(true);
        setInputMode("csv");
        setShowResults(false);

        const defaultCostIds = result.cardCount > 0
          ? ["payment_gateway", "merchant_services", "terminal_rental"]
          : [];
        setAdditionalCosts(
          defaultCostIds.flatMap((id) => {
            const option = ADDITIONAL_COST_OPTIONS.find((candidate) => candidate.id === id);
            return option ? [{ ...option, amount: option.defaultAmount, frequency: "monthly" as CostFrequency }] : [];
          }),
        );
      } catch (error) {
        console.error("CSV parsing error:", error);
        toast.error(error instanceof Error ? error.message : "Error parsing CSV file. Please check the format.");
      }
    };
    reader.readAsText(file);
  };

  const addAdditionalCost = (costId: string) => {
    const option = ADDITIONAL_COST_OPTIONS.find((candidate) => candidate.id === costId);
    if (!option) return;
    if (additionalCosts.some((cost) => cost.id === costId)) {
      toast.error("This cost category has already been added");
      return;
    }
    setAdditionalCosts((costs) => [
      ...costs,
      { ...option, amount: option.defaultAmount, frequency: "monthly" },
    ]);
  };

  const updateAdditionalCostAmount = (id: string, amount: number) => {
    setAdditionalCosts((costs) => costs.map((cost) => (
      cost.id === id ? { ...cost, amount } : cost
    )));
  };

  const updateAdditionalCostFrequency = (id: string, frequency: CostFrequency) => {
    setAdditionalCosts((costs) => costs.map((cost) => (
      cost.id === id ? { ...cost, frequency } : cost
    )));
  };

  const removeAdditionalCost = (id: string) => {
    setAdditionalCosts((costs) => costs.filter((cost) => cost.id !== id));
  };

  const availableCostOptions = ADDITIONAL_COST_OPTIONS.filter(
    (option) => !additionalCosts.some((cost) => cost.id === option.id),
  );

  return (
    <VenuePreSignupShell>
      <div className="venue-savings-calculator">
        <div className="venue-savings-calculator__main">
          <section className="venue-savings-intro" aria-labelledby="savings-title">
            <p className="venue-savings-kicker"><Calculator aria-hidden="true" /> Venue planning tool</p>
            <h1 id="savings-title">See how much you could save</h1>
            <p>Use your venue&apos;s payment data to create a private, illustrative savings estimate.</p>
            <ul aria-label="Calculator benefits">
              <li><LockKeyhole aria-hidden="true" /> Private by default</li>
              <li><Zap aria-hidden="true" /> Instant estimate</li>
              <li><ShieldCheck aria-hidden="true" /> No data retained</li>
            </ul>
          </section>

          <input
            ref={fileInputRef}
            className="venue-savings-file-picker"
            type="file"
            accept=".csv,text/csv"
            onChange={handleCSVUpload}
          />

          {!inputMode && (
            <section className="venue-savings-choice" aria-labelledby="choice-title">
              <div className="venue-savings-section-heading">
                <span><Building2 aria-hidden="true" /></span>
                <div>
                  <h2 id="choice-title">Your business numbers</h2>
                  <p>Choose how you want to start.</p>
                </div>
              </div>
              <div className="venue-savings-choice__grid">
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  <Upload aria-hidden="true" />
                  <strong>Upload CSV data</strong>
                  <span>Import a monthly payment export from your POS or payment provider.</span>
                </button>
                <button type="button" onClick={switchToManual}>
                  <Calculator aria-hidden="true" />
                  <strong>Enter manually</strong>
                  <span>Use sliders to input your venue&apos;s monthly payment numbers.</span>
                </button>
              </div>
              <p className="venue-savings-help"><Info aria-hidden="true" /> CSV import supports common amount columns from monthly payment exports.</p>
            </section>
          )}

          {inputMode === "csv" && parsedData && (
            <section className="venue-savings-upload" aria-labelledby="upload-title">
              <div className="venue-savings-entry-header">
                <div className="venue-savings-section-heading">
                  <span><FileSpreadsheet aria-hidden="true" /></span>
                  <div>
                    <p className="venue-savings-kicker">Imported payment data</p>
                    <h2 id="upload-title">Your business numbers</h2>
                  </div>
                </div>
                <button className="venue-savings-restart" type="button" onClick={clearCSV}>
                  <X aria-hidden="true" /> Start over
                </button>
              </div>

              <div className="venue-savings-import-status" aria-live="polite">
                <CheckCircle2 aria-hidden="true" />
                <div>
                  <strong>{csvUploaded ? "Data imported successfully" : "Imported data"}</strong>
                  <span>{csvFileName}</span>
                </div>
                {parsedData.detectedSystem && <em>{parsedData.detectedSystem}</em>}
              </div>

              <div className="venue-savings-data-grid">
                <div><span>Total transactions</span><strong>{parsedData.totalTransactions.toLocaleString()}</strong></div>
                <div><span>Total revenue</span><strong>{formatCurrency(parsedData.totalRevenue)}</strong></div>
                <div><span>Card transactions</span><strong>{parsedData.cardCount.toLocaleString()}</strong></div>
                <div><span>Delivery orders</span><strong>{parsedData.deliveryCount.toLocaleString()}</strong></div>
              </div>

              {parsedData.dateRange.start && parsedData.dateRange.end && (
                <p className="venue-savings-date"><Calendar aria-hidden="true" /> Data from {parsedData.dateRange.start} to {parsedData.dateRange.end}</p>
              )}

              <div className="venue-savings-projection">
                <p>Projected monthly average</p>
                <div>
                  <span>Revenue <strong>{formatCurrency(effectiveMonthlyRevenue)}</strong></span>
                  <span>Transactions <strong>{effectiveMonthlyTransactions.toLocaleString()}</strong></span>
                </div>
              </div>

              <section className="venue-savings-additional-costs" aria-labelledby="additional-costs-title">
                <div>
                  <h3 id="additional-costs-title"><Plus aria-hidden="true" /> Other business costs</h3>
                  <p>Add software or services that JointVibe might replace to see total savings.</p>
                </div>
                {additionalCosts.length > 0 && (
                  <div className="venue-savings-cost-list">
                    {additionalCosts.map((cost) => (
                      <div key={cost.id} className="venue-savings-cost-row">
                        <div>
                          <strong>{cost.label}</strong>
                          <span>{cost.jvSaves ? "Included in JointVibe" : "Not replaced by JointVibe"}</span>
                        </div>
                        <label>
                          <span className="sr-only">Amount for {cost.label}</span>
                          <input
                            type="number"
                            min="0"
                            value={cost.amount}
                            onChange={(event) => updateAdditionalCostAmount(cost.id, Number(event.target.value))}
                          />
                        </label>
                        <label>
                          <span className="sr-only">Frequency for {cost.label}</span>
                          <select
                            value={cost.frequency}
                            onChange={(event) => updateAdditionalCostFrequency(cost.id, event.target.value as CostFrequency)}
                          >
                            <option value="weekly">Per week</option>
                            <option value="monthly">Per month</option>
                            <option value="annually">Per year</option>
                          </select>
                        </label>
                        <button type="button" aria-label={`Remove ${cost.label}`} onClick={() => removeAdditionalCost(cost.id)}>
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {availableCostOptions.length > 0 && (
                  <label className="venue-savings-add-cost">
                    <span className="sr-only">Add a cost category</span>
                    <select
                      value=""
                      onChange={(event) => {
                        if (event.target.value) addAdditionalCost(event.target.value);
                      }}
                    >
                      <option value="" disabled>Add a cost category</option>
                      {availableCostOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}{option.jvSaves ? " (JointVibe saves)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </section>

              {!isReferencePresentation && (
                <button className="venue-savings-calculate" type="button" onClick={handleCalculate}>
                  Calculate my savings <ArrowRight aria-hidden="true" />
                </button>
              )}
            </section>
          )}

          {inputMode === "manual" && (
            <div className="venue-savings-manual-layout">
              <section className="venue-savings-entry" aria-labelledby="manual-title">
                <div className="venue-savings-entry-header">
                  <div className="venue-savings-section-heading">
                    <span><Calculator aria-hidden="true" /></span>
                    <div>
                      <p className="venue-savings-kicker">Manual entry mode</p>
                      <h2 id="manual-title">Your business numbers</h2>
                    </div>
                  </div>
                  <button
                    className="venue-savings-restart"
                    type="button"
                    onClick={() => {
                      setInputMode(null);
                      setShowResults(false);
                    }}
                  >
                    <X aria-hidden="true" /> Start over
                  </button>
                </div>

                <div className="venue-savings-manual-fields">
                  <div className="venue-savings-field venue-savings-field--wide">
                    <div><label htmlFor="monthly-revenue">Monthly revenue</label><output>{formatInputCurrency(monthlyRevenue)}</output></div>
                    <input id="monthly-revenue" type="range" min="10000" max="500000" step="5000" value={monthlyRevenue} onChange={(event) => setMonthlyRevenue(Number(event.target.value))} />
                    <span><small>{formatInputCurrency(10000)}</small><small>{formatInputCurrency(500000)}</small></span>
                  </div>
                  <div className="venue-savings-field venue-savings-field--wide">
                    <div><label htmlFor="monthly-transactions">Monthly transactions</label><output>{monthlyTransactions.toLocaleString()}</output></div>
                    <input id="monthly-transactions" type="range" min="100" max="20000" step="100" value={monthlyTransactions} onChange={(event) => setMonthlyTransactions(Number(event.target.value))} />
                    <span><small>100</small><small>20,000</small></span>
                  </div>
                  <div className="venue-savings-field">
                    <div><label htmlFor="card-payments"><CreditCard aria-hidden="true" /> Card payments</label><output>{cardPercentage}%</output></div>
                    <input id="card-payments" type="range" min="0" max="100" step="1" value={cardPercentage} onChange={(event) => setCardPercentage(Number(event.target.value))} />
                  </div>
                  <div className="venue-savings-field">
                    <div><label htmlFor="delivery-orders"><Truck aria-hidden="true" /> Delivery orders</label><output>{deliveryPercentage}%</output></div>
                    <input id="delivery-orders" type="range" min="0" max="60" step="1" value={deliveryPercentage} onChange={(event) => setDeliveryPercentage(Number(event.target.value))} />
                  </div>
                </div>

                <div className="venue-savings-service-toggles">
                  <label htmlFor="pos-subscription">
                    <span><Monitor aria-hidden="true" /> POS system subscription</span>
                    <input id="pos-subscription" type="checkbox" checked={hasPOS} onChange={(event) => setHasPOS(event.target.checked)} />
                    <b aria-hidden="true" />
                  </label>
                  <label htmlFor="terminal-rental">
                    <span><CreditCard aria-hidden="true" /> Card terminal rental</span>
                    <input id="terminal-rental" type="checkbox" checked={hasTerminal} onChange={(event) => setHasTerminal(event.target.checked)} />
                    <b aria-hidden="true" />
                  </label>
                </div>

                {!isReferencePresentation && (
                  <button className="venue-savings-calculate" type="button" onClick={handleCalculate}>
                    Calculate my savings <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </section>

              <aside className="venue-savings-result-panel" aria-labelledby="estimate-title">
                <div>
                  <p className="venue-savings-kicker">Illustrative estimate</p>
                  <h2 id="estimate-title">Potential savings</h2>
                </div>
                <div className="venue-savings-result-total"><strong>{formatCurrency(calculations.savings.annual)}</strong><span>per year</span></div>
                <dl>
                  <div><dt>Monthly saving</dt><dd>{formatCurrency(calculations.savings.monthly)}</dd></div>
                  <div><dt>Current monthly costs</dt><dd>{formatCurrency(calculations.current.totalMonthly)}</dd></div>
                  <div><dt>Card transactions</dt><dd>{calculations.cardTransactions.toLocaleString()} / month</dd></div>
                </dl>
                <p>Estimate only. Final pricing depends on your venue, payment mix, and service agreement.</p>
                <button type="button" onClick={() => navigate("/venue/signup")}>Discuss with JointVibe <ArrowRight aria-hidden="true" /></button>
              </aside>
            </div>
          )}

          {showResults && !isReferencePresentation && (
            <section className="venue-savings-results" id="results-section" aria-labelledby="results-title">
              <div className="venue-savings-results-total">
                <p className="venue-savings-kicker">Illustrative estimate</p>
                <h2 id="results-title">Your potential annual savings</h2>
                <strong>{formatCurrency(calculations.savings.annual)}</strong>
                <p>{formatCurrency(calculations.savings.monthly)} each month back in your pocket.</p>
                <span><TrendingDown aria-hidden="true" /> {calculations.savings.percentage.toFixed(0)}% less fees</span>
                {inputMode === "csv" && (
                  <em className={calculations.usingActualFees ? "is-actual" : "is-estimate"}>
                    {calculations.usingActualFees ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                    {calculations.usingActualFees ? "Calculated from your actual POS data" : "Estimated because the CSV had no fee data"}
                  </em>
                )}
              </div>

              <div className="venue-savings-comparison">
                <section className="venue-savings-cost-summary" aria-labelledby="current-costs-title">
                  <div><TrendingDown aria-hidden="true" /><h3 id="current-costs-title">Your current costs</h3></div>
                  <strong>{formatCurrency(calculations.current.totalMonthly)}<small>/ month</small></strong>
                  <p>Fees as a share of revenue: <b>{calculations.current.effectiveRate.toFixed(2)}%</b></p>
                  <dl>
                    {calculations.current.cardFees > 0 && <div><dt>{calculations.usingActualFees ? "Card processing from actual data" : `Card processing (${INDUSTRY_RATES.cardPercentage}% plus per transaction)`}</dt><dd>{formatCurrency(calculations.current.cardFees)}</dd></div>}
                    {!calculations.usingActualFees && calculations.current.cardFees > 0 && <div className="venue-savings-subline"><dt>Percentage and flat card fees</dt><dd>{formatCurrency(calculations.current.cardPercentageFee)} + {formatCurrency(calculations.current.cardFlatFee)}</dd></div>}
                    {calculations.current.deliveryFees > 0 && <div><dt>{calculations.usingActualFees ? "Delivery commission from actual data" : `Delivery commissions (${INDUSTRY_RATES.deliveryCommission}%)`}</dt><dd>{formatCurrency(calculations.current.deliveryFees)}</dd></div>}
                    {calculations.current.terminalFees > 0 && <div><dt>Terminal rental</dt><dd>{formatCurrency(calculations.current.terminalFees)}</dd></div>}
                    {calculations.current.posFees > 0 && <div><dt>POS subscription</dt><dd>{formatCurrency(calculations.current.posFees)}</dd></div>}
                    {additionalCosts.map((cost) => <div key={cost.id}><dt>{cost.label}</dt><dd>{formatCurrency(toMonthlyAmount(cost.amount, cost.frequency))}</dd></div>)}
                  </dl>
                </section>

                <section className="venue-savings-cost-summary venue-savings-cost-summary--jv" aria-labelledby="jv-costs-title">
                  <div><TrendingUp aria-hidden="true" /><h3 id="jv-costs-title">With JointVibe</h3></div>
                  <strong>{formatCurrency(calculations.jv.totalMonthly)}<small>/ month</small></strong>
                  <p>Fees as a share of revenue: <b>{calculations.jv.effectiveRate.toFixed(2)}%</b></p>
                  <dl>
                    <div><dt>Card processing</dt><dd>Included</dd></div>
                    {effectiveDeliveryPercentage > 0 && <div><dt>Delivery commission</dt><dd>Included</dd></div>}
                    <div><dt>POS and terminal</dt><dd>Included</dd></div>
                    {additionalCosts.filter((cost) => cost.jvSaves).map((cost) => <div key={cost.id}><dt>{cost.label}</dt><dd>Included</dd></div>)}
                    {additionalCosts.filter((cost) => !cost.jvSaves).map((cost) => <div key={cost.id}><dt>{cost.label}</dt><dd>{formatCurrency(toMonthlyAmount(cost.amount, cost.frequency))}</dd></div>)}
                  </dl>
                </section>
              </div>

              <section className="venue-savings-explainer" aria-labelledby="explainer-title">
                <div><HelpCircle aria-hidden="true" /><h3 id="explainer-title">How JointVibe reduces payment costs</h3></div>
                <ol>
                  <li><b>1</b><span><strong>Customer deposits</strong><small>Customers fund their JointVibe wallet and pay any top-up fees.</small></span></li>
                  <li><b>2</b><span><strong>Wallet payments</strong><small>Venue payments do not pass through card networks.</small></span></li>
                  <li><b>3</b><span><strong>Instant settlement</strong><small>Funds appear in the venue wallet as payments arrive.</small></span></li>
                  <li><b>4</b><span><strong>Bank withdrawal</strong><small>Withdraw to your bank when you are ready.</small></span></li>
                </ol>
              </section>

              <section className="venue-savings-results-cta">
                <h3>Ready to start saving?</h3>
                <p>Discuss a venue setup built around your payment mix and operations.</p>
                <div>
                  <button type="button" onClick={() => navigate("/venue/signup")}>Discuss with JointVibe <ArrowRight aria-hidden="true" /></button>
                  <button type="button" onClick={() => navigate("/auth?role=venue")}>Venue sign in</button>
                </div>
              </section>
            </section>
          )}

          <section className="venue-savings-faq" aria-labelledby="faq-title">
            <div><p className="venue-savings-kicker">FAQ</p><h2 id="faq-title">Common questions</h2></div>
            <div className="venue-savings-faq-list">
              {FAQS.map((faq) => {
                const isOpen = openFaq === faq.id;
                return (
                  <article key={faq.id}>
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpenFaq(isOpen ? null : faq.id)}>
                      <span>{faq.question}</span><ChevronDown aria-hidden="true" />
                    </button>
                    {isOpen && <p>{faq.answer}</p>}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </VenuePreSignupShell>
  );
}

import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  MapPin,
  Navigation,
  DollarSign,
  Zap,
  Clock,
  Store,
  Sparkles,
  Loader2,
  ShoppingBag,
  ShieldCheck,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  useRunnerJobs,
  RUNNER_TIER_FEES,
  RUNNER_OUT_OF_POCKET_CAP,
  RUNNER_BUFFER_PCT,
  RUNNER_MAX_TRIP_KM,
  RUNNER_PLATFORM_FEE_USD,
  calcHeldAmount,
  calcDistanceSurcharge,
  calcRunnerSpendableWallet,
  type RunnerPriceTier,
} from '@/hooks/useRunnerJobs';
import { useGeolocation } from '@/hooks/useGeolocation';
import {
  MapboxPlacesAutocomplete,
  type MapboxPlace,
} from '@/components/Customer/Runner/MapboxPlacesAutocomplete';
import { VenuePickupSearch, type JVVenue } from '@/components/Customer/Runner/VenuePickupSearch';
import { haversineKm, getJobTier, type DriverMode } from '@/utils/driverJobFilter';
import { getUserCoordsSync, getUserCountryCodeSync } from '@/lib/userCountry';
import { useJVCoinWallet } from '@/hooks/useJVCoinWallet';
import useCustomerDashboardPresentation from '@/hooks/useCustomerDashboardPresentation';
import { supabase } from '@/integrations/supabase/client';
import { useMobileNavVisibility } from '@/contexts/MobileNavVisibilityContext';
import './runner.css';

const schema = z.object({
  task_description: z.string().trim().min(3).max(250),
  pickup_address: z.string().trim().max(255).optional(),
  dropoff_address: z.string().trim().min(3).max(255),
  price_tier: z.enum(['quick', 'standard', 'priority']),
  est_item_cost_usd: z
    .number()
    .min(0)
    .max(RUNNER_OUT_OF_POCKET_CAP, { message: `Max $${RUNNER_OUT_OF_POCKET_CAP}` }),
  tip_usd: z.number().min(0).max(50),
});

// Display order: Standard (cheapest, default) → Quick → Priority (most expensive).
const TIER_ORDER: RunnerPriceTier[] = ['standard', 'quick', 'priority'];

const TIER_LABELS: Record<RunnerPriceTier, { label: string; sub: string; icon: LucideIcon }> = {
  standard: { label: 'Standard', sub: 'Best effort', icon: Clock },
  quick: { label: 'Quick', sub: 'Faster pickup', icon: Zap },
  priority: { label: 'Priority', sub: 'Top of queue', icon: Zap },
};

interface RunnerPriceSuggestion {
  estimated_usd?: unknown;
  confidence?: unknown;
}

interface RunnerPanelHeadingProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

const RunnerPanelHeading = ({ icon: Icon, title, description, action }: RunnerPanelHeadingProps) => (
  <div className="runner-panel__heading">
    <span className="runner-panel__icon"><Icon aria-hidden="true" /></span>
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    {action}
  </div>
);

const RunnerRequest = () => {
  const navigate = useNavigate();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  const { setMobileNavsVisible } = useMobileNavVisibility();
  const { createJob } = useRunnerJobs();
  const { latitude, longitude } = useGeolocation();

  useEffect(() => {
    setMobileNavsVisible(false);
    return () => setMobileNavsVisible(true);
  }, [setMobileNavsVisible]);
  // Prefer live browser geolocation; fall back to the user's saved profile
  // coordinates so proximity-biased POI search works even when the browser
  // hasn't granted geolocation (or when the iframe blocks it).
  const profileCoords = getUserCoordsSync();
  const customerLoc =
    latitude != null && longitude != null
      ? { lat: latitude, lng: longitude }
      : profileCoords;

  const { balance } = useJVCoinWallet();
  const walletUsd = calcRunnerSpendableWallet(balance);

  const [task, setTask] = useState('');
  const [useJVVenue, setUseJVVenue] = useState(false);
  // When ON, we let the runner pick the closest store themselves and skip
  // the customer-supplied pickup address entirely.
  const [letRunnerPick, setLetRunnerPick] = useState(false);

  // Pickup state
  const [pickup, setPickup] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupVenueId, setPickupVenueId] = useState<string | null>(null);

  // Dropoff state
  const [dropoff, setDropoff] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [tier, setTier] = useState<RunnerPriceTier>('standard');
  const [estCost, setEstCost] = useState<string>('');
  const [tip, setTip] = useState<string>('0');
  const [submitting, setSubmitting] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const estCostNum = Math.max(0, parseFloat(estCost) || 0);
  const tipNum = Math.max(0, parseFloat(tip) || 0);
  const fee = RUNNER_TIER_FEES[tier];

  // Trip distance (pickup → dropoff). Only meaningful when both ends are known.
  const tripKm =
    pickupCoords && dropoffCoords
      ? haversineKm(
          pickupCoords.lat,
          pickupCoords.lng,
          dropoffCoords.lat,
          dropoffCoords.lng,
        )
      : 0;
  const distanceSurcharge = calcDistanceSurcharge(tripKm);
  const tripTooFar = tripKm > RUNNER_MAX_TRIP_KM;

  const held = calcHeldAmount(estCostNum, tier, tipNum, distanceSurcharge, RUNNER_PLATFORM_FEE_USD);
  const buffer = Math.round(estCostNum * (RUNNER_BUFFER_PCT / 100) * 100) / 100;

  const insufficientFunds = held > walletUsd;
  const shortfall = Math.max(0, Math.round((held - walletUsd) * 100) / 100);

  const handleToggleJV = (next: boolean) => {
    setUseJVVenue(next);
    if (next) setLetRunnerPick(false);
    // Reset pickup when switching modes to avoid stale data
    setPickup('');
    setPickupCoords(null);
    setPickupVenueId(null);
  };

  const handleToggleLetRunnerPick = (next: boolean) => {
    setLetRunnerPick(next);
    if (next) setUseJVVenue(false);
    setPickup('');
    setPickupCoords(null);
    setPickupVenueId(null);
  };

  const handleAiSuggest = async () => {
    if (!task || task.trim().length < 3) {
      toast.error('Type what you need first');
      return;
    }
    setAiSuggesting(true);
    setAiNote(null);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-runner-price', {
        body: {
          task_description: task,
          country_code: getUserCountryCodeSync() ?? undefined,
        },
      });
      if (error) throw error;
      const suggestion = data && typeof data === 'object' ? data as RunnerPriceSuggestion : null;
      const est = Number(suggestion?.estimated_usd);
      if (!Number.isFinite(est) || est <= 0) {
        toast.error('Could not estimate — enter manually');
        return;
      }
      const capped = Math.min(est, RUNNER_OUT_OF_POCKET_CAP);
      setEstCost(capped.toFixed(2));
      const conf = typeof suggestion?.confidence === 'string' ? suggestion.confidence : 'low';
      setAiNote(
        `AI estimate: $${capped.toFixed(2)} (${conf} confidence). Adjust if you know better.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI suggestion failed');
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleVenueSelect = (v: JVVenue) => {
    setPickupVenueId(v.id);
    setPickup(v.name);
    if (v.latitude != null && v.longitude != null) {
      setPickupCoords({ lat: v.latitude, lng: v.longitude });
    }
  };

  const handlePickupPOI = (p: MapboxPlace) => {
    setPickupVenueId(null);
    setPickupCoords({ lat: p.latitude, lng: p.longitude });
  };

  const handleDropoffPOI = (p: MapboxPlace) => {
    setDropoffCoords({ lat: p.latitude, lng: p.longitude });
  };

  const handleSubmit = async () => {
    // When the user opts to let the runner pick, force-blank the pickup
    // fields so we don't accidentally send a stale typed string.
    const effectivePickup = letRunnerPick ? '' : pickup;
    const effectivePickupCoords = letRunnerPick ? null : pickupCoords;
    const effectivePickupVenueId = letRunnerPick ? null : pickupVenueId;

    const parsed = schema.safeParse({
      task_description: task,
      pickup_address: effectivePickup || undefined,
      dropoff_address: dropoff,
      price_tier: tier,
      est_item_cost_usd: estCostNum,
      tip_usd: tipNum,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? 'Invalid input');
      return;
    }
    if (tripTooFar) {
      toast.error(
        `Trip is ${tripKm.toFixed(1)} km — too far for a Runner. Use Delivery instead.`,
      );
      return;
    }
    if (insufficientFunds) {
      toast.error(
        `You need $${shortfall.toFixed(2)} more in your wallet. Top up to continue.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await createJob({
        task_description: parsed.data.task_description,
        pickup_address: parsed.data.pickup_address,
        dropoff_address: parsed.data.dropoff_address,
        price_tier: parsed.data.price_tier,
        est_item_cost_usd: parsed.data.est_item_cost_usd,
        tip_usd: parsed.data.tip_usd,
        distance_surcharge_usd: distanceSurcharge,
        platform_fee_usd: RUNNER_PLATFORM_FEE_USD,
        pickup_latitude: effectivePickupCoords?.lat ?? undefined,
        pickup_longitude: effectivePickupCoords?.lng ?? undefined,
        pickup_venue_id: effectivePickupVenueId ?? undefined,
        dropoff_latitude: dropoffCoords?.lat ?? latitude ?? undefined,
        dropoff_longitude: dropoffCoords?.lng ?? longitude ?? undefined,
      });
      toast.success('Runner job posted');
      navigate(`/app/runner/jobs/${res.job_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create runner job');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={`runner-page runner-request-page${isDashboardPresentation ? ' runner-request-page--dashboard-presentation' : ''}`}>
      <header className="runner-page__heading">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="runner-page__back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div>
          <p>On-demand help</p>
          <h1>Request a JV Runner</h1>
        </div>
      </header>

      <div className="runner-form">
        <Card className="runner-panel runner-panel--request">
          <RunnerPanelHeading
            icon={ShoppingBag}
            title="What do you need?"
            description="Tell your runner exactly what to pick up."
          />
          <label className="runner-textarea" htmlFor="task">
            <span className="sr-only">Items to collect</span>
            <Textarea
              id="task"
              placeholder="e.g. Coke, pie, cookies from the local store"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
              maxLength={250}
            />
            <span className="runner-textarea__count"><b>{task.length}</b>/250</span>
          </label>
        </Card>

        <Card className="runner-panel runner-panel--locations">
          {/* JV Venue toggle */}
          <div className="runner-options">
          <label className="runner-option">
            <span className="runner-option__icon"><Store aria-hidden="true" /></span>
            <div>
              <div>
                <strong>Order from JV Venue</strong>
                <small>
                  Search partner venues nearby
                </small>
              </div>
            </div>
            <Switch checked={useJVVenue} onCheckedChange={handleToggleJV} />
          </label>

          {/* Let-runner-pick toggle */}
          <label className="runner-option">
            <span className="runner-option__icon"><Sparkles aria-hidden="true" /></span>
            <div>
              <div>
                <strong>Let the runner pick the closest place</strong>
                <small>
                  Don't know the area? The runner will choose the nearest store.
                </small>
              </div>
            </div>
            <Switch
              checked={letRunnerPick}
              onCheckedChange={handleToggleLetRunnerPick}
            />
          </label>
          </div>

          {/* Drop-off FIRST — anchors pickup proximity search to where the order is going. */}
          <div className="runner-locations">
            <div className="runner-field">
              <span><MapPin aria-hidden="true" />Drop-off</span>
              <small>Where should the order be delivered? Add this first to find nearby pickup options.</small>
              <div className="runner-autocomplete">
                <MapPin className="runner-autocomplete__icon" aria-hidden="true" />
                <MapboxPlacesAutocomplete
                  mode="address"
                  value={dropoff}
                  onChange={(v) => {
                    setDropoff(v);
                    setDropoffCoords(null);
                  }}
                  onSelect={handleDropoffPOI}
                  placeholder="Enter drop-off address"
                  proximity={customerLoc}
                  customerLocation={customerLoc}
                />
              </div>
            </div>

          {!letRunnerPick && (
            <div className="runner-field">
              <span><Navigation aria-hidden="true" />Pickup</span>
              {!dropoffCoords && (
                <p className="-mt-1 text-xs text-muted-foreground">
                  Tip: pick the drop-off first — pickup results will be the closest places to it.
                </p>
              )}

              <div className="runner-autocomplete">
                <Store className="runner-autocomplete__icon" aria-hidden="true" />
                {useJVVenue ? (
                <VenuePickupSearch
                  value={pickup}
                  onChange={(v) => {
                    setPickup(v);
                    setPickupVenueId(null);
                  }}
                  onSelect={handleVenueSelect}
                  customerLocation={dropoffCoords ?? customerLoc}
                />
              ) : (
                <MapboxPlacesAutocomplete
                  mode="poi"
                  value={pickup}
                  onChange={(v) => {
                    setPickup(v);
                    setPickupCoords(null);
                  }}
                  onSelect={handlePickupPOI}
                  placeholder={
                    dropoffCoords
                      ? 'Store, supermarket, petrol station near drop-off…'
                      : 'Enter drop-off above first for closest results'
                  }
                  proximity={dropoffCoords ?? customerLoc}
                  customerLocation={dropoffCoords ?? customerLoc}
                  localityBias={dropoff}
                />
              )}
              </div>
            </div>
          )}
          </div>

          {pickupCoords && dropoffCoords && (() => {
            const jobTier: DriverMode = getJobTier(tripKm);
            const tierLabel = jobTier === 'runner' ? 'Runner' : jobTier === 'bicycle' ? 'Bike' : jobTier === 'motorcycle' ? 'Moto' : 'Car';
            const escalationHint =
              jobTier === 'runner'
                ? null
                : jobTier === 'bicycle'
                  ? 'Auto-escalates to Moto in 2 min, Car in 3 min if no driver accepts.'
                  : jobTier === 'motorcycle'
                    ? 'Auto-escalates to Car in 1 min if no driver accepts.'
                    : 'Open to all available drivers.';
            return (
              <div className="space-y-1">
                <div
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-xs ${
                    tripTooFar ? 'bg-destructive/10 text-destructive' : 'bg-muted/40'
                  }`}
                >
                  <span className={tripTooFar ? '' : 'text-muted-foreground'}>
                    Trip distance{tripTooFar ? ' — too far for a Runner' : ''}
                  </span>
                  <span className="flex items-center gap-2 font-medium">
                    {tripKm < 1 ? `${Math.round(tripKm * 1000)} m` : `${tripKm.toFixed(1)} km`}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                        tripTooFar
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-primary/15 text-primary'
                      }`}
                    >
                      {tierLabel}
                    </span>
                  </span>
                </div>
                {!tripTooFar && escalationHint && (
                  <div className="px-3 text-[11px] text-muted-foreground">{escalationHint}</div>
                )}
              </div>
            );
          })()}
          {letRunnerPick && dropoff && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Runner will choose the closest matching place near the drop-off. Distance fee is confirmed after pickup is selected.
            </div>
          )}
        </Card>

        <Card className="runner-panel runner-panel--tiers">
          <RunnerPanelHeading
            icon={Timer}
            title="Runner fee tier"
            description="Choose the pace that suits your request."
          />
          <RadioGroup className="runner-tier-list" value={tier} onValueChange={(v) => setTier(v as RunnerPriceTier)}>
            {TIER_ORDER.map((t) => {
              const cfg = TIER_LABELS[t];
              const Icon = cfg.icon;
              const displayedFee = RUNNER_TIER_FEES[t] + distanceSurcharge;
              return (
                <label
                  key={t}
                  className={`runner-tier${tier === t ? ' runner-tier--selected' : ''}`}
                >
                  <div className="runner-tier__main">
                    <RadioGroupItem className="runner-tier__radio" value={t} id={`tier-${t}`} />
                    <Icon className="runner-tier__icon" aria-hidden="true" />
                    <div>
                      <strong>{cfg.label}</strong>
                      <small>{cfg.sub}</small>
                    </div>
                  </div>
                  <div className="runner-tier__price">
                    ${displayedFee.toFixed(2)}
                    {distanceSurcharge > 0 && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        incl. ${distanceSurcharge.toFixed(2)} distance
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </RadioGroup>
        </Card>

        <Card className="runner-panel runner-panel--costs">
          <RunnerPanelHeading
            icon={CircleDollarSign}
            title="Estimated item cost"
            description={`Set how much your runner can spend on items, up to $${RUNNER_OUT_OF_POCKET_CAP}.`}
            action={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="runner-ai-button"
                onClick={handleAiSuggest}
                disabled={aiSuggesting || !task || task.trim().length < 3}
              >
                {aiSuggesting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                <span>Suggest with AI</span>
              </Button>
            }
          />
          <div className="runner-cost-grid">
            <label className="runner-field" htmlFor="est">
              <span>Estimated item cost</span>
              <div className="runner-currency-input">
                <DollarSign aria-hidden="true" />
                <Input
                  id="est"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max={RUNNER_OUT_OF_POCKET_CAP}
                  value={estCost}
                  onChange={(e) => {
                    setEstCost(e.target.value);
                    if (aiNote) setAiNote(null);
                  }}
                />
              </div>
            </label>
            <label className="runner-field" htmlFor="tip">
              <span>Tip <em>Optional</em></span>
              <div className="runner-currency-input">
                <DollarSign aria-hidden="true" />
                <Input
                  id="tip"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                />
              </div>
            </label>
          </div>
          {aiNote && <p className="runner-ai-note">{aiNote}</p>}
        </Card>

        <Card className="runner-panel runner-panel--summary">
          <RunnerPanelHeading
            icon={ShieldCheck}
            title="Held from your wallet"
            description="Only the final amount is charged. Unused buffer is refunded."
          />
          <div className="runner-breakdown">
          <Row label="Estimated items" value={`$${estCostNum.toFixed(2)}`} />
          <Row label="Runner fee" value={`$${fee.toFixed(2)}`} />
          {distanceSurcharge > 0 && (
            <Row
              label={`Distance surcharge (${tripKm.toFixed(1)} km trip)`}
              value={`$${distanceSurcharge.toFixed(2)}`}
            />
          )}
          <Row label="Tip" value={`$${tipNum.toFixed(2)}`} />
          <Row label={`Buffer (${RUNNER_BUFFER_PCT}%)`} value={`$${buffer.toFixed(2)}`} />
          <Row label="Joint Vibe fee" value={`$${RUNNER_PLATFORM_FEE_USD.toFixed(2)}`} />
          <div className="runner-breakdown__total">
            <span>Total held</span>
            <span>${held.toFixed(2)}</span>
          </div>
          </div>

          <div className="runner-wallet-balance">
            <span>
              <Wallet aria-hidden="true" /> Wallet balance
            </span>
            <span className={insufficientFunds ? 'font-semibold text-destructive' : 'font-medium'}>
              ${walletUsd.toFixed(2)}
            </span>
          </div>

          {insufficientFunds && estCostNum > 0 && (
            <div className="runner-wallet-warning">
              You need ${shortfall.toFixed(2)} more in your wallet to place this order.
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 pl-1 text-xs text-destructive underline"
                onClick={() => navigate('/app/wallet')}
              >
                Top up
              </Button>
            </div>
          )}

          <p className="runner-summary-copy">
            The runner can spend up to ${RUNNER_OUT_OF_POCKET_CAP} out-of-pocket. You'll approve the
            actual cart before purchase. Unused buffer is refunded.
          </p>
        </Card>

        <Button
          className="runner-confirm"
          size="lg"
          disabled={
            submitting ||
            !task ||
            !dropoff ||
            estCostNum <= 0 ||
            insufficientFunds ||
            tripTooFar
          }
          onClick={handleSubmit}
        >
          {submitting
            ? 'Posting…'
            : tripTooFar
              ? 'Trip too far — use Delivery'
              : insufficientFunds
                ? `Need $${shortfall.toFixed(2)} more`
                : <><span>Confirm &amp; hold</span><strong>${held.toFixed(2)}</strong><ArrowRight aria-hidden="true" /></>}
        </Button>
      </div>
    </main>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="runner-breakdown__row">
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

export default RunnerRequest;

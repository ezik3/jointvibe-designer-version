# Joint Vibe Tier Build Checklist (Source of Truth Tracker)

## How to Use
- Update this checklist as implementation progresses.
- Keep architecture and perks docs in sync with each completed change.
- Do not mark complete without code + tests + validation.

## A) Existing Logic Found in Codebase
- [x] `user_tiers` table exists (tier state fields including at-risk fields)
- [x] `tier_point_events` table exists with 90-day expiry model
- [x] Edge function exists: `supabase/functions/record-tier-event`
- [x] Client hook exists: `src/hooks/useUserTier.ts`
- [x] Referral tables exist: `referral_codes`, `referrals`, `referral_rewards`
- [x] Referral hooks exist: `useReferralCode`, `useUserReferrals`
- [x] Baseline feed scoring utility exists: `src/utils/feedScoring.ts`
- [x] Push credits purchase flow exists (`create-push-credits-checkout`, stripe webhook handling)

## B) Confirmed Architecture Decisions
- [x] Tier ladder fixed: Member > Bronze > Silver > Gold > Diamond > Platinum
- [x] Platinum target rarity ~1% or less
- [x] Promotion harder than maintenance
- [x] Rolling 90-day scoring system remains
- [x] Verified spend weighted above generic posting
- [x] Checked-in posting remains meaningful
- [x] Venue referrals are high-value actions but require activation qualification
- [x] Push products should be 2h/4h/6h/8h windows with short tier delays

## C) MVP Tasks
### C1) Scoring / Tier Core
- [x] Add configurable threshold table for promotion + maintenance
- [x] Add configurable action-weight table (to reduce hardcoded config drift)
- [ ] Implement maintenance thresholds separately from promotion thresholds
- [ ] Standardize at-risk logic for all tiers (not only top tiers)
- [ ] Implement one-tier-at-a-time downgrade policy
- [ ] Add tier warning notifications UX copy for all tiers

### C2) Spend Weighting
- [ ] Define verified spend point formula and caps
- [ ] Ensure only verified transactions contribute spend points
- [ ] Add spend anti-abuse heuristics (velocity/anomaly checks)

### C3) Referral Qualification
- [ ] Introduce provisional referral points state
- [ ] Finalize points only after venue activation criteria are met
- [ ] Add separate path for assisted/in-person attribution
- [ ] Add conflict resolution when multiple referral claims exist

### C4) Push Timing / Urgency
- [ ] Implement explicit 2h/4h/6h/8h push products model
- [ ] Implement short tier-delay release windows
- [ ] Add expiry-first UI messaging to preserve urgency

### C5) Basic Ranking Integration
- [ ] Map user tier to ranking multiplier config
- [ ] Ensure quality/relevance/recency dominate over tier alone
- [ ] Add guardrails for integrity suppression

## D) Phase 2 Tasks
- [ ] Build advanced integrity/risk scoring pipeline
- [ ] Add city-level dynamic threshold calibration tools
- [ ] Add push product intensity variants (optional boosts)
- [ ] Expand ranking with venue context weighting (checked-in/live/venue-tagged)
- [ ] Add more granular anti-ring detection for engagement/followers

## E) Phase 3 Tasks
- [ ] Creator economy eligibility and payout framework
- [ ] Advanced auction/premium discovery slots
- [ ] City competition systems integrated with user tier influence
- [ ] Cross-city influence carryover logic with controls

## T) Venue Energy / Momentum Scoring
### T1) Foundation (completed)
- [x] Create venue energy scoring pure computation utility: `src/utils/venueEnergyScoring.ts`
  - Pure TypeScript, no network calls
  - Inputs: checkedInCount, headingThereCount, maybeGoingCount, recentArrivalCount, insideProofEventCount
  - Outputs: normalized 0–100 score + state (quiet / building / busy / trending)
  - Privacy-safe: accepts only aggregate counts, never user identity data
  - Private check-ins count toward energy via the SECURITY DEFINER `get_venue_interest_signal_counts` RPC
- [x] Create venue energy data fetching hook: `src/hooks/useVenueEnergy.ts`
  - Uses existing `get_venue_interest_signal_counts` (SECURITY DEFINER — counts private check-ins correctly)
  - Separate arrival velocity query (count only, no identity data)
  - Fully isolated from moderation, bans, caution alerts, incident timeline, operational notifications
  - Returns { energy, loading, error, refresh }

### T2) Friend Momentum Signals Foundation (completed)
- [x] Create SQL migration: `get_venue_friend_momentum_counts` SECURITY DEFINER RPC
  - Resolves the viewer's following list server-side via `auth.uid()`
  - currently_at_count: PUBLIC check-ins only (private check-ins strictly excluded)
  - heading_there_count / maybe_going_count: aggregate intent counts (no identity)
  - Returns four BIGINT aggregate counts only — no user identity data in output
  - Isolated from moderation, bans, caution, energy scoring, and operational systems
- [x] Create friend momentum pure computation utility: `src/utils/venueFriendMomentum.ts`
  - `VenueFriendMomentumSignals` interface (aggregate counts, identity-free)
  - `calculateFriendMomentum()` — returns result with hasFriendActivity + label
  - `buildFriendMomentumLabel()` — user-facing summary string (priority: at > heading > maybe)
  - `emptyFriendMomentumSignals()` — zero baseline for graceful degradation
- [x] Create friend momentum data hook: `src/hooks/useVenueFriendMomentum.ts`
  - Calls `get_venue_friend_momentum_counts` RPC (viewer ID resolved server-side)
  - Privacy-safe: only public check-ins counted in currently_at signal
  - Degrades gracefully on error (returns zero-activity result, not null)
  - Returns { momentum, loading, error, refresh }

### T4) Live Venue Feed Foundation (completed)
- [x] Create venue feed service + hook: `src/hooks/useVenueFeed.ts`
  - `fetchVenueFeed(venueId, options?)` — plain async function, no React dependency
    - Queries `posts` table: `venue_id = venueId AND visibility = 'public'`
    - Defence-in-depth: explicit `visibility = 'public'` filter in addition to RLS
    - `ORDER BY created_at DESC`, configurable `limit` (default 20)
    - Cursor-based pagination via `beforeTimestamp` option
    - Attaches author `display_name` + `avatar_url` from `customer_profiles`
    - No check_ins, moderation, caution, incident, or operational tables touched
    - Author profile limited to display_name + avatar_url (no location, presence, tier)
  - `useVenueFeed(venueId, options?)` — React hook wrapper
    - Degrades gracefully on error (returns empty array, not broken UI)
    - Returns { posts, loading, error, refresh }
  - `VenueFeedPost` type — all safe-for-display fields, author sub-object
  - Fully isolated from energy scoring, friend momentum, and all operational systems
  - Safe to call from prefetch pipelines, server-side helpers, or non-React contexts

### T6) Venue Page Social Energy Integration (completed)
- [x] Wire `useVenueEnergy` into `ImmersiveVenue.tsx` — energy state badge in venue header
  - Displays quiet / building / busy / trending with colour-coded badge
  - Badge hidden during loading (graceful degradation — no broken UI)
  - Isolated: does not affect check-in flows, moderation, or operational systems
- [x] Wire `useVenueFriendMomentum` into `ImmersiveVenue.tsx` — friend summary in "Who's Here"
  - Shows aggregate label (e.g. "2 people you follow are here") below crowd count
  - Only shown when `hasFriendActivity` is true — no noise when no friends active
  - Private check-ins strictly excluded (enforced by SECURITY DEFINER RPC)
- [x] Wire `useVenueFeed` into `ImmersiveVenue.tsx` — "Live From This Venue" section
  - Public venue-linked posts only; defence-in-depth `visibility = 'public'` filter
  - Skeleton loading state (3 animated placeholders)
  - Graceful empty state when no posts exist
  - Author: display_name + avatar_url only — no location, presence, or tier data

### T8) Discovery / Venue Card Momentum Integration (completed)
- [x] Add energy state badge to `DiscoverNew.tsx` venue grid cards
  - Derived from `current_occupancy` via `calculateVenueEnergy` — zero extra queries
  - Shown only for "building", "busy", "trending" states; "quiet" hidden to reduce noise
  - Colour-coded: trending=orange, busy=amber, building=cyan
- [x] Add friend momentum indicator to `DiscoverNew.tsx` venue grid cards (first 12 venues)
  - New `useVenueFriendMomentumBatch` hook: `src/hooks/useVenueFriendMomentumBatch.ts`
    - Fetches friend momentum for up to 12 venues in parallel via existing RPC
    - Each call uses `get_venue_friend_momentum_counts` (SECURITY DEFINER — no identity data)
    - Capped at MAX_BATCH_SIZE=12 to limit concurrent RPC calls on discovery surfaces
    - Degrades gracefully: individual failures return zero-activity, not null
  - Shows "👀 N friends active" only when `hasFriendActivity` is true
  - Private check-ins excluded (enforced by SECURITY DEFINER RPC)
- [x] Add energy-state-coloured activity dot to `HotVenuesSection.tsx` venue mini-cards
  - Replaces static green dot with energy-state dot (orange=trending, amber=busy, cyan=building, green=quiet)
  - Derived from `current_occupancy` — no extra queries; consistent with card grid energy model

### T5) Future — Venue Page Social Energy Enhancements
- [ ] Build richer venue momentum visuals — animated crowd pulse / energy bar on venue header
- [ ] Add friend avatar previews for currently_at subset (requires separate `useVenueFriendPreviews` hook + public-profile-only RPC; intent identities must stay aggregate-only)
- [ ] Add venue page engagement experiments — A/B social proof copy variants (energy badge vs crowd count vs momentum label)
- [ ] Build richer trending venue cards with larger energy visual treatment (featured row)
- [ ] Build map heat indicators using venue energy scores (aggregate heat layer, no individual traces)
- [ ] Build social proof experiments — A/B test energy badge vs crowd count copy on discovery cards
- [ ] Build ranking/merchandising by energy — sort discovery results by energy score as optional mode
- [ ] Build momentum-driven discovery modules — "Heating Up" section using energy state as filter
- [ ] Extend `useVenueFriendMomentumBatch` to cover full filtered list (requires batch RPC on server side)

### T7) Future — Venue Feed Media and Interaction Enhancements
- [ ] Build richer venue activity ranking (blend recency + engagement + energy score)
  - Post-process result with `scoreFeedItems()` from `feedScoring.ts` for engagement weighting
- [ ] Blend venue feed with energy score (surface energy state alongside feed in venue page)
- [ ] Add media preview thumbnails and video poster frames to VenueFeedPost
- [ ] Build live venue notifications (notify followers when a venue they follow gets active)
- [ ] Extend feed union type to include live_streams rows tagged to the venue
- [ ] Add pagination UI support (infinite scroll using `beforeTimestamp` cursor)
- [ ] Add realtime subscription to venue feed (Supabase channel on posts INSERT WHERE venue_id = X AND visibility = public)
- [ ] Add venue feed to discovery pages and venue cards ("3 recent posts" preview)
- [ ] Build venue feed caching layer (short TTL, venue-scoped, similar to globalCache pattern)

### T3) Future — Energy and Friend Momentum Enhancements
- [ ] Add server-side SECURITY DEFINER RPC `get_venue_energy_signals` that aggregates all signals in one call (recent arrival count + inside-proof count) for consistency
- [ ] Wire insideProofEventCount in useVenueEnergy once server-side aggregate RPC exists
- [ ] Build trending venue discovery using venue energy score (rank venues by energy for discovery surfaces)
- [ ] Build momentum notification triggers when a venue crosses energy state thresholds (internal operational use only, not user-facing push)
- [ ] Build venue heatmap feature using energy scores across city (aggregate map view, no individual presence traces)
- [ ] Integrate presence confidence into energy scoring (weight high-confidence check-ins more heavily)
- [ ] Add energy score trend/history for venue operations dashboard (time-series delta over 15-min windows)
- [ ] Calibrate scoring weights once real traffic data is available (iterate on STATE_THRESHOLDS and SIGNAL_WEIGHTS)
- [ ] Build friend momentum notification triggers (e.g., "3 people you follow are heading to [Venue]")
- [ ] Build venue card social badges using friend momentum counts (currently_at + heading_there badges)
- [ ] Build identity-level safe friend previews for currently_at only (avatars of public followers at venue)
  - Must use a separate `useVenueFriendPreviews` hook with its own public-profile-only RPC
  - Intent-signal identities (heading/maybe) must remain aggregate-only in all surfaces
- [ ] Build cross-city friend discovery features (friends at venues in other cities, privacy-gated)
- [ ] Build momentum-weighted venue ranking in discovery (friend momentum boosts venue relevance score)

## F) Blocked Items / Decisions Needed
- [ ] Final numeric CS thresholds for each tier by market maturity
- [ ] Final maintenance multipliers per tier
- [ ] Final referral activation milestone definitions
- [ ] Whether Platinum requires manual moderation approval
- [ ] Final fairness policy for lower-tier push visibility

## G) Anti-Abuse Items
### User Abuse
- [ ] Fake check-in defenses (geo + dwell + device consistency)
- [ ] Action entropy checks for repetitive low-value posting
- [ ] Fake follower / engagement ring detection
- [ ] Risk-based score throttling and delayed reward settlement

### Venue Abuse
- [ ] Prevent excessive unpaid user promotion requirements
- [ ] Prevent bypass of paid push inventory through exploit patterns
- [ ] Venue abuse flags and enforcement policy

## H) Venue Referral Items
- [ ] Build referral-link attribution flow end-to-end audit trail
- [ ] Build assisted/in-person attribution flow with stronger validation
- [ ] Add milestone-based qualification state transitions
- [ ] Add reward issuance idempotency and clawback paths

## I) Push Timing Items
- [ ] Create push campaign schema for windowed products
- [ ] Add tier release schedule generation per campaign
- [ ] Add campaign expiration and stale suppression jobs
- [ ] Add analytics for conversion by release wave and tier

## J) Ranking Items
- [ ] Replace static ranking constants with config-backed model
- [ ] Include integrity modifier in final score
- [ ] Add calibration dashboards for ranking quality and fairness
- [ ] Add A/B support for ranking weight experiments

## K) Backend / Data Model Tasks
- [x] Add tier config table(s) for thresholds and weights
- [ ] Add migration for referral attribution mode field (link vs assisted)
- [ ] Add activation milestone tracking for referred venues
- [x] Add event audit tables for tier transitions and reward decisions
- [ ] Add indexes for scoring, referral, and campaign queries
- [ ] Add cron jobs for periodic tier maintenance evaluations

## L) Frontend / UI Tasks
- [ ] Tier progress card: next-tier and maintenance progress simultaneously
- [ ] At-risk warning surface with recovery guidance
- [ ] Push timing education in venue buying flow
- [ ] Referral status timeline (pending -> qualified -> rewarded)
- [ ] Admin visibility tools for tier and referral moderation

## M) Testing / QA Tasks
### Unit
- [ ] Tier threshold evaluation
- [ ] Promotion vs maintenance branching
- [ ] Grace and downgrade edge cases
- [ ] Referral qualification state machine

### Integration
- [ ] Event ingest -> score update -> tier update flow
- [ ] Referral activation -> reward issuance flow
- [ ] Push campaign release timing by tier
- [ ] Ranking behavior under mixed quality/tier cases

### Security / Abuse
- [ ] Fraud scenario tests (fake check-in, loops, rings)
- [ ] Idempotency tests for rewards and webhook paths
- [ ] RLS policy verification for referral and tier data

## N) Release Governance
- [ ] Feature flags for threshold changes
- [ ] Backfill/migration dry run in staging
- [ ] KPI monitoring dashboard before launch
- [ ] Rollback plan for tier miscalibration

## O) Cross-Surface Implementation Guardrails
- [ ] For each tier feature PR, complete user-side + venue-side impact check before coding
- [ ] Confirm venue education/copy needs for push timing, delays, and referral qualification
- [ ] Confirm venue analytics requirements are defined before enabling monetized tier features
- [ ] Confirm admin audit/override visibility exists for new tier/referral decision logic
- [ ] Confirm abuse/fairness review is documented for both user and venue exploit paths
- [ ] Confirm no conflicts with existing venue-tier system prior to rollout

## P) Venue Control Center Upgrade
- [x] Add dual-mode `VenueHome` presentation support (`classic` and `control_center`)
- [x] Add local mode persistence (`localStorage`) without backend dependencies
- [x] Add `VenueControlCenterHome` premium presentation layer using existing venue data/actions
- [x] Keep all existing `/venue/*` routes and module entry points intact
- [x] Preserve existing classic venue home functionality and flow behavior

## Q) Venue Interest Signals (At / Heading / Maybe)
- [x] Create source-of-truth planning doc: `docs/jv-venue-interest-signals-plan.md`
- [x] Add `venue_interest_signals` table (status + source + expiry + active flag)
- [x] Add unique active-signal constraint per `(user_id, venue_id)`
- [x] Add aggregation view/function for venue momentum counts by signal type
- [x] Replace hardcoded venue-page crowd intent counts with DB-backed counts
- [x] Persist `heading_there` and `maybe_going` via safe API/upsert path
- [x] Add TTL expiration handling and stale suppression for non-check-in intents
- [x] Add anti-spam cooldown and duplicate-toggle suppression
- [ ] Add audit trail for signal transitions and source (`check_in`, `manual_intent`, `post_intent`)
- [x] Add control-center momentum panel wiring (read-only in MVP)
- [x] Add post composer venue-tag intent chooser (`heading_there` / `maybe_going` / `mention_only`) with checked-in auto-resolve to `currently_at`
- [x] Ensure `mention_only` is stored in post metadata and does not write `venue_interest_signals` or affect momentum counts
- [ ] Add security-gated venue check-in flow foundation (no auto check-in for gated venues)
- [ ] Add staff/security verification check-in approval path
- [x] Add public/private presence selector post check-in
- [x] Add default-to-private timer behavior when presence visibility not selected (client-side foundation)
- [x] Add hybrid-entry fallback presence/check-in foundation with explicit non-approved verification state
- [x] Build `was_here` historical presence foundation (`checked_in` -> `checked_out` -> `was_here`) with privacy-compatible visit records

## R) Creator-Venue Partnerships / JV System
- [x] Create source-of-truth planning doc: `docs/jv-creator-venue-partnerships-plan.md`
- [ ] Define creator partnership visibility opt-in model (privacy-first defaults)
- [ ] Define influence card schema (privacy-safe, banded metrics, confidence labels)
- [ ] Define venue-tier-gated discovery entitlements and limits
- [ ] Define creator discovery filters and shortlist model
- [ ] Define JV offer lifecycle state machine (`draft`, `sent`, `viewed`, `accepted`, `declined`, `countered`, `revised`, `expired`)
- [ ] Define agreement record model (MVP: summary + dual acceptance + timestamps)
- [ ] Define negotiation message/revision audit trail
- [ ] Define anti-spam controls for venue outbound offers
- [ ] Define anti-fake-influence and partnership-loop abuse checks
- [ ] Define admin moderation and override tooling requirements
- [ ] Define phase-gated payout architecture prerequisites (fixed/milestone/rev-share)
- [ ] Ensure no direct-contact or invasive location exposure without explicit consent

## S) Venue Entry Policy Foundation (Security-Gated Prep)
- [x] Add nullable venue policy fields to `venues`:
  - `minimum_entry_age`
  - `entry_control_policy`
  - `security_operation_mode`
- [x] Extend venue onboarding (`VenueEssentials` -> `ProfileSetup`) to capture and persist policy fields
- [x] Expose policy fields on venue settings for owner edits
- [x] Add policy-aware presence/check-in eligibility foundation (open-entry compatible, security/hybrid require future verification path)
- [x] Build staff verification check-in foundation path (minimal owner/staff approval -> validated check-in)
- [ ] Build full security scanner verification flow (future)
- [x] Build public/private presence selection after security approval foundation (prompt + visibility metadata)
- [ ] Build server-side default-to-private finalization job for undecided visibility (future hardening)
- [x] Build fallback presence behavior foundation for hybrid venues (distinct source/state from staff approval)
- [x] Build transaction/POS inside-proof event foundation (schema + secure RPC ingestion + staff-authorized summary path)
- [x] Build internal venue presence confidence scoring engine foundation (venue-scoped, permission-gated, visibility-independent)
- [ ] Build stronger inside-proof confidence scoring calibrations for hybrid fallback (future)
- [ ] Build live POS/payment/order event integrations into inside-proof ingestion path (future)
- [ ] Build staff-side review queue for fallback patrons (future)
- [ ] Build banned patron alerting on credible inside-proof + policy checks (future)
- [x] Build venue-specific banned patron workflow foundation in authorized staff approval/inspection paths
- [x] Build venue staff/security permission foundation for entry approval + internal patron visibility gating
- [x] Build staff-only patron moderation controls foundation (`deal_suppressed`, `banned`, `kicked_out_tonight`) with reason capture and audit events
- [x] Build venue caution/alert preference foundation (category + trigger + threshold config, permission-gated)
- [ ] Build richer venue security staff tools and hardened permission model (future expansion)
- [ ] Build staff-facing inside-proof confidence indicators in internal patron surfaces
- [ ] Build approval audit history UI and reason-code tooling (future)
- [ ] Add watchlist / temp-ban status extensions to venue access-control model
- [ ] Add staff-side incident logging and reason-code tooling for ban/deny actions
- [ ] Add conservative banned escalation rules tied to credible inside-proof (not weak proximity alone)
- [ ] Build deal/ad targeting exclusion consumption using `deal_suppressed` status
- [ ] Build same-night cross-venue caution escalation workflow (permissioned, threshold-based, non-public)
- [x] Build final caution-threshold rule engine and operational alert delivery pipeline
- [x] Build venue/staff operational notifications foundation (internal-only records + role-aware delivery + read/unread + dedupe/cooldown)
- [x] Build server-side operational write hardening foundation for critical venue operations (check-ins, approvals, moderation, caution preferences, inside-proof, intent writes)
- [x] Build operational audit logging foundation (`venue_operational_action_logs`) with actor/target/venue/action metadata
- [ ] Build advanced abuse detection and anomaly scoring on top of operational audit logs
- [x] Build internal venue patron incident history / audit timeline foundation (venue-scoped, permission-gated, staff-only)
- [x] Build private-presence enforcement across public surfaces (public patron lists/discovery/social hide private check-ins while internal ops counts remain)
- [ ] Build moderation review tooling and richer incident timeline visualization
- [ ] Build incident timeline filtering/search by event family, severity, and date range
- [ ] Build incident resolution workflow (acknowledge, note, resolve, reopen) with reason coding
- [ ] Build platform admin audit dashboards for cross-venue operational events
- [x] Build venue operations dashboard foundation (staff-only route/container + permission-gated modular host surface)
- [ ] Build full internal venue operations dashboard (timeline + alerts + approvals + moderation) with role-specific workflows
- [ ] Build alerts panel UI module for venue operations dashboard
- [ ] Build patron inspection tools module for venue operations dashboard
- [ ] Build moderation dashboard module for venue operations dashboard
- [ ] Build security approval console module for venue operations dashboard
- [ ] Build venue analytics module for venue operations dashboard
- [ ] Expand operational notification routing by staff role and permission granularity (owner/admin/security/staff variants)
- [ ] Build operational notification inbox/history search (status filters, retention windows, and archival policy)
- [ ] Add operational notification escalation/severity policies (auto-escalate critical repeat alerts to stricter role scopes)
- [ ] Integrate operational notification feed into future venue operations dashboard modules
- [ ] Add optional future delivery adapters for internal notifications (mobile push, email, staff channel integrations) behind policy flags
- [ ] Build visit analytics modules on top of `was_here` history (venue-level trends, retention cohorts, repeat-visit windows)
- [ ] Build venue loyalty eligibility foundations using `was_here` visit history (rules/config only in MVP follow-up)
- [ ] Build user-facing visit history timeline powered by `was_here` records with privacy-aware filtering
- [ ] Build privacy-safe social proof features using public `was_here` visits only (never expose private visits)
- [ ] Add stronger privacy test coverage for public/private presence boundaries
- [ ] Add automated cross-surface visibility regression tests (public feed, discovery, patron lists, social intent)
- [ ] Finalize confidence weighting rules (source strength, recency decay, corroboration thresholds)
- [ ] Wire confidence-aware banned escalation safeguards (high-confidence only)
- [ ] Tune caution alert quality using confidence-aware evidence gates
- [ ] Integrate presence confidence into crowd quality / venue energy calculations (internal only)
- [ ] Build internal presence confidence dashboards and trend diagnostics for venue operations

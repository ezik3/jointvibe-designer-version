# JV Creator-Venue Partnerships Plan (Preservation-First)

## A) System Purpose
The creator-venue partnerships system is structured business tooling that enables venues and creators to establish professional collaborations inside Joint Vibe.

It is distinct from raw venue intent signals:
- intent signals answer: "who is at/heading/maybe at a venue right now"
- partnerships answer: "who is strategically valuable to collaborate with and under what terms"

Core purpose:
- help venues identify high-fit creators/influencers/entertainers
- help creators receive transparent, professional offers
- create measurable value loops tied to real venue outcomes

Non-goals in MVP:
- no hidden surveillance patterns
- no invasive person-tracking UX
- no automatic monetized targeting behavior

## B) Core System Layers
1. Signal system:
- real-time presence and interest context (`currently_at`, `heading_there`, `maybe_going`)
- acts as one input to partnership relevance, not the partnership system itself

2. Influence card system:
- standardized creator profile for venue-side evaluation
- shows business-relevant summary metrics, not private personal data

3. Creator discovery system:
- venue-side search, filters, and shortlist workflows
- tier-gated depth by venue entitlement level

4. JV offer system:
- formal offer creation and delivery flow
- structured terms and explicit acceptance controls

5. Negotiation flow:
- statused revisions (`counter`, `revised`, `expired`, etc.)
- timestamped state transitions

6. Agreement system:
- accepted offer -> structured agreement record
- clear deliverables, timing, and payout terms

7. Payment / rev-share system:
- payout logic linked to agreement terms and measurable outcomes
- staged rollout, no direct launch coupling with MVP

## C) Influence Card Design
Recommended visible fields:
- public creator handle + avatar + verification markers
- current user tier (if enabled for partner workflows)
- local influence strength (city-level weighted index)
- venue engagement quality (quality-adjusted interactions)
- estimated crowd pull band (banded estimate, not exact guarantee)
- audience quality indicators (bot-filtered, engagement quality)
- venue-type fit score (e.g., lounge/club/live-music affinity)
- recent venue spend influence (aggregate signal, privacy-safe)
- recent venue conversion impact (attribution confidence band)
- live/content performance (recent 7/30-day trend)
- city/category strength ranking (banded percentile)

What should NOT be shown:
- exact real-time private location traces
- exact personal contact details by default
- sensitive identity documents or private verification artifacts
- raw follower lists for scraping
- exact earnings from unrelated venue contracts

Privacy/fairness protections:
- aggregate and band high-sensitivity values
- minimum sample thresholds before metrics are shown
- quality confidence labels (low/medium/high confidence)
- explicit creator visibility preferences and opt-out controls
- auditability for venue access to creator cards

Opt-in / tier gating:
- creator can opt into "open to partnerships"
- advanced card depth available only to eligible venue tiers
- sensitive modules unlocked only after policy acceptance and trust checks

## D) Creator Discovery System
Discovery capabilities:
- keyword/profile search
- shortlist/bookmark management
- filters for:
  - city/area radius
  - tier
  - follower strength band
  - venue engagement quality
  - spend influence band
  - crowd pull band
  - venue-type fit
  - time windows (1d/7d/30d)
  - local influence rank band

Tiered access direction (venue side):
- lower venue tiers:
  - basic search and limited filter set
  - capped daily discovery views
- mid venue tiers:
  - richer filters and shortlisting
  - basic comparative view of candidates
- high venue tiers:
  - full filter matrix and advanced discovery tools
  - expanded analytics context and candidate segmentation

## E) Venue Radar Connection
Connection model:
- venue radar signals feed "momentum context" into discovery ranking
- raw intent counts are not equivalent to partnership readiness

Separation rule:
- partnership decisions should combine:
  - influence quality
  - historical conversion reliability
  - venue-type fit
  - integrity signals
- not just "who appears to be nearby now"

## F) JV Offer System
Offer types:
- fixed payment
- venue credit package
- free package (table/entry/experience)
- revenue share
- hybrid structures

Venue creates:
- offer title + objective
- campaign window
- deliverables (e.g., posts/live/check-in windows)
- payout model + caps + conditions
- expiration deadline

Creator receives:
- concise offer summary
- compensation model breakdown
- obligations and timeline
- explicit accept/decline/counter options

## G) Negotiation Flow
Status lifecycle:
1. `draft`
2. `sent`
3. `viewed`
4. `accepted`
5. `declined`
6. `countered`
7. `revised`
8. `expired`

Operational rules:
- immutable status history
- message/revision log per offer
- expiry automation with reminders
- idempotent transitions to prevent race conditions

## H) Agreement System
MVP agreement:
- platform-generated agreement summary from accepted offer
- deliverables, timing windows, payout terms
- both parties explicit acceptance
- timestamped and immutable version record

Later phases:
- richer template library by collaboration type
- e-signature integrations
- milestone tracking and fulfillment evidence
- escrow/prepayment logic
- rev-share reporting statements

## I) Payment / Rev-Share Architecture (High-Level)
Supported payout models (phased):
- fixed payment:
  - full prepay or split schedule
- milestone payout:
  - release funds when milestone evidence is verified
- post-event payout:
  - settle after campaign completion check
- rev-share:
  - tie payout to attributable revenue/conversion windows
- hybrid:
  - base + upside (rev-share/performance bonus)

Future measurable-outcome linkage:
- agreement-linked attribution events
- confidence scoring on conversion attribution
- dispute workflow for contested outcomes

No payment architecture should be launched before:
- offer/agreement integrity
- anti-fraud controls
- audit logs and admin overrides

## J) Tier Benefit Mapping
Potential benefit structure:
- higher-tier venues:
  - deeper discovery access
  - richer analytics and candidate insights
  - larger active campaign capacity
- higher-tier users/creators:
  - higher partnership discoverability
  - premium offer eligibility bands
  - advanced profile visibility options
- partnership-eligible creators:
  - access contingent on integrity and quality thresholds
  - not entitlement-based by tier alone

## K) Privacy / Anti-Creepy Rules
Non-negotiable product rules:
- no exact movement timeline exposure
- no venue-side stalking-style interface
- no hidden scoring without explanation surfaces
- no private contact exposure without consent
- no persistent "always trackable" user state
- creator control over partnership visibility
- explicit consent for profile discoverability in partnerships

UX tone:
- professional collaboration marketplace
- transparent metrics + clear purpose
- privacy-first defaults

## L) Anti-Gaming / Abuse Protections
Venue abuse controls:
- prevent spam offer blasts
- limit active outbound offers by tier/trust level
- enforce offer quality minimums
- abuse strikes for deceptive contracts

User/creator abuse controls:
- anti-fake influence checks
- anti-ring and bot-inflated engagement suppression
- anti-loop partnership farming detection
- trust score gating for eligibility

System-level controls:
- immutable audit logs for offer/agreement changes
- risk flags and manual review queues
- payout holds for suspicious activity
- clawback policy for proven fraud loops

## M) MVP vs Phase 2 vs Phase 3
MVP:
- creator partnership opt-in controls
- basic influence cards (privacy-safe, banded metrics)
- basic creator discovery and shortlisting
- offer creation + sent/viewed/accepted/declined/counter/revised/expired states
- MVP agreement record (no signatures)
- audit logging and admin review visibility

Phase 2:
- enhanced discovery filters and segmentation
- richer agreement templates and milestone workflows
- early fixed/milestone payout integrations
- stronger risk/fraud scoring
- venue radar-informed prioritization (still privacy-safe)

Phase 3:
- full rev-share and hybrid payout models
- advanced attribution reporting and disputes
- automated optimization recommendations
- deeper tier-aware entitlements and capacity controls

## Safest Sequencing Notes
Build before partnerships:
1. venue interest signal infrastructure (counts + trust controls)
2. config-driven tier and audit foundations
3. abuse/risk baseline tooling and admin visibility

Never build too early:
- auto-targeting based on sensitive inferred movement
- direct contact exposure without consent
- rev-share payouts without robust attribution + disputes
- high-value offers without anti-fraud and audit trails

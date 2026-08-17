# Joint Vibe Tier System Architecture (Source of Truth)

## 1. Purpose and Product Role
The Joint Vibe end-user tier system is a core marketplace engine, not a cosmetic badge system.

It must simultaneously:
- increase real-time nightlife participation
- increase verified venue spend
- increase venue-side ROI from Joint Vibe tools
- increase Joint Vibe monetisation (especially push products)
- reward real user contribution and influence without creating entitlement
- resist gaming by both users and venues

This document is the authoritative architecture reference for tier design, implementation scope, and future iteration.

## 2. Tier Ladder
Ordered lowest to highest:
1. Member
2. Bronze
3. Silver
4. Gold
5. Diamond
6. Platinum

Important ladder rules:
- Diamond is above Gold and below Platinum
- Platinum is elite and should remain ~1% or less of active users
- Higher tiers unlock leverage and opportunity, not unconditional entitlement

## 3. Emotional Meaning of Each Tier
- Member: New or low-activity user. Exploring nightlife graph and offers.
- Bronze: Consistent participant. Shows repeated activity and early trust signals.
- Silver: Recognized active user with measurable contribution.
- Gold: City-relevant user. Meaningfully influences venue traffic and content visibility.
- Diamond: High-value influence user. Strong spend + strong social/venue impact.
- Platinum: Unicorn-level market mover. Rare, trusted, multi-signal excellence.

## 4. Rarity Targets (Active 90-day population)
Target distribution bands:
- Bronze: 35-45%
- Silver: 20-30%
- Gold: 8-12%
- Diamond: 2-4%
- Platinum: 0.5-1.0%

Operational policy:
- If Platinum > 1%, tighten gates or thresholds before adding perks.
- If Diamond > 4% in mature markets, tighten promotion gates first, not maintenance.

## 5. Core Scoring Model: Contribution Score + Gates
Tier outcome uses two layers:

1) Contribution Score (CS)
- Rolling 90-day weighted points from behavior events.
- Captures volume and commercial value.

2) Quality/Integrity/Influence Gates (QII Gates)
- Required for top-tier promotion (especially Diamond/Platinum).
- Prevents pure volume abuse (spam, fake signals, manipulated behavior).

Promotion requires both:
- CS >= promotion threshold
- all required QII gates satisfied

Maintenance requires:
- CS >= maintenance threshold
- integrity not critically violated

## 6. Promotion vs Maintenance Philosophy
Non-negotiable policy:
- hard to earn
- easier to keep
- hard again to level up

Interpretation:
- Promotion thresholds are intentionally high.
- Maintenance thresholds are lower than promotion thresholds.
- User keeps status through ongoing contribution, not repeated full re-grind.

## 7. Rolling 90-day Window
Scoring window:
- Every event contributes to CS for 90 days.
- Events age out continuously.

Current implementation alignment:
- `tier_point_events.expires_at` already supports 90-day expiry-based scoring.
- `record-tier-event` currently recalculates from non-expired events.

## 8. At-Risk, Grace, and Downgrade Logic
Target behavior:
- If user falls below maintenance threshold, mark tier as at risk.
- Issue warning and grant grace period.
- Downgrade only after grace expires and recovery did not occur.

Current implementation alignment:
- `user_tiers.tier_at_risk` and `tier_at_risk_since` already exist.
- `record-tier-event` currently applies 30-day grace for high-tier demotions.

Recommended standardization (future build):
- keep at-risk flags for all tiers
- grace duration by tier (example):
  - Bronze/Silver: 14 days
  - Gold: 21 days
  - Diamond/Platinum: 30 days
- one-tier-at-a-time downgrade policy

## 9. Why Platinum Must Remain Elite
Platinum is a trust and influence tier.

If Platinum becomes common:
- venue confidence in high-tier targeting drops
- deal timing advantage becomes less meaningful
- social signal value collapses
- monetisation leverage on premium push products weakens

Platinum promotion must require:
- high CS
- verified commercial impact
- integrity gates passed
- influence quality gates passed

## 10. Weighting Philosophy (Strategic)
Priority order:
1. Verified spend and conversion activity
2. High-intent real-time nightlife participation
3. Influence behaviors with quality outcomes
4. Generic low-intent posting

Rules:
- Verified spend should outweigh generic posting.
- Posting while checked in still matters materially.
- Going live at venues matters when engagement quality is real.
- Venue referrals are among strongest point events but must be heavily qualified.

## 11. Venue Referral Architecture
### 11.1 Referral Modes
Two attribution paths must exist:
1. Referral-link signup attribution
2. In-person / assisted signup attribution (manual verified assist)

In-person/assisted should carry higher potential value than simple link signup.

### 11.2 Qualification Before Tier Points
Do not award full referral points on account creation alone.

Minimum qualification gate examples:
- venue approved/verified
- first successful payment processed
- first X transactions (for example 10)
- first $X verified GMV/processed revenue
- non-test activity only

### 11.3 Qualification Before Referral Credits/Payouts
Credits/rewards require stronger gate than signup:
- qualified activation milestone reached
- no fraud/risk block
- no duplicate attribution conflicts

### 11.4 Anti-Gaming for Referrals
Protections:
- deduplicate by venue identity + owner identity
- cooldown on same referrer-same venue attempts
- reject self-referrals and coordinated ring patterns
- require activation milestones before full points/rewards
- separate provisional points from finalized points
- clawback logic if venue churns instantly or is fraud-flagged

Current implementation alignment:
- Referral tables exist: `referral_codes`, `referrals`, `referral_rewards`.
- Referral statuses exist: pending, qualified, rewarded, expired, rejected.
- Stripe webhook currently issues monthly residual for qualifying referrals.

## 12. Deal Push Architecture (Real-Time Nightlife)
### 12.1 Push Window Products
Primary products:
- 2-hour push
- 4-hour push
- 6-hour push
- 8-hour push

Reasoning:
- app is about now
- short expiry preserves urgency/freshness
- encourages repeat venue spend on push inventory

### 12.2 Tier Access Delay Model (Short Delays)
Delays must be short and proportional to real-time windows.

Reference model:
- Platinum: instant
- Diamond: +1 to 2 min
- Gold: +3 to 5 min
- Silver: +7 to 10 min
- Bronze: +12 to 20 min
- Member: +20 to 30 min

Never use long delays like +6h/+12h for nightlife deal windows.

### 12.3 Urgency/Freshness Principles
- pushes expire quickly
- stale pushes auto-suppressed
- release cadence should feel competitive and live

## 13. Feed and Discovery Ranking Philosophy
Tier influences ranking but must not fully dominate:
- relevance
- recency
- engagement quality
- context (checked-in, venue-tagged, live)

Current implementation alignment:
- `src/utils/feedScoring.ts` uses weighted blend of distance/recency/tier + live boost.

Future ranking direction:
- retain weighted blend approach
- migrate to richer quality and integrity modifiers
- keep hard cap to prevent tier-only domination

## 14. Active Unlock Philosophy (No Entitlement)
Higher tiers should unlock access and opportunity.

Strongest benefits should activate when user is generating value now:
- checked in
- spending
- posting quality venue content
- driving measurable venue outcomes

No permanent "always everything" entitlement behavior.

## 15. Venue-side Value / ROI Philosophy
Venue understanding must stay simple:
- what they paid
- who saw the push (tier mix)
- who redeemed
- verified spend generated
- repeat behavior lift

Tier system exists to improve venue ROI clarity, not create opaque gamification.

## 16. Anti-Abuse Principles (Users + Venues)
User-side abuse controls:
- fake check-in prevention (geo/device/time/risk)
- fake engagement/follower ring detection
- low-quality repetitive action dampening
- spend verification-only weighting

Venue-side abuse controls:
- prevent over-requiring unpaid user labor
- prevent bypass of paid push inventory via exploit flows
- enforce campaign integrity and attribution constraints

## 17. Existing Implementation Snapshot (Do Not Drift)
Current code and schema already present:
- user tier hook: `src/hooks/useUserTier.ts`
- tier event processor: `supabase/functions/record-tier-event/index.ts`
- score events table: `tier_point_events`
- user tier state table: `user_tiers`
- referral hooks:
  - `src/hooks/useReferralCode.ts`
  - `src/hooks/useUserReferrals.ts`
- referral schema migration:
  - `supabase/migrations/20260129020533_6b0a1ec0-cbae-455b-97c6-2da345fb702f.sql`
- residual referral migration:
  - `supabase/migrations/20260129041317_3a406739-b81e-4b65-92dd-208be90b0221.sql`
- current feed scoring utility:
  - `src/utils/feedScoring.ts`

Important:
- Existing numeric thresholds/config in code are baseline implementation, not final strategic target.
- Future changes must migrate with backward-safe schema + feature flags.

## 18. MVP / Phase 2 / Phase 3
### MVP
- stabilize 90-day CS
- enforce promotion vs maintenance separation
- at-risk + warning + grace UX
- short push windows (2/4/6/8h)
- short tier-delay release model
- referral qualification gates before major rewards

### Phase 2
- stronger integrity scoring and abuse detection
- richer ranking features (quality + integrity + context)
- dynamic calibration by city liquidity

### Phase 3
- creator economy expansion for top tiers
- advanced venue campaign optimization and bid strategy
- city league competition and advanced network effects

## 19. Open Questions / Unresolved Decisions
- Final numeric CS thresholds for each tier by market maturity
- Exact maintenance multipliers per tier
- exact referral activation milestones (transactions/revenue thresholds)
- whether Platinum requires manual review in addition to automated gates
- fairness controls for low-tier visibility in high-demand cities

## 20. Implementation Notes
- Use config tables for thresholds and weights; avoid hardcoding in multiple places.
- Preserve idempotency for referral and reward processing.
- Keep all tier-changing writes auditable.
- Use feature flags for rollout of new thresholds and delay logic.

## 21. Rules Future Developers Must Follow
1. Read this file before changing tier/referral/push/ranking logic.
2. Do not introduce long delay windows incompatible with nightlife urgency.
3. Do not weight generic posting above verified spend.
4. Do not grant major referral rewards on signup alone.
5. Keep Diamond and Platinum gated by quality/integrity, not volume only.
6. Keep maintenance easier than promotion.
7. Update `docs/jv-tier-perks-reference.md` and `docs/jv-tier-build-checklist.md` in the same PR as architecture changes.
8. Avoid parallel conflicting scoring systems; keep one authoritative CS pipeline.
9. Never ship tier logic changes without anti-abuse impact review.
10. Preserve backward compatibility and migration safety.

## 22. Presence System Layer Separation (Policy-Aware Foundation)
Joint Vibe presence and venue access-control must remain explicitly separated into eight layers:

1. Intent layer:
- `heading_there`
- `maybe_going`
- `mention_only`

2. Presence layer:
- `near_venue`
- `at_venue_unverified`
- `checked_in`
- `checked_out`
- `was_here` (future)

3. Verification layer:
- `not_required`
- `required`
- `pending`
- `approved`
- `denied`
- `manual_override`
- `fallback_unverified`

4. Visibility layer:
- `public`
- `private`

5. Access / permission layer:
- `venue_owner_admin`
- `authorized_venue_staff`
- `authorized_security_staff`
- `non_authorized_user`

6. Venue access-control layer:
- `allowed`
- `banned`
- `watchlist` (future)
- `temp_banned` (future)

7. Inside-proof / confidence layer:
- `weak_proximity_only`
- `staff_approved_entry`
- `fallback_unverified_presence`
- `transaction_or_pos_supported_proof`

8. Venue caution / incident signal layer:
- `chargeback_refund_abuse`
- `disruptive_behaviour`
- `abusive_to_staff`
- `harassment`
- `fake_id_entry_fraud`
- `prior_incident`
- `theft_or_damage`
- `other`

Visibility foundation rule:
- valid `checked_in` state is separate from visibility choice
- newly created valid check-ins should start private and require explicit user selection for public exposure
- if no selection is made within timeout, visibility defaults to private

Policy interpretation baseline:
- `open_entry`: proximity + standard checks can permit immediate check-in.
- `security_required`: proximity/arrival alone must not auto-upgrade to `checked_in`.
- `hybrid_entry`: proximity/arrival alone must not imply verified check-in; fallback may be allowed with explicit lower-confidence status.

Validated check-in sources:
- `self_checkin_open_entry`: user check-in at open-entry venues after standard proximity checks.
- `staff_approval`: venue owner/authorized staff approval that upgrades `at_venue_unverified` to `checked_in`.
- `hybrid_fallback`: controlled fallback check-in for hybrid venues, explicitly non-equivalent to staff approval.

Non-negotiable:
- `venue_interest_signals` remains intent-only.
- `currently_at` remains derived from valid check-in records.
- composer/intent actions must never manually set `checked_in`.
- operational actions (entry approval, internal patron visibility) must run through explicit venue-linked authorization checks.
- critical operational writes must execute through server-side RPC/edge paths with idempotency/cooldown guards; direct client table writes are not authoritative.
- sensitive operational actions must write to an internal audit log (actor, target, venue, action, metadata) for future moderation/admin review.
- venue bans are venue-specific by default, not global.
- banned detection should run in explicit authorized staff flows; weak proximity alone is insufficient for strong operational alerts.
- transaction/POS inside-proof is a stronger confidence signal than raw proximity, but it is still distinct from visibility choice and does not imply automatic public exposure.
- internal presence confidence scoring must remain a separate operational layer from presence state, verification state, moderation status, and visibility choice.
- high internal presence confidence must never be treated as public visibility entitlement; private check-ins can still carry high confidence internally.
- confidence outputs are operational support signals (for staff/admin safety and quality decisions), not public user reputation scores.
- `deal_suppressed` and `banned` are distinct operational states; suppression controls venue targeting eligibility and is not a ban.
- `kicked_out_tonight` is a time-sensitive internal operational status and must remain permission-gated.
- caution/incident preferences are venue-configurable thresholds, not a global JV-wide judgment score.
- staff/venue operational notifications are internal-only operational tooling and must never be exposed on public/user-facing social notification surfaces.
- operational notifications must be permission-aware by venue role scope (owner/admin/security/authorized staff) and must not deliver beyond authorized recipients.
- operational notifications must apply conservative anti-noise controls (dedupe windows, cooldowns, and confidence-aware suppression) to prevent alert storms from weak/repeated signals.
- venue patron incident history/audit timelines are internal and venue-scoped; they must never become a global/public user reputation feed.
- internal incident timeline access must remain restricted to authorized venue operational roles (owner/admin/security/staff) and relevant platform admins.
- private check-ins must remain hidden across all public identity-bearing surfaces (patron lists, discovery identity surfaces, social presence signals), while still counting toward aggregate venue crowd/energy metrics.

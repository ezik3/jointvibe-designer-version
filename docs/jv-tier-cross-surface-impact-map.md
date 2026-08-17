# Joint Vibe Tier Cross-Surface Impact Map

## 1. Executive Summary
The tier engine is not a user-only feature. Every major tier mechanic has direct venue-side, admin-side, and analytics-side dependencies, especially referral qualification, short-window push timing, and ranking visibility. The highest implementation risks are cross-system inconsistencies: user-facing perks without venue controls, scoring changes without attribution integrity, and push/ranking changes without ROI explainability for venues.

Primary cross-surface conclusions:
- Venue-facing education and analytics are mandatory for push timing, tier-delay access, and referral qualification.
- Backend must become config-driven before live threshold changes to prevent drift across hooks/functions/UI.
- Admin needs explicit audit + override tooling for Diamond/Platinum gating, referral disputes, and fraud suppression.
- Anti-abuse controls must be implemented alongside each feature, not as a later add-on.

## 2. Cross-Surface Matrix

| Feature | User-side | Venue-side | Backend/Data | Admin | Analytics | Abuse/Fairness | Priority |
|---|---|---|---|---|---|---|---|
| 1) Promotion vs maintenance thresholds | Progress UI must show earn vs keep | Venue education copy to understand tier audience quality, not just size | Config tables for promotion/maintenance thresholds + evaluation logs | Override policy for exceptional cases | Promotion rate, maintenance rate, downgrade rate by tier/city | Users may game thresholds via low-quality loops | MVP |
| 2) 90-day rolling contribution score | Clear 90-day window explainer + event history | Venue-facing explanation of why audience quality shifts over time | Event expiry model, rolling aggregation, recalculation jobs | Support visibility into score changes | Score volatility, retention vs decay curves | Event spam near window edges | MVP |
| 3) Spend-weighted scoring | Users see spend impact and caps | Venue needs spend-attributed impact dashboards | Verified spend event ingestion + weighting configs | Fraud review for suspicious spend patterns | Spend-to-tier uplift, venue revenue lift | Wash spending, collusion, refund abuse | MVP |
| 4) Venue referral link attribution | Referrer sees pending/qualified lifecycle | Venue onboarding copy: referral captured and subject to qualification | Attribution fields + source tracking + dedupe | Dispute tool for attribution conflicts | Link conversion funnel, qualify rate | Self-referrals, duplicate claims | MVP |
| 5) Assisted/in-person venue attribution | Assisted referrer sees distinct status/value | Venue onboarding needs assisted source confirmation UI | Assisted source enum, evidence metadata, reviewer fields | Manual verification queue | Assisted vs link performance | Fake assisted claims | Phase 2 |
| 6) Referral qualification milestones | Users see milestones before points/rewards finalize | Venues need milestone definitions in onboarding/help | Milestone state machine tied to verified activation events | Manual qualify/reject + reason logging | Time-to-qualify, payout quality | Fake venue activation, low-quality churn | MVP |
| 7) 2h/4h/6h/8h push products | Users see urgency + expiry indicators | Venue must choose duration products with clear pricing templates | Campaign duration enum, start/end times, expiry jobs | Admin campaign policy controls | ROI by duration product | Over-long pushes reduce freshness | MVP |
| 8) Short tier-delay deal access | Users need transparent delay expectations by tier | Venue needs explanation of release waves and expected reach pacing | Delay config per tier + release schedule generator | Admin can tune delays by market | Redemption by wave and tier | Perceived exclusion for lower tiers | MVP |
| 9) Feed/discovery tier boosts | Users perceive higher influence at higher tiers | Venue needs clarity on why certain creators drive reach | Unified ranking service with capped tier multiplier | Ranking override/incident controls | CTR, redemption, dwell by ranking factors | Tier overpowering quality/relevance | Phase 2 |
| 10) Checked-in post boosts | Users prompted to post while checked in | Venues benefit from templates encouraging high-quality check-in content | Verified check-in context events in rank/score pipeline | Abuse queue for fake check-ins | Check-in post conversion impact | Fake geo/check-in spoofing | MVP |
| 11) Live-at-venue boosts | Live creators get momentary visibility uplifts | Venue-side live templates and best-time guidance | Live state + venue context weighting | Live abuse moderation hooks | Live-to-redeem conversion | Low-quality live spam | Phase 2 |
| 12) Active unlock mechanics | Users must perform contribution actions to activate perks | Venues need clear explanation that perks activate on real contribution, not entitlement | Unlock state table + activation criteria engine | Exception handling for failed unlocks | Unlock activation rate | Macro/scripting of trivial actions | Phase 2 |
| 13) Diamond/Platinum quality gates | High-tier users must see required gate criteria | Venues need trust labels for elite-tier credibility | QII gate fields, integrity scores, gate decision logs | Manual review/appeal workflow | Platinum rarity, false positive/negative rates | Farming signups without quality | MVP |
| 14) At-risk/grace/downgrade UX | Warning, countdown, and recovery actions | Venue messaging to avoid confusion in campaign expectations | At-risk state fields + grace timers + downgrade jobs | Admin reset/override in edge cases | Recovery rates and churn after warnings | Fear/friction if messaging unclear | MVP |
| 15) Tier perks visibility | Perk matrix in app with locked/unlocked states | Venue-facing “what each tier sees first” guide | Perk config table + feature flags | Admin can disable misconfigured perks | Perk usage and feature adoption | Entitlement perception if unclear | MVP |
| 16) Venue ROI analytics tied to tier behavior | Users can see contribution impact outcomes | Venues need ROI dashboard by tier cohort and push wave | Attribution joins across deals/redemptions/spend | Admin visibility into venue ROI outliers | CPA/ROAS-like metrics for tier-targeted pushes | Selective reporting bias | MVP |
| 17) Anti-abuse/fraud controls | Users see enforcement policy and transparent penalties | Venues need policy boundaries (cannot force unpaid labor) | Risk scoring, anomaly detection, throttles, clawback | Investigation console + case history | Fraud rate, false positive rate | Rings, fake followers, fake spend | MVP |
| 18) Admin review/override needs | Users need appeal path for tier/referral decisions | Venues need support route for attribution/push disputes | Audit log tables + immutable reason codes | Review queue, override controls, mandatory notes | Override frequency, reason distribution | Abuse through arbitrary overrides | MVP |

### Expanded Notes by Feature

1. Promotion vs maintenance thresholds:
- Venue-side requirement: explanatory tooltip and docs in venue analytics that tier cohorts are dynamic and maintenance-driven.

2. 90-day rolling contribution score:
- User-side requirement: event timeline with expiration markers to reduce confusion on score drops.

3. Spend-weighted scoring:
- Backend dependency: verified spend must come from trusted payment rails only (transactions/deposits/orders marked completed and non-test).

4. Referral link attribution:
- Dependency risk: current capture exists, but end-to-end referral row creation on venue onboarding must be verified and standardized.

5. Assisted/in-person attribution:
- Venue-side requirement: assisted attribution form should collect minimal proof (staff id, timestamp, context).

6. Qualification milestones:
- Milestones should separate points qualification from payout qualification; payout criteria stricter.

7. 2h/4h/6h/8h push products:
- Venue templates should include recommendation presets by objective (fill seats fast, off-peak recovery, late-night boost).

8. Short tier-delay access:
- Fairness guardrail: ensure lower tiers still get a meaningful remainder window; communicate this clearly.

9. Feed/discovery boosts:
- Must cap tier multiplier influence so quality/relevance/recency still dominate.

10. Checked-in post boosts:
- Should include dwell and verification checks to avoid drive-by check-in abuse.

11. Live-at-venue boosts:
- Boost should be temporary and conditional on engagement quality.

12. Active unlock mechanics:
- Perks should require contribution context (checked-in/live/spend/referral milestones), not passive ownership.

13. Diamond/Platinum gates:
- Platinum should include stricter integrity criteria and possibly manual spot checks to stay <=1%.

14. At-risk/grace/downgrade UX:
- Warnings should include actionable steps to recover and a clear date/time deadline.

15. Tier perks visibility:
- Keep one central perks schema to avoid user/venue mismatch.

16. Venue ROI analytics:
- Essential for monetization trust: venues need spend and redemption outcomes by tier wave and push duration.

17. Anti-abuse/fraud:
- Controls must be bi-directional: user abuse and venue abuse protections.

18. Admin review/override:
- Overrides should require reason codes and generate immutable audit entries.

## 3. Venue-Impact-Required List
The following features definitely require venue-side work:

1. Promotion vs maintenance thresholds:
- Needs: education, analytics.

2. Spend-weighted scoring:
- Needs: analytics, safeguards.

3. Venue referral link attribution:
- Needs: education, safeguards.

4. Assisted/in-person attribution:
- Needs: configuration, education, safeguards.

5. Referral qualification milestones:
- Needs: education, analytics, safeguards.

6. 2h/4h/6h/8h push products:
- Needs: configuration, templates, education, analytics.

7. Short tier-delay deal access:
- Needs: education, analytics.

8. Feed/discovery tier boosts:
- Needs: education, analytics.

9. Checked-in post boosts:
- Needs: templates, education, safeguards.

10. Live-at-venue boosts:
- Needs: templates, education, analytics.

11. Active unlock mechanics:
- Needs: education, templates.

12. At-risk/grace/downgrade UX:
- Needs: education.

13. Tier perks visibility:
- Needs: education.

14. Venue ROI analytics tied to tier behavior:
- Needs: analytics, configuration (filters/cohorts).

15. Anti-abuse/fraud controls:
- Needs: safeguards, permissions.

16. Admin review/override needs:
- Needs: support pathways, safeguards.

## 4. High-Risk Integration Areas
1. Venue pushes and push credits:
- Current credit decrement has client-side behavior; introducing wave logic or duration products can cause consistency bugs if not moved to server-validated transactions.

2. Referral flows:
- Existing link capture and admin/manual reward paths can diverge; adding qualification logic without unified state machine will create payout disputes.

3. Wallet/credits and Stripe webhook coupling:
- Push credits and referral residuals are webhook-driven; changes must preserve idempotency and not alter existing payment correctness.

4. Deal configuration:
- Adding short windows and tier delays to deal visibility can conflict with current optional `expires_at` model if not migrated safely.

5. Ranking/discovery:
- Multiple feed pathways currently exist; introducing tier modifiers in one path only will create inconsistent outcomes.

6. Existing venue-tier logic:
- Separate venue-tier system already active. User-tier implementation must remain isolated unless explicitly integrating, to avoid cross-tier regressions.

## 5. Recommended Implementation Sequencing
1. Config and audit foundation (MVP-safe):
- Add config tables for thresholds, weights, delays, and milestone definitions.
- Add audit/evaluation logs without changing live behavior.

2. Referral qualification state machine (MVP):
- Normalize pending -> qualified -> rewarded with explicit milestone checks.
- Keep existing payouts intact behind compatibility layer.

3. Push campaign duration model (MVP):
- Add 2h/4h/6h/8h campaign schema and expiry handling.
- Keep existing credit purchase flow untouched.

4. Tier delay release scheduling (MVP):
- Apply short delay waves per tier on top of new campaign model.
- Add venue reporting for wave performance.

5. Spend weighting and integrity controls (MVP):
- Introduce verified spend-weight points with caps and anti-abuse checks.

6. At-risk/grace UX and perks visibility (MVP):
- Ship user/venue education surfaces and clear warning states.

7. Ranking unification + advanced boosts (Phase 2):
- Consolidate ranking logic and add checked-in/live context multipliers with hard caps.

8. Active unlock expansion + advanced moderation (Phase 2/3):
- Add richer unlock mechanics, creator economy hooks, and enhanced admin tooling.

## 6. Documentation Update Notes
This cross-surface map is additive to architecture/perks/checklist docs and does not override them.

Future rule:
- Any tier feature PR must reference this map and check both user-side and venue-side impact before implementation.

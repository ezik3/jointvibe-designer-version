# JV Venue Interest Signals Plan (Preservation-First)

## 1) Scope and Objective
This plan defines a safe rollout path for venue intent signals in the nightlife ecosystem:
- `currently_at`
- `heading_there`
- `maybe_going`

Goal:
- improve real-time venue momentum visibility for users and venues
- keep trust high
- avoid premature monetization or targeting logic

Out of scope in this phase:
- no targeted offer engine
- no high-tier direct outreach workflows
- no payout/monetization behavior changes

## 2) Current State Audit
### Existing implementation that can be reused
- Verified presence source already exists via `check_ins` with `checked_out_at` lifecycle.
- Global user check-in state exists in `useUserCheckIn`.
- Venue detail route already includes status UI actions in `ImmersiveVenue` (`at`, `heading`, `maybe` buttons).
- Post creation already supports venue linkage via `posts.venue_id` (from location selection).

### Current gaps and hardcoded behavior
- Venue crowd intent counts on venue page are currently hardcoded (`at`, `heading`, `maybe`).
- `heading` and `maybe` state is local UI state only in `ImmersiveVenue` and is not persisted.
- `currently_at` is derived from real check-ins, but not unified with a broader intent state model.
- No expiration/staleness rules for intent states exist.
- No anti-spam controls for non-check-in intent declarations exist.

## 3) Signal Definitions
## A) `currently_at`
- Definition: user is physically present, backed by active check-in (`check_ins.checked_out_at IS NULL`).
- Trigger:
  - successful check-in flow
- End:
  - checkout
  - auto-checkout/inactivity policy (future)

## B) `heading_there`
- Definition: user intends to arrive soon.
- Trigger:
  - explicit user action on venue page/post flow (future persisted action)
- Expiry:
  - short TTL (recommended 90-180 minutes)
- Auto-clear:
  - when user checks into same venue (`currently_at` supersedes)
  - when TTL expires

## C) `maybe_going`
- Definition: user is uncertain but considering venue.
- Trigger:
  - explicit user action on venue page/post flow (future persisted action)
- Expiry:
  - medium TTL (recommended 6-12 hours max, nightlife-safe)
- Auto-clear:
  - when user sets `heading_there`
  - when user checks in
  - when TTL expires

## 4) Source of Truth Model
Primary source priority:
1. `currently_at` from verified `check_ins`
2. explicit intent actions (`heading_there`, `maybe_going`) from dedicated interest state table (future)
3. post metadata as secondary evidence (venue-tagged post context), not primary truth

Conflict resolution:
- one active interest state per user per venue
- if check-in exists, effective state must resolve to `currently_at`
- stronger signal supersedes weaker signal:
  - `currently_at` > `heading_there` > `maybe_going`

Stale handling:
- TTL enforced at query layer and background cleanup
- expired signals excluded from user-facing counts even before hard delete

## 5) User-Side Surfaces
- Venue detail page (`/app/venue/:id`):
  - set status (at/heading/maybe)
  - see live counts by state
- Post composer:
  - optional intent state metadata when venue-tagging a post (future)
- Feed/post cards:
  - compact badges like "Heading to [Venue]" or "At [Venue]" (future)
- Profile activity:
  - recent venue intent timeline (future)

## 6) Venue-Side Surfaces
- Public venue page:
  - aggregate momentum strip: at / heading / maybe
- Venue control center:
  - momentum card with trend and recency window (future wire-up)
- Future heat modules:
  - intent velocity and conversion to check-in (phase 2+)

## 7) Tier-Aware Future Potential (Not in MVP)
- weighted momentum views:
  - aggregate count
  - optional higher-tier share metrics
- creator signal overlays:
  - creators heading there
  - creators currently at venue
- venue reaction workflows:
  - suggested actions based on intent spikes

No advanced targeting behavior should be implemented in MVP.

## 8) Anti-Gaming and Trust Model
User abuse protections:
- rate-limit status changes per user per venue (cooldown windows)
- suppress repeated toggling loops from counting multiple times
- enforce TTL and dedupe active rows
- require verified check-in for `currently_at`

Venue abuse protections:
- venue cannot manually alter user intent state
- venue only sees aggregate momentum by default
- any user-level visibility must be policy-gated and audited later

Data integrity protections:
- unique active-state constraint (user_id, venue_id)
- idempotent upsert behavior for intent updates
- audit log on state transitions and source

## 9) MVP vs Later Phases
## MVP
- read model that combines:
  - real check-ins (`currently_at`)
  - placeholder-compatible schema for `heading_there` and `maybe_going`
- venue page intent counts sourced from DB (remove hardcoded counts)
- minimal set-status API + table with TTL for heading/maybe
- no monetization logic
- no targeting logic

## Phase 2
- post-intent metadata integration
- momentum trend chart + conversion from heading/maybe -> check-in
- anti-abuse scoring and anomaly suppression

## Phase 3
- tier-aware momentum views
- creator influence overlays
- venue action recommendations with strict policy controls

## 10) Safest First Build Slice
Recommended first implementation slice:
1. Add data model only:
   - `venue_interest_signals` (user_id, venue_id, signal_type, source, set_at, expires_at, active)
   - supporting index + unique active key
2. Add read-only aggregation function/view:
   - per-venue counts for currently_at/heading_there/maybe_going
3. Keep existing check-in flow unchanged and map `currently_at` from `check_ins` only
4. Do not change ranking, payouts, stripe, or push logic

This gives safe infrastructure while minimizing risk to live flows.

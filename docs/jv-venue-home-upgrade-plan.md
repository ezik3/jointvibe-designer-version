# JV Venue Home Upgrade Plan (Preservation-First)

## 1) Current Venue-Side Preservation Report

### Existing venue route surface (must remain)
- `/venue/home`
- `/venue/menu`
- `/venue/orders`
- `/venue/reservations`
- `/venue/deliveries`
- `/venue/wallet` (with `/venue/credits` redirect)
- `/venue/assign`
- `/venue/notifications`
- `/venue/messages`
- `/venue/account`
- `/venue/settings`
- `/venue/referrals`
- Founders routes under `/venue/founders/*`
- POS routes under `/venue/pos/*`

### Existing venue modules/features currently implemented
- Persistent venue shell + nav in `VenueLayout`
- Home operating surface in `VenueHome` with:
  - live activity stream
  - occupancy/check-ins
  - orders/delivery stats
  - venue tier panel (`VenueTierDashboardCard`)
  - orb-driven quick actions
  - Control Center drawer (`ControlCenterPanel`)
  - Vibe tools (`VibeCreator`, `VibeRadar`)
  - deal creation + push flows (`DealCreatorModal`)
  - AI helper, chat overlay, tables popup
- Wallet + credits + deals library in `VenueCredits`
- Stripe Connect onboarding/status in `VenueSettings`
- withdrawal security controls in `VenueSettings`
- module toggles/presets via `VenueModulesContext` and `venue_modules`
- orders/delivery execution in `VenueOrders`
- reservations management in `VenueReservations`
- menu management in `VenueMenu`
- staffing in `VenueAssign`
- referral dashboards in `VenueReferrals`

### Absolutely must be preserved
- All current routes and deep links
- All current data hooks and backend bindings
- Stripe Connect and withdrawal flows
- push-credit purchase + wallet synchronization behavior
- POS launch paths
- venue status/testing/go-live banner and subscription gate
- module preset + module enable/disable behavior

### Presentation-only vs logic-critical
Presentation-heavy (safe to re-skin):
- card layouts, spacing, visual hierarchy on `VenueHome`
- header composition and dashboard grouping
- quick action button placement

Logic-critical (do not alter in redesign step):
- hooks: orders, deliveries, reservations, wallet, modules, status, tier
- all `supabase.functions.invoke(...)` integrations
- localStorage venue identity assumptions (`jv_current_venue_id`, etc.)
- modals tied to real workflows (deal creation, subscription, withdrawal, connect)

## 2) Safe Upgrade Strategy

### Recommended approach: dual-mode home inside existing `/venue/home`
Implement a **dual-mode presentation layer**:
- `classic` mode = current `VenueHome` experience (unchanged)
- `control_center` mode = new premium Shopify-style revenue control center view

Why this is safest:
- preserves all routes and existing flows
- avoids destructive replacement risk
- enables gradual rollout and rollback
- allows optional toggle (owner preference), matching product requirement to potentially keep current home

### Rollout shape
1. Add non-destructive view-mode state (`classic`/`control_center`) persisted per venue/user.
2. Keep all current modules and action entry points identical.
3. Start with read-only premium presentation + quick links.
4. Only after validation, optionally make `control_center` default.

## 3) UI Architecture Plan (New Home, Same Logic)

Within `/venue/home`, new control-center surface should include:

1. Welcome/Status Header
- venue name, testing/live badge, tier badge, quick health signal
- go-live/testing state remains wired to current status hooks

2. Readiness / Setup Checklist
- data-driven checklist cards (connect payouts, menu completeness, delivery/reservations enabled, etc.)
- each checklist item links to existing route/module (no new backend behavior)

3. Revenue Snapshot
- today revenue, active orders, conversion indicators
- source data from existing order/wallet hooks only

4. Growth Opportunities
- suggestions cards: push deals, referral growth, vibe prompts
- all CTAs open existing modals/routes (`/venue/wallet`, DealCreator, `/venue/referrals`, etc.)

5. Live Activity
- reuse current activity feed concept from `VenueHome`
- keep order/delivery/reservation status semantics unchanged

6. Quick Access Grid
- tiles that route into existing modules
- preserve module gating via `isModuleEnabled`

## 4) Route and Layout Safety

- Keep all route paths unchanged.
- Keep `VenueLayout` as persistent shell (sidebar/top nav + outlet).
- Coexistence model:
  - single route: `/venue/home`
  - view mode switch changes home presentation component only
  - no route migration required
- Keep current route nesting under `/venue` exactly as-is.

## 5) Files Likely To Change

Primary UI orchestration:
- `src/pages/Venue/VenueHome.tsx`
- `src/components/Venue/VenueLayout.tsx`

Likely new non-destructive components:
- `src/components/Venue/VenueControlCenterHome.tsx` (new)
- `src/components/Venue/VenueHomeModeToggle.tsx` (new)
- `src/components/Venue/VenueReadinessChecklist.tsx` (new)
- `src/components/Venue/VenueRevenueSnapshot.tsx` (new)
- `src/components/Venue/VenueGrowthOpportunities.tsx` (new)

Potential state/config support (only if needed):
- `src/contexts/VenueModulesContext.tsx` (if view mode attached here)
- `src/config/venueModules.ts` (if adding default home mode by preset)

Optional persistence layer (later slice):
- migration for `venue_modules.home_view_mode` or similar

## 6) Risks

High risk areas not to touch in presentation pass:
1. Stripe/withdraw/connect flows
- `VenueSettings`, `connect-onboard`, `connect-refresh`, withdrawal verification

2. Wallet/push credits/deals purchase
- `VenueCredits`, `create-push-credits-checkout`, webhook crediting, sync polling behavior

3. Orders/delivery fulfillment lifecycle
- `VenueOrders`, `useVenueDeliveryOrders`, status transitions

4. POS workflow
- `/venue/pos/*` entry points and employee flows

5. Reservations/menu data behavior
- reservation status updates, menu CRUD pipelines

6. Venue-tier and testing/live status
- existing tier/status displays and go-live gating logic

7. Module gating and preset logic
- nav visibility and orb enablement from `venue_modules`

## 7) Recommendation (Best Next Implementation Slice)

### Single best next slice
Implement **home view-mode scaffolding only**:
- Add `VenueControlCenterHome` as a new presentation component.
- Add a local toggle in `/venue/home` between `classic` and `control_center`.
- Route all control-center actions to existing routes/modals/hooks (no backend changes).

Why:
- maximizes UX uplift with minimal backend risk
- preserves existing functionality completely
- enables A/B-like rollout without touching Stripe, referral, ranking, payout, or POS logic

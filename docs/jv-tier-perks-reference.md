# Joint Vibe Tier Perks Reference (Source of Truth)

## Tier Meaning Table

| Tier | Position | Meaning | Strategic Role |
|---|---:|---|---|
| Member | 1 | New/exploring user | Onboarding into nightlife graph |
| Bronze | 2 | Consistent participant | Early retention and activation |
| Silver | 3 | Reliable active user | Mid-funnel social + venue contribution |
| Gold | 4 | City-visible contributor | Growth and conversion acceleration |
| Diamond | 5 | High-impact influence user | Premium behavior and venue value |
| Platinum | 6 | Elite/unicorn market mover | Rare top influence, trust, and ROI signal |

## Rarity Targets

| Tier | Target Share (active 90d users) |
|---|---:|
| Bronze | 35-45% |
| Silver | 20-30% |
| Gold | 8-12% |
| Diamond | 2-4% |
| Platinum | 0.5-1.0% |

## Promotion Thresholds (Reference Model)

| Tier Reached | CS Threshold (90d) | Additional Gate Requirement |
|---|---:|---|
| Bronze | 1,000 | basic integrity pass |
| Silver | 3,000 | basic integrity pass |
| Gold | 8,000 | quality floor + integrity pass |
| Diamond | 20,000 | strong quality + influence gate + integrity pass |
| Platinum | 60,000 | exceptional quality + influence gate + strict integrity pass |

## Maintenance Thresholds (Reference Model)

| Tier Kept | CS Maintenance (90d) | Philosophy |
|---|---:|---|
| Bronze | 700 | easier than promotion |
| Silver | 2,100 | easier than promotion |
| Gold | 5,500 | easier than promotion |
| Diamond | 14,000 | easier than promotion, still high |
| Platinum | 45,000 | easier than promotion, still elite |

## Deal Access Timing (for 2-8h push windows)

| Tier | Access Delay |
|---|---|
| Platinum | Instant |
| Diamond | +1 to 2 min |
| Gold | +3 to 5 min |
| Silver | +7 to 10 min |
| Bronze | +12 to 20 min |
| Member | +20 to 30 min |

## Feed / Discovery Boost Reference

| Tier | Ranking Influence (relative) | Notes |
|---|---:|---|
| Member | 1.00x | baseline |
| Bronze | 1.05x | minor lift |
| Silver | 1.12x | noticeable lift |
| Gold | 1.22x | strong city visibility |
| Diamond | 1.35x | high influence lift |
| Platinum | 1.50x | capped by quality/relevance/integrity |

Important: Tier boost is a multiplier, not an override. Recency/relevance/quality still dominate.

## AI Usage Allowance Reference

| Tier | AI Daily Budget (example) | Notes |
|---|---|---|
| Member | Low | basic assistant usage |
| Bronze | Low+ | slightly expanded |
| Silver | Medium | sustained everyday use |
| Gold | Medium+ | stronger creative and ops use |
| Diamond | High | heavy creator/operator usage |
| Platinum | High+ | premium usage, still abuse-capped |

## Venue / Deal Access Privileges

| Tier | Privileges |
|---|---|
| Member | Standard offers after delay windows |
| Bronze | Earlier access than Member, better discovery frequency |
| Silver | Better offer quality and earlier release participation |
| Gold | Priority release windows, stronger premium offer exposure |
| Diamond | Near-instant release, premium campaign eligibility |
| Platinum | Instant top-priority release participation where enabled |

## Live / Post Exposure Benefits

| Tier | Exposure Behavior |
|---|---|
| Member | Baseline exposure |
| Bronze | Small uplift in local contexts |
| Silver | Better local-city distribution |
| Gold | Strong city distribution, especially checked-in/live |
| Diamond | Expanded premium distribution where quality supports |
| Platinum | Max strategic distribution with strict integrity checks |

## Featured / Discovery Eligibility

| Tier | Featured Eligibility |
|---|---|
| Member | selective, quality dependent |
| Bronze | selective, quality dependent |
| Silver | regular eligibility |
| Gold | high eligibility |
| Diamond | premium slots eligible |
| Platinum | top premium slots eligible (non-guaranteed) |

## Referral Benefits (User-side)

| Action | Tier Benefit Impact | Reward Policy |
|---|---|---|
| Referral link venue signup | medium-to-high | provisional until activation qualifies |
| Assisted/in-person venue onboarding | high | stronger reward potential after activation qualifies |
| Venue activation milestones achieved | very high | points and credits can finalize |

## Creator Economy / Reward Pool Eligibility (Direction)

| Tier | Eligibility Direction |
|---|---|
| Member/Bronze | not eligible initially |
| Silver | limited pilot eligibility |
| Gold | standard eligibility in later phases |
| Diamond | high eligibility |
| Platinum | top eligibility with integrity reviews |

## Diamond and Platinum Special Gates

| Tier | Required Non-Score Gates |
|---|---|
| Diamond | quality floor, influence proof, integrity/risk pass |
| Platinum | strict quality + integrity, sustained venue impact, anti-gaming pass |

## Existing System Alignment Notes
- Current user-tier logic is implemented via `record-tier-event` and `user_tiers`.
- Current baseline thresholds in code are lower and should be treated as implementation baseline, not final strategic target.
- Any threshold/perk change must also update architecture and checklist docs in same change.

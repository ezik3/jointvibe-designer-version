import { Shield, Crown, Sparkles } from "lucide-react";
import type { FounderEntitlement, CityProduct } from "@/types/foundersPass";
import { getRemainingCount } from "@/hooks/useFoundersPass";
import { useTranslation } from 'react-i18next';

interface FounderOwnershipCardProps {
  entitlement: FounderEntitlement;
  cityProduct?: CityProduct | null;
}

export function FounderOwnershipCard({ entitlement, cityProduct }: FounderOwnershipCardProps) {
  const { t } = useTranslation('common');
  const licenseNumber = entitlement.id.slice(0, 8).toUpperCase();
  const activatedDate = entitlement.start_at
    ? new Date(entitlement.start_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : new Date(entitlement.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const remaining = cityProduct ? getRemainingCount(cityProduct) : null;
  const totalSupply = cityProduct?.total_supply || 1000;

  const benefits = [
    "Permanent Platinum Status",
    "Priority Support",
    "60% Activation Rewards (12mo)",
    "Founder Crown Badge",
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-zinc-900 via-zinc-800/80 to-zinc-900">
      {/* Shimmer border overlay */}
      <div className="absolute inset-0 rounded-2xl border border-yellow-400/10 animate-tier-shimmer pointer-events-none" />
      
      {/* Subtle gold/violet gradient glow */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-yellow-500/10 via-violet-500/5 to-yellow-500/10 blur-sm pointer-events-none" />

      <div className="relative p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500/20 to-amber-600/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-yellow-400" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.15em] text-yellow-400/80 font-semibold">
              City Founder License
            </span>
          </div>
          <Sparkles className="w-4 h-4 text-yellow-500/40" />
        </div>

        {/* City */}
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-yellow-400" />
          <h3 className="text-lg font-bold text-foreground">
            {entitlement.city_product?.city || "Unknown City"}
            {entitlement.city_product?.country && (
              <span className="text-muted-foreground font-normal text-sm ml-1">
                , {entitlement.city_product.country}
              </span>
            )}
          </h3>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">License #</span>
            <p className="text-foreground font-mono font-semibold text-xs">FND-{licenseNumber}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Status</span>
            <p className="text-emerald-400 font-semibold text-xs">
              {entitlement.status === "active" ? "✓ Active — Lifetime" : "⏳ Pending Activation"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Tier</span>
            <p className="text-foreground font-semibold text-xs">Platinum City Access</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Activated</span>
            <p className="text-foreground font-semibold text-xs">{activatedDate}</p>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-700/40">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
            Benefits Unlocked
          </p>
          <ul className="space-y-1">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-2 text-xs text-foreground/80">
                <span className="text-yellow-400 text-[10px]">◆</span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Remaining supply */}
        {remaining !== null && (
          <div className="flex items-center justify-between pt-1 border-t border-zinc-700/30">
            <span className="text-[10px] text-muted-foreground">
              ◆ {remaining.toLocaleString()} of {totalSupply.toLocaleString()} remaining
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

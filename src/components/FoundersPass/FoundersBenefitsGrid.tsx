import { Crown, Clock, Building2, Gift, Star, BadgeCheck, Zap } from 'lucide-react';
import type { FounderBenefit } from '@/types/foundersPass';
import { useTranslation } from 'react-i18next';

const ICON_MAP: Record<string, React.ElementType> = {
  Crown, Clock, Building2, Gift, Star, BadgeCheck, Zap,
};

interface FoundersBenefitsGridProps {
  benefits: FounderBenefit[];
  title?: string;
  subtitle?: string;
}

export function FoundersBenefitsGrid({ benefits, title, subtitle }: FoundersBenefitsGridProps) {
  const { t } = useTranslation('common');
  return (
    <section className="py-12">
      {(title || subtitle) && (
        <div className="mx-auto mb-10 max-w-2xl text-center">
          {title && <h2 className="mb-3 text-2xl font-bold text-foreground md:text-3xl">{title}</h2>}
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {benefits.map((benefit) => {
          const Icon = ICON_MAP[benefit.icon] || Star;
          return (
            <div key={benefit.title} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1 font-semibold text-foreground">{benefit.title}</h3>
              <p className="text-sm text-muted-foreground">{benefit.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

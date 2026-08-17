import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Crown, Sparkles, Shield, Zap } from 'lucide-react';
import { FoundersBenefitsGrid } from '@/components/FoundersPass/FoundersBenefitsGrid';
import { FoundersFAQ } from '@/components/FoundersPass/FoundersFAQ';
import { VENUE_BENEFITS, VENUE_FAQS } from '@/types/foundersPass';
import { useTranslation } from 'react-i18next';

export default function VenueFoundersLanding() {
  const { t } = useTranslation('venue');
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
              <Sparkles className="h-4 w-4" /><span>Limited Venue Licenses • Lifetime Access</span>
            </div>
            <h1 className="mb-5 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              Become a <span className="text-primary">Venue Founder</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground">
              Secure permanent Platinum status, priority listing, and a Founder Crown badge for your venue. Limited to 1,000 per city.
            </p>
            <div className="mb-8 inline-flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-8 py-4">
              <div className="flex items-baseline gap-2">
                <span className="text-lg text-muted-foreground">Starting from</span>
                <span className="text-4xl font-bold text-primary">$500</span>
              </div>
              <span className="text-sm text-muted-foreground">One-time • Lifetime</span>
            </div>
            <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/venue/founders/cities"><Button size="lg" className="px-8"><Crown className="mr-2 h-5 w-5" />Claim Your City</Button></Link>
            </div>
          </div>
        </div>
      </section>
      <div className="container mx-auto px-4">
        <FoundersBenefitsGrid benefits={VENUE_BENEFITS} title="Venue Founder Benefits" subtitle="One purchase. Permanent advantages." />
      </div>
      <div className="container mx-auto px-4"><FoundersFAQ faqs={VENUE_FAQS} /></div>
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <Link to="/venue/founders/cities"><Button size="lg"><Crown className="mr-2 h-5 w-5" />Browse Cities</Button></Link>
        </div>
      </section>
    </div>
  );
}

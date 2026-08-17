import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Crown, Sparkles, Shield, Zap, Globe, ArrowLeft } from 'lucide-react';
import { FoundersBenefitsGrid } from '@/components/FoundersPass/FoundersBenefitsGrid';
import { FoundersFAQ } from '@/components/FoundersPass/FoundersFAQ';
import { USER_BENEFITS, USER_FAQS } from '@/types/foundersPass';
import { useCityProducts } from '@/hooks/useFoundersPass';
import { useTranslation } from 'react-i18next';

export default function FoundersPassLanding() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const userCountry = localStorage.getItem('jv_user_country') || '';
  const { data: allProducts } = useCityProducts('user');
  const countryHasProducts = allProducts?.some(p => p.country === userCountry);
  const noCountrySet = !userCountry;

  // If country has no products and user has a country set, show not-available
  if (!noCountrySet && allProducts && !countryHasProducts) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative">
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="text-center max-w-md px-4">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Globe className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="mb-3 text-2xl font-bold text-foreground">Not Available Yet</h1>
          <p className="text-muted-foreground">
            City Founders Licenses aren't available in {userCountry} yet. We're expanding to new countries regularly — check back soon!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 md:py-28">
        <button onClick={() => navigate(-1)} className="absolute top-6 left-4 z-10 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
              <Sparkles className="h-4 w-4" />
              <span>Limited City Licenses • Lifetime Access</span>
            </div>
            <h1 className="mb-5 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              Become a <span className="text-primary">City Founder</span> Today
            </h1>
            <p className="mb-8 text-lg text-muted-foreground">
              Secure your exclusive City Founders License. Pre-register venues, earn activation rewards, and unlock Platinum status. Limited to 1,000 per city.
            </p>
            <div className="mb-8 inline-flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-8 py-4">
              <div className="flex items-baseline gap-2">
                <span className="text-lg text-muted-foreground">Starting from</span>
                <span className="text-4xl font-bold text-primary">$500</span>
              </div>
              <span className="text-sm text-muted-foreground">One-time purchase • Lifetime license</span>
            </div>
            <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/app/founders/cities">
                <Button size="lg" className="px-8">
                  <Crown className="mr-2 h-5 w-5" />
                  Claim Your City
                </Button>
              </Link>
              <a href="#benefits">
                <Button size="lg" variant="outline">View Benefits</Button>
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-500" /><span>Secure Checkout</span></div>
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><span>Instant Activation</span></div>
              <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-primary" /><span>Lifetime Access</span></div>
            </div>
          </div>
        </div>
      </section>

      <div id="benefits" className="container mx-auto px-4">
        <FoundersBenefitsGrid
          benefits={USER_BENEFITS}
          title="Everything Included in Your City License"
          subtitle="One purchase unlocks lifetime access to your city. No recurring fees."
        />
      </div>

      <div className="container mx-auto px-4">
        <FoundersFAQ faqs={USER_FAQS} />
      </div>

      {/* Bottom CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">Ready to become a Founder?</h2>
          <Link to="/app/founders/cities">
            <Button size="lg"><Crown className="mr-2 h-5 w-5" />Browse Cities</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

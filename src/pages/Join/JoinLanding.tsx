import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, Store, PartyPopper, Calculator, ArrowRight, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReferralCode } from '@/hooks/useReferralCode';
import { useTranslation } from 'react-i18next';

export default function JoinLanding() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { captureReferralFromURL, validateReferralCode } = useReferralCode();
  
  const [referrerValid, setReferrerValid] = useState<boolean | null>(null);
  const refCode = searchParams.get('ref');

  useEffect(() => {
    // Capture and validate the referral code
    captureReferralFromURL();
    
    if (refCode) {
      validateReferralCode(refCode).then(result => {
        setReferrerValid(result.valid);
      });
    }
  }, [refCode, captureReferralFromURL, validateReferralCode]);

  const handleVenueSignup = () => {
    // Referral already stored via captureReferralFromURL
    navigate('/venue/signup');
  };

  const handleCalculateSavings = () => {
    // Pass ref through to calculator
    navigate(`/venue/savings-calculator${refCode ? `?ref=${refCode}` : ''}`);
  };

  const handleUserSignup = () => {
    navigate('/auth');
  };

  return (
    <div className="min-h-screen w-full bg-background overflow-hidden relative flex items-center justify-center p-4">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="relative z-10 w-full max-w-4xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center neon-glow">
                <Sparkles className="w-9 h-9 text-primary-foreground" />
              </div>
              <div className="absolute -inset-1 bg-gradient-to-br from-primary to-accent rounded-2xl blur opacity-40" />
            </div>
          </div>
          <h1 className="text-5xl lg:text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-3">
            Joint Vibe
          </h1>
          <p className="text-xl text-muted-foreground">You've been invited to join!</p>
        </div>

        {/* Referral Badge */}
        {refCode && (
          <div className="flex justify-center mb-8">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
              referrerValid === true 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : referrerValid === false
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {referrerValid === true ? (
                <>
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">Referred with code: {refCode}</span>
                </>
              ) : referrerValid === false ? (
                <span className="text-sm">Invalid referral code</span>
              ) : (
                <>
                  <Users className="w-4 h-4 animate-pulse" />
                  <span className="text-sm font-medium">Verifying referral...</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main CTA Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Venue Card */}
          <div className="glass rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
            
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6">
                <Store className="w-8 h-8 text-primary" />
              </div>
              
              <h2 className="text-2xl font-bold text-foreground mb-2">I run a venue</h2>
              <p className="text-muted-foreground mb-6">Join the platform that saves you thousands in payment fees</p>
              
              <div className="space-y-3">
                <Button 
                  onClick={handleVenueSignup}
                  className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground font-semibold rounded-xl group"
                >
                  Register Your Venue
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                
                <Button 
                  onClick={handleCalculateSavings}
                  variant="outline"
                  className="w-full h-12 border-primary/30 text-primary hover:bg-primary/10 rounded-xl"
                >
                  <Calculator className="w-5 h-5 mr-2" />
                  Calculate Your Savings First
                </Button>
              </div>
            </div>
          </div>

          {/* User Card */}
          <div className="glass rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-accent/10 rounded-full blur-3xl" />
            
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center mb-6">
                <PartyPopper className="w-8 h-8 text-accent" />
              </div>
              
              <h2 className="text-2xl font-bold text-foreground mb-2">I'm here to party</h2>
              <p className="text-muted-foreground mb-6">Discover venues, connect with people, and enjoy the nightlife</p>
              
              <Button 
                onClick={handleUserSignup}
                variant="outline"
                className="w-full h-12 border-accent/30 text-accent hover:bg-accent/10 rounded-xl group"
              >
                Sign Up as a User
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 text-center">Why Venues Love Joint Vibe</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: '$0', label: 'Transaction Fees', sublabel: 'vs 2.9% + $0.30' },
              { value: '90%', label: 'Driver Payout', sublabel: 'Not 70% like others' },
              { value: '$25', label: 'Referral Reward', sublabel: 'Per venue signup' },
              { value: '24/7', label: 'Support', sublabel: 'Always here for you' },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl font-bold text-primary">{item.value}</div>
                <div className="text-sm text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.sublabel}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-muted-foreground text-sm">
            Already have an account?{' '}
            <button onClick={() => navigate('/auth')} className="text-primary hover:underline font-medium">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

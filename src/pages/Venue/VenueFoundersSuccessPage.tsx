import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle, Mail, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function VenueFoundersSuccess() {
  const { t } = useTranslation('venue');
  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12">
      <div className="container mx-auto px-4 max-w-lg text-center">
        <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
        </div>
        <h1 className="mb-4 text-3xl font-bold text-foreground">Payment Successful!</h1>
        <p className="mb-8 text-muted-foreground">Your Venue Founders License claim code is on its way!</p>
        <div className="mb-8 rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-center gap-2 text-primary">
            <Mail className="h-5 w-5" /><span className="font-medium">Check Your Email</span>
          </div>
          <p className="text-sm text-muted-foreground">Enter your claim code in the app to activate your Venue Founders License.</p>
        </div>
        <Link to="/venue/founders/claim">
          <Button size="lg">Claim Your Pass<ArrowRight className="ml-2 h-4 w-4" /></Button>
        </Link>
      </div>
    </div>
  );
}

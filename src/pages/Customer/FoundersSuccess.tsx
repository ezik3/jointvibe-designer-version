import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle, Mail, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function FoundersSuccess() {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12">
      <div className="container mx-auto px-4 max-w-lg text-center">
        <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
        </div>
        <h1 className="mb-4 text-3xl font-bold text-foreground">Payment Successful!</h1>
        <p className="mb-8 text-muted-foreground">
          Your Founders Pass claim code is on its way!
        </p>
        <div className="mb-8 rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-center gap-2 text-primary">
            <Mail className="h-5 w-5" /><span className="font-medium">Check Your Email</span>
          </div>
          <p className="text-sm text-muted-foreground">
            We've sent your unique claim code to your email. Use it to activate your pass.
          </p>
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground">Next Steps:</h3>
          <ol className="space-y-3 text-left text-sm">
            {['Sign in to Joint Vibe', 'Go to Claim page', 'Enter your claim code'].map((step, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                <p className="text-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-8">
          <Link to="/app/founders/claim">
            <Button size="lg">
              Claim Your Pass<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

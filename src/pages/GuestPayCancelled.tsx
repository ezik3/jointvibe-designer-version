import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from 'react-i18next';

export default function GuestPayCancelled() {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen bg-gradient-to-b from-destructive/10 to-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-8 pb-6 space-y-6">
          {/* Cancel Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center">
              <XCircle className="w-12 h-12 text-destructive" />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Payment Cancelled</h1>
            <p className="text-muted-foreground">
              Your payment was not completed. You can close this window and try again.
            </p>
          </div>

          {/* Close Button */}
          <Button 
            variant="outline" 
            onClick={() => window.close()}
            className="w-full"
          >
            Close Window
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
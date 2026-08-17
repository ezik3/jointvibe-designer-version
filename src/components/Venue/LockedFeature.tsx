import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useVenueModules } from "@/hooks/useVenueModules";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface LockedFeatureProps {
  feature: string;
  title: string;
  description: string;
  benefits?: string[];
}

export default function LockedFeature({ 
  feature, 
  title, 
  description,
  benefits = []
}: LockedFeatureProps) {
  const { t } = useTranslation('venue');
  const { enableModule } = useVenueModules();

  const handleEnable = async () => {
    try {
      await enableModule(feature);
      toast.success(`${title} has been enabled!`);
      // Force reload to update navigation
      window.location.reload();
    } catch (error) {
      console.error('Failed to enable feature:', error);
      toast.error('Failed to enable feature. Please try again.');
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <Card className="max-w-md w-full glass border-border">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          
          <h2 className="text-2xl font-bold mb-2">{title}</h2>
          <p className="text-muted-foreground mb-6">{description}</p>
          
          {benefits.length > 0 && (
            <div className="text-left mb-6 space-y-2">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          )}
          
          <Button 
            onClick={handleEnable}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Enable {title}
          </Button>
          
          <p className="text-xs text-muted-foreground mt-4">
            You can disable this feature anytime in Settings → Features
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, Tag, Image as ImageIcon } from 'lucide-react';
import { useVenueDealsLibrary } from '@/hooks/useVenueDealsLibrary';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface DealsLibraryProps {
  venueId: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-yellow-500/20 text-yellow-400',
  saved: 'bg-blue-500/20 text-blue-400',
  published: 'bg-green-500/20 text-green-400',
  expired: 'bg-zinc-500/20 text-zinc-400',
};

const DealsLibrary = ({ venueId }: DealsLibraryProps) => {
  const { t } = useTranslation('venue');
  const { deals, loading, cloneDeal } = useVenueDealsLibrary(venueId);

  const handleUseAgain = async (dealId: string) => {
    try {
      await cloneDeal(dealId);
      toast.success('Deal cloned as draft — edit and publish when ready');
    } catch {
      toast.error('Failed to clone deal');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-8 text-center">
          <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No deals yet. Create your first deal via Send a Vibe or the Deal Creator.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {deals.map(deal => (
        <Card key={deal.id} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {deal.media_url ? (
                  <img src={deal.media_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-foreground truncate">{deal.headline || 'Untitled Deal'}</h4>
                  <Badge className={`text-xs ${statusColors[deal.status] || statusColors.draft}`}>
                    {deal.status}
                  </Badge>
                </div>
                {deal.discount_text && (
                  <p className="text-primary text-sm font-medium">{deal.discount_text}</p>
                )}
                {deal.last_used_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last used {formatDistanceToNow(new Date(deal.last_used_at), { addSuffix: true })}
                  </p>
                )}
              </div>

              {/* Actions */}
              {(deal.status === 'saved' || deal.status === 'draft' || deal.status === 'expired') && (
                <Button size="sm" variant="outline" onClick={() => handleUseAgain(deal.id)} className="flex-shrink-0">
                  <Copy className="w-4 h-4 mr-1" /> Use Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DealsLibrary;

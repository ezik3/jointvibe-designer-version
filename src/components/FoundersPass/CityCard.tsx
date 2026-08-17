import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CityProduct, PassType } from '@/types/foundersPass';
import { getRemainingCount, getScarcityLevel, formatFoundersPrice } from '@/hooks/useFoundersPass';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface CityCardProps {
  city: CityProduct;
  passType: PassType;
}

export function CityCard({ city, passType }: CityCardProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const remaining = getRemainingCount(city);
  const scarcity = getScarcityLevel(remaining, city.total_supply);
  const isSoldOut = remaining === 0;
  const routePrefix = passType === 'venue' ? '/venue/founders' : '/app/founders';

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30",
      isSoldOut && "opacity-60"
    )}>
      <Badge 
        variant="outline" 
        className={cn(
          "mb-3",
          city.tier === 'A' && "border-primary text-primary",
          city.tier === 'B' && "border-muted-foreground",
        )}
      >
        Tier {city.tier}
      </Badge>

      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <MapPin className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{city.city}</h3>
          <p className="text-sm text-muted-foreground">{city.country}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="text-2xl font-bold text-foreground">{formatFoundersPrice(city.price_cents)}</span>
          <span className="ml-1 text-xs text-muted-foreground">one-time</span>
        </div>
        <div className="text-right">
          {isSoldOut ? (
            <span className="text-sm font-medium text-destructive">Sold Out</span>
          ) : (
            <>
              <span className={cn(
                "text-lg font-semibold",
                scarcity === 'low' && "text-destructive",
                scarcity === 'medium' && "text-yellow-500",
                scarcity === 'high' && "text-emerald-500"
              )}>
                {remaining}
              </span>
              <span className="text-sm text-muted-foreground"> left</span>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            scarcity === 'low' && "bg-destructive",
            scarcity === 'medium' && "bg-yellow-500",
            scarcity === 'high' && "bg-emerald-500"
          )}
          style={{ width: `${(remaining / city.total_supply) * 100}%` }}
        />
      </div>

      <Button
        className="w-full"
        disabled={isSoldOut}
        onClick={() => navigate(`${routePrefix}/checkout/${city.slug}`)}
      >
        {isSoldOut ? 'Sold Out' : 'Get License'}
      </Button>
    </div>
  );
}

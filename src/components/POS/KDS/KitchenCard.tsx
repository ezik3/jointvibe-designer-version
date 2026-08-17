import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import TierBadge from "@/components/Tier/TierBadge";
import type { TierName } from "@/hooks/useUserTier";
import { useTranslation } from 'react-i18next';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  image_url?: string;
  notes?: string;
  modifiers?: any[];
}

interface KitchenCardProps {
  order: {
    id: string;
    order_number: number;
    table_number?: string;
    customer_name?: string;
    customer_tier?: TierName;
    status: string;
    station: string;
    priority: string;
    notes?: string;
    created_at: string;
    order_items?: OrderItem[];
  };
  onStatusChange: (orderId: string, status: string) => void;
  layout?: 'compact' | 'detailed';
}

export default function KitchenCard({ order, onStatusChange, layout = 'detailed' }: KitchenCardProps) {
  const { t } = useTranslation('pos');
  const [expanded, setExpanded] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const created = new Date(order.created_at);
      const now = new Date();
      setElapsed(Math.floor((now.getTime() - created.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [order.created_at]);

  const getPriorityColor = () => {
    if (elapsed > 600) return "bg-red-500/20 border-red-500";  // 10+ min
    if (elapsed > 300) return "bg-yellow-500/20 border-yellow-500";  // 5-10 min
    return "bg-green-500/20 border-green-500";  // < 5 min
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'preparing': return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      case 'ready': return 'bg-green-500/20 text-green-500 border-green-500/30';
      default: return 'bg-muted';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (layout === 'compact') {
    return (
      <Card className={`glass border-2 ${getPriorityColor()} transition-all hover:scale-102`}>
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-xl font-bold">#{order.order_number}</h3>
              {order.table_number && <p className="text-sm text-muted-foreground">Table {order.table_number}</p>}
              {order.customer_name && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-muted-foreground">{order.customer_name}</span>
                  {order.customer_tier && order.customer_tier !== 'member' && (
                    <TierBadge tier={order.customer_tier} size="sm" showLabel={false} />
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-lg font-bold">{formatTime(elapsed)}</span>
            </div>
          </div>

          <div className="flex gap-2 mb-2">
            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
            <Badge variant="outline">{order.station}</Badge>
          </div>

          {order.status === 'pending' && (
            <Button onClick={() => onStatusChange(order.id, 'preparing')} className="w-full" size="sm">
              Start Preparing
            </Button>
          )}
          {order.status === 'preparing' && (
            <Button onClick={() => onStatusChange(order.id, 'ready')} className="w-full neon-glow" size="sm">
              Mark Ready
            </Button>
          )}
          {order.status === 'ready' && (
            <Button onClick={() => onStatusChange(order.id, 'served')} className="w-full" variant="outline" size="sm">
              Complete
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`glass border-2 ${getPriorityColor()} transition-all hover:scale-102`}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-2xl font-bold">Order #{order.order_number}</h3>
            {order.table_number && <p className="text-muted-foreground">Table {order.table_number}</p>}
            {order.customer_name && (
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm text-muted-foreground">{order.customer_name}</p>
                {order.customer_tier && order.customer_tier !== 'member' && (
                  <TierBadge tier={order.customer_tier} size="sm" />
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 bg-background/50 px-4 py-2 rounded-lg">
            <Clock className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold">{formatTime(elapsed)}</span>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
          <Badge variant="outline">{order.station}</Badge>
          <Badge variant="outline">{order.priority}</Badge>
        </div>

        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full justify-between"
          >
            <span>Items ({order.order_items?.length || 0})</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {expanded && (
            <div className="space-y-2 mt-2">
              {order.order_items?.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-background/30 rounded">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name} loading="lazy" className="w-12 h-12 rounded object-cover" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {item.quantity}x {item.name}
                    </p>
                    {item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {order.notes && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
            <p className="text-sm font-medium">Notes: {order.notes}</p>
          </div>
        )}

        <div className="flex gap-2">
          {order.status === 'pending' && (
            <Button onClick={() => onStatusChange(order.id, 'preparing')} className="flex-1">
              Start Preparing
            </Button>
          )}
          {order.status === 'preparing' && (
            <Button onClick={() => onStatusChange(order.id, 'ready')} className="flex-1 neon-glow">
              Mark Ready
            </Button>
          )}
          {order.status === 'ready' && (
            <Button onClick={() => onStatusChange(order.id, 'served')} className="flex-1" variant="outline">
              Complete Order
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

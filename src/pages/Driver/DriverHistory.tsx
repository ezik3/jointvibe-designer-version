import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, DollarSign, Clock, MapPin, Star, Calendar, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';

interface DeliveryHistory {
  id: string;
  pickup_address: string;
  delivery_address: string;
  driver_earnings: number;
  status: string;
  created_at: string;
  actual_delivery_time: string;
  customer_rating: number;
  venue?: {
    name: string;
  };
}

const DriverHistory = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<DeliveryHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalDeliveries: 0,
    avgRating: 0
  });

  useEffect(() => {
    if (!user) return;
    
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('food_delivery_orders')
        .select('*')
        .eq('driver_id', user.id)
        .in('status', ['delivered', 'completed'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        // Fetch venue names
        const venueIds = [...new Set(data.map(d => d.venue_id))];
        const { data: venues } = await supabase
          .from('venues')
          .select('id, name')
          .in('id', venueIds);
        
        const venueMap = new Map(venues?.map(v => [v.id, v.name]) || []);
        
        const deliveriesWithVenues = data.map(d => ({
          ...d,
          venue: { name: venueMap.get(d.venue_id) || 'Restaurant' }
        }));
        
        setDeliveries(deliveriesWithVenues as DeliveryHistory[]);
        
        const totalEarnings = data.reduce((sum, d) => sum + (Number(d.driver_earnings) || 0), 0);
        const ratings = data.filter(d => d.customer_rating).map(d => Number(d.customer_rating));
        const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 5;
        
        setStats({
          totalEarnings,
          totalDeliveries: data.length,
          avgRating
        });
      }
      setLoading(false);
    };

    fetchHistory();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Delivery History</h1>
        <p className="text-muted-foreground text-sm">Your past deliveries and earnings</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-card border-border p-3 text-center">
            <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">${stats.totalEarnings.toFixed(2)}</p>
            <p className="text-muted-foreground text-xs">Total Earned</p>
          </Card>
          <Card className="bg-card border-border p-3 text-center">
            <Package className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{stats.totalDeliveries}</p>
            <p className="text-muted-foreground text-xs">Deliveries</p>
          </Card>
          <Card className="bg-card border-border p-3 text-center">
            <Star className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{stats.avgRating.toFixed(1)}</p>
            <p className="text-muted-foreground text-xs">Avg Rating</p>
          </Card>
        </div>

        {/* Delivery List */}
        {deliveries.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No delivery history yet</p>
            <p className="text-muted-foreground text-sm">Complete deliveries to see them here</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {deliveries.map((delivery, index) => (
              <motion.div
                key={delivery.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="bg-card border-border p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-foreground font-semibold">{delivery.venue?.name || 'Restaurant'}</p>
                      <p className="text-muted-foreground text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(delivery.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-green-400">
                        +${Number(delivery.driver_earnings).toFixed(2)}
                      </p>
                      {delivery.customer_rating && (
                        <div className="flex items-center gap-1 justify-end">
                          <Star className="w-3 h-3 text-yellow-400" />
                          <span className="text-muted-foreground text-sm">{delivery.customer_rating}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{delivery.delivery_address}</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverHistory;

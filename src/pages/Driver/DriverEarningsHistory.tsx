import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  DollarSign, TrendingUp, Calendar, Package, Car, 
  ChevronLeft, ArrowUpRight, ArrowDownRight, Clock,
  Wallet, CreditCard, Star
} from 'lucide-react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type TimeRange = 'daily' | 'weekly' | 'monthly';

interface EarningsData {
  date: string;
  deliveries: number;
  rides: number;
  total: number;
}

interface CompletedOrder {
  id: string;
  type: 'delivery' | 'ride';
  earnings: number;
  completedAt: string;
  pickup: string;
  dropoff: string;
  rating?: number;
}

const DriverEarningsHistory = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<TimeRange>('weekly');
  const [loading, setLoading] = useState(true);
  const [earningsData, setEarningsData] = useState<EarningsData[]>([]);
  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([]);
  const [totalStats, setTotalStats] = useState({
    totalEarnings: 0,
    totalDeliveries: 0,
    totalRides: 0,
    avgRating: 5.0,
  });

  // Fetch earnings data
  useEffect(() => {
    if (!user) return;

    const fetchEarnings = async () => {
      setLoading(true);

      // Calculate date range
      let startDate: Date;
      const endDate = new Date();

      switch (timeRange) {
        case 'daily':
          startDate = subDays(endDate, 7);
          break;
        case 'weekly':
          startDate = subWeeks(endDate, 4);
          break;
        case 'monthly':
          startDate = subMonths(endDate, 6);
          break;
      }

      // Fetch completed deliveries
      const { data: deliveries } = await supabase
        .from('food_delivery_orders')
        .select('*')
        .eq('driver_id', user.id)
        .eq('status', 'delivered')
        .gte('actual_delivery_time', startDate.toISOString())
        .order('actual_delivery_time', { ascending: false });

      // Fetch completed rides
      const { data: rides } = await supabase
        .from('ride_bookings')
        .select('*')
        .eq('driver_id', user.id)
        .eq('status', 'completed')
        .gte('updated_at', startDate.toISOString())
        .order('updated_at', { ascending: false });

      // Process data for charts
      const dataMap = new Map<string, EarningsData>();
      
      // Process deliveries
      (deliveries || []).forEach((d: any) => {
        const dateKey = timeRange === 'daily' 
          ? format(new Date(d.actual_delivery_time), 'MMM dd')
          : timeRange === 'weekly'
            ? `Week ${format(new Date(d.actual_delivery_time), 'w')}`
            : format(new Date(d.actual_delivery_time), 'MMM yyyy');
        
        const existing = dataMap.get(dateKey) || { date: dateKey, deliveries: 0, rides: 0, total: 0 };
        existing.deliveries += d.driver_earnings || 0;
        existing.total += d.driver_earnings || 0;
        dataMap.set(dateKey, existing);
      });

      // Process rides
      (rides || []).forEach((r: any) => {
        const dateKey = timeRange === 'daily'
          ? format(new Date(r.updated_at), 'MMM dd')
          : timeRange === 'weekly'
            ? `Week ${format(new Date(r.updated_at), 'w')}`
            : format(new Date(r.updated_at), 'MMM yyyy');
        
        const existing = dataMap.get(dateKey) || { date: dateKey, deliveries: 0, rides: 0, total: 0 };
        existing.rides += r.driver_earnings || 0;
        existing.total += r.driver_earnings || 0;
        dataMap.set(dateKey, existing);
      });

      setEarningsData(Array.from(dataMap.values()));

      // Create completed orders list
      const orders: CompletedOrder[] = [
        ...(deliveries || []).map((d: any) => ({
          id: d.id,
          type: 'delivery' as const,
          earnings: d.driver_earnings || 0,
          completedAt: d.actual_delivery_time,
          pickup: d.pickup_address || 'Restaurant',
          dropoff: d.delivery_address,
          rating: d.driver_rating,
        })),
        ...(rides || []).map((r: any) => ({
          id: r.id,
          type: 'ride' as const,
          earnings: r.driver_earnings || 0,
          completedAt: r.updated_at,
          pickup: r.pickup_address,
          dropoff: r.destination_address,
          rating: r.driver_rating,
        })),
      ].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

      setCompletedOrders(orders.slice(0, 20));

      // Calculate totals
      const totalDeliveryEarnings = (deliveries || []).reduce((sum: number, d: any) => sum + (d.driver_earnings || 0), 0);
      const totalRideEarnings = (rides || []).reduce((sum: number, r: any) => sum + (r.driver_earnings || 0), 0);
      
      const allRatings = [
        ...(deliveries || []).filter((d: any) => d.driver_rating).map((d: any) => d.driver_rating),
        ...(rides || []).filter((r: any) => r.driver_rating).map((r: any) => r.driver_rating),
      ];
      const avgRating = allRatings.length > 0 
        ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length 
        : 5.0;

      setTotalStats({
        totalEarnings: totalDeliveryEarnings + totalRideEarnings,
        totalDeliveries: (deliveries || []).length,
        totalRides: (rides || []).length,
        avgRating,
      });

      setLoading(false);
    };

    fetchEarnings();
  }, [user, timeRange]);

  // Pie chart data
  const pieData = useMemo(() => {
    const deliveryTotal = earningsData.reduce((sum, d) => sum + d.deliveries, 0);
    const rideTotal = earningsData.reduce((sum, d) => sum + d.rides, 0);
    return [
      { name: 'Deliveries', value: deliveryTotal, color: '#16d9e8' },
      { name: 'Rides', value: rideTotal, color: '#717c86' },
    ];
  }, [earningsData]);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/driver/profile')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Earnings History</h1>
          <p className="text-muted-foreground text-sm">Track your income over time</p>
        </div>
      </div>

      {/* Time Range Tabs */}
      <div className="flex gap-2 mb-6">
        {(['daily', 'weekly', 'monthly'] as TimeRange[]).map((range) => (
          <Button
            key={range}
            variant={timeRange === range ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange(range)}
          >
            {range.charAt(0).toUpperCase() + range.slice(1)}
          </Button>
        ))}
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-primary" />
            <span className="text-muted-foreground text-sm">Total Earnings</span>
          </div>
          <p className="text-2xl font-bold text-foreground">${totalStats.totalEarnings.toFixed(2)}</p>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-cyan" />
            <span className="text-muted-foreground text-sm">Deliveries</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalStats.totalDeliveries}</p>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Car className="w-5 h-5 text-primary" />
            <span className="text-muted-foreground text-sm">Rides</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalStats.totalRides}</p>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-yellow-400" />
            <span className="text-muted-foreground text-sm">Avg Rating</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalStats.avgRating.toFixed(1)}</p>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        {/* Area Chart - Earnings Over Time */}
        <Card className="bg-card border-border p-4 md:col-span-2">
          <h3 className="text-foreground font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan" />
            Earnings Trend
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={earningsData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16d9e8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#16d9e8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a323a" />
                <XAxis dataKey="date" stroke="#717c86" fontSize={12} />
                <YAxis stroke="#717c86" fontSize={12} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#11161b', border: '1px solid #2a323a', borderRadius: '6px' }}
                  labelStyle={{ color: '#f4f7f8' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Earnings']}
                />
                <Area 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#16d9e8" 
                  fillOpacity={1} 
                  fill="url(#colorTotal)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pie Chart - Breakdown */}
        <Card className="bg-card border-border p-4">
          <h3 className="text-foreground font-bold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Earnings Split
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#11161b', border: '1px solid #2a323a', borderRadius: '6px' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground text-sm">{item.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bar Chart - Comparison */}
      <Card className="bg-card border-border p-4 mb-6">
        <h3 className="text-foreground font-bold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-green-400" />
          Deliveries vs Rides
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={earningsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a323a" />
              <XAxis dataKey="date" stroke="#717c86" fontSize={12} />
              <YAxis stroke="#717c86" fontSize={12} tickFormatter={(v) => `$${v}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#11161b', border: '1px solid #2a323a', borderRadius: '6px' }}
                labelStyle={{ color: '#f4f7f8' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
              />
              <Bar dataKey="deliveries" fill="#16d9e8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="rides" fill="#717c86" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Recent Completed Orders */}
      <Card className="bg-card border-border p-4">
        <h3 className="text-foreground font-bold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          Recent Completed Orders
        </h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-cyan/30 border-t-cyan rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground mt-2">{t("common:app.loading")}</p>
            </div>
          ) : completedOrders.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No completed orders yet</p>
          ) : (
            completedOrders.map((order) => (
              <div 
                key={order.id}
                className="flex items-center justify-between p-3 bg-muted rounded-md border border-border"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    order.type === 'delivery' ? 'bg-primary/10' : 'bg-muted'
                  }`}>
                    {order.type === 'delivery' ? (
                      <Package className="w-5 h-5 text-cyan" />
                    ) : (
                      <Car className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium truncate max-w-[150px]">
                      {order.dropoff}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {format(new Date(order.completedAt), 'MMM dd, h:mm a')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-green-400 font-bold">${order.earnings.toFixed(2)}</p>
                  {order.rating && (
                    <div className="flex items-center gap-1 justify-end">
                      <Star className="w-3 h-3 text-yellow-400" />
                      <span className="text-muted-foreground text-xs">{order.rating}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

export default DriverEarningsHistory;

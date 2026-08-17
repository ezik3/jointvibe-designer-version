import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LayoutGrid, List, Columns3, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import KitchenCard from "@/components/POS/KDS/KitchenCard";
import { useTranslation } from 'react-i18next';

type LayoutMode = 'compact' | 'grid' | 'multi';

export default function KitchenEnhanced() {
  const { t } = useTranslation('pos');
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(createRealtimeChannelTopic('orders-channel'))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('Order update:', payload);
          if (payload.eventType === 'INSERT') {
            fetchOrderWithItems(payload.new.id).then(order => {
              if (order) {
                setOrders(prev => [order, ...prev]);
                toast.success(`New order #${payload.new.order_number} received!`);
              }
            });
          } else if (payload.eventType === 'UPDATE') {
            setOrders(prev => prev.map(o => 
              o.id === payload.new.id ? { ...o, ...payload.new } : o
            ));
          } else if (payload.eventType === 'DELETE') {
            setOrders(prev => prev.filter(o => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrderWithItems = async (orderId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', orderId)
      .single();

    if (error) {
      console.error('Error fetching order:', error);
      return null;
    }

    return data;
  };

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load orders');
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order status');
    } else {
      toast.success(`Order status updated to ${newStatus}`);
      setOrders(prev => prev.map(o => 
        o.id === orderId ? { ...o, status: newStatus } : o
      ));
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesStatus = filter === 'all' || order.status === filter;
    const matchesStation = stationFilter === 'all' || order.station === stationFilter;
    const matchesSearch = !searchQuery || 
      order.order_number.toString().includes(searchQuery) ||
      order.table_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesStation && matchesSearch;
  });

  const getGridClasses = () => {
    if (layoutMode === 'compact') return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';
    if (layoutMode === 'grid') return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 lg:grid-cols-2';
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">Kitchen Display</h1>
            <p className="text-muted-foreground">
              {filteredOrders.length} active orders
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant={layoutMode === 'compact' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setLayoutMode('compact')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={layoutMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setLayoutMode('grid')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={layoutMode === 'multi' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setLayoutMode('multi')}
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order #, table, or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Tabs value={filter} onValueChange={setFilter} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="preparing">Preparing</TabsTrigger>
              <TabsTrigger value="ready">Ready</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={stationFilter} onValueChange={setStationFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stations</SelectItem>
              <SelectItem value="kitchen">Kitchen</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="expo">Expo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-lg">No orders found</p>
        </div>
      ) : (
        <div className={`grid ${getGridClasses()} gap-4`}>
          {filteredOrders.map((order) => (
            <KitchenCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              layout={layoutMode === 'compact' ? 'compact' : 'detailed'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

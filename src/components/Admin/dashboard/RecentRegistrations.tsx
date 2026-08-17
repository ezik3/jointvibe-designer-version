import { useEffect, useState } from "react";
import { User, Store, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useTranslation } from 'react-i18next';

type Tab = "users" | "venues";

interface UserRow {
  id: string;
  display_name: string | null;
  created_at: string;
}

interface VenueRow {
  id: string;
  name: string;
  city: string | null;
  venue_type: string | null;
  created_at: string;
}

function getTimeAgo(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function RecentRegistrations() {
  const { t } = useTranslation('admin');
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAll();

    const ch = supabase
      .channel(createRealtimeChannelTopic("recent-registrations"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "customer_profiles" }, fetchAll)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "venues" }, fetchAll)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    const [usersRes, venuesRes] = await Promise.all([
      supabase
        .from("customer_profiles")
        .select("id, display_name, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("venues")
        .select("id, name, city, venue_type, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    if (usersRes.data) setUsers(usersRes.data as UserRow[]);
    if (venuesRes.data) setVenues(venuesRes.data as VenueRow[]);
    setIsLoading(false);
  };

  return (
    <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg p-6">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-foreground">Recent Registrations</h3>
        <div className="flex p-0.5 bg-muted/60 rounded-lg gap-0.5">
          <button
            onClick={() => setTab("users")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === "users"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="w-3 h-3" />
            End Users
          </button>
          <button
            onClick={() => setTab("venues")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === "venues"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Store className="w-3 h-3" />
            Venues
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-7 w-7 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      ) : tab === "users" ? (
        <div className="space-y-3">
          {users.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No end-user registrations yet</p>
          ) : (
            users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {u.display_name || "Unnamed User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{u.id.substring(0, 12)}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="w-3 h-3" />
                  {getTimeAgo(u.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {venues.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No venue registrations yet</p>
          ) : (
            venues.map((v) => (
              <div key={v.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                <div className="w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
                  <Store className="w-4 h-4 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{v.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[v.venue_type, v.city].filter(Boolean).join(" · ") || "No details"}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="w-3 h-3" />
                  {getTimeAgo(v.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

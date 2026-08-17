import { useEffect, useState } from "react";
import { User, Store, Wallet, Flag, Clock, CheckCircle, XCircle, Shield, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useTranslation } from 'react-i18next';

interface Activity {
  id: string;
  type: string;
  message: string;
  detail: string;
  time: string;
  icon: LucideIcon;
}

const typeColors: Record<string, string> = {
  user: "bg-primary/10 text-primary",
  venue: "bg-warning/10 text-warning",
  venue_approved: "bg-success/10 text-success",
  venue_rejected: "bg-destructive/10 text-destructive",
  transaction: "bg-success/10 text-success",
  wallet: "bg-primary/10 text-primary",
  admin: "bg-accent/10 text-accent",
};

const actionTypeToIcon: Record<string, LucideIcon> = {
  venue_approved: CheckCircle,
  venue_rejected: XCircle,
  user_registered: User,
  deposit_completed: Wallet,
  withdrawal_completed: Wallet,
  wallet_frozen: Flag,
  wallet_unfrozen: Shield,
  role_assigned: User,
};

const actionTypeToMessage: Record<string, string> = {
  venue_approved: "Venue approved",
  venue_rejected: "Venue rejected",
  user_registered: "New user registered",
  deposit_completed: "Deposit completed",
  withdrawal_completed: "Withdrawal completed",
  wallet_frozen: "Wallet frozen",
  wallet_unfrozen: "Wallet unfrozen",
  role_assigned: "Role assigned",
};

export function RecentActivity() {
  const { t } = useTranslation('admin');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRecentActivity();

    const channel = supabase
      .channel(createRealtimeChannelTopic("admin-recent-activity"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_audit_log" },
        () => {
          fetchRecentActivity();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRecentActivity = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      const mappedActivities: Activity[] = (data || []).map((log) => {
        const details = log.details as Record<string, unknown> | null;
        const detailText = details?.venue_name 
          ? String(details.venue_name) 
          : details?.reason 
          ? String(details.reason).substring(0, 50) 
          : log.target_id?.substring(0, 8) || "System action";

        return {
          id: log.id,
          type: log.action_type,
          message: actionTypeToMessage[log.action_type] || log.action_type.replace(/_/g, " "),
          detail: detailText,
          time: getTimeAgo(log.created_at),
          icon: actionTypeToIcon[log.action_type] || Store,
        };
      });

      setActivities(mappedActivities);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  if (isLoading) {
    return (
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-foreground">Recent Activity</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-foreground">Recent Activity</h3>
        <button className="text-xs text-primary hover:underline">View all</button>
      </div>
      <div className="space-y-4">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No recent activity
          </div>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className={cn("p-2 rounded-lg", typeColors[activity.type] || "bg-muted text-muted-foreground")}>
                <activity.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{activity.message}</p>
                <p className="text-xs text-muted-foreground truncate">{activity.detail}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Clock className="w-3 h-3" />
                {activity.time}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

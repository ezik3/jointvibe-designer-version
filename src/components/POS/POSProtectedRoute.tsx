import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveVenueId } from "@/hooks/useActiveVenueId";
import { supabase } from "@/integrations/supabase/client";

type AccessStatus = "checking" | "allowed" | "login";

interface AccessState {
  key: string;
  status: AccessStatus;
}

const WORK_MODE_VENUE_ID_KEY = "work_mode_venue_id";

export default function POSProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const { venueId, loading: venueLoading } = useActiveVenueId(user?.id);
  const accessKey = `${user?.id ?? "anonymous"}:${venueId ?? "no-venue"}`;
  const [access, setAccess] = useState<AccessState>({ key: "", status: "checking" });

  useEffect(() => {
    if (authLoading || venueLoading) return;

    if (!user?.id || !venueId) {
      setAccess({ key: accessKey, status: "login" });
      return;
    }

    let isCurrent = true;
    setAccess({ key: accessKey, status: "checking" });

    const verifyAccess = async () => {
      try {
        const [{ data: venue, error: venueError }, { data: employeeLink, error: employeeError }] = await Promise.all([
          supabase
            .from("venues")
            .select("owner_user_id")
            .eq("id", venueId)
            .maybeSingle(),
          supabase
            .from("employee_venue_links")
            .select("venue_id")
            .eq("venue_id", venueId)
            .eq("user_id", user.id)
            .eq("is_active", true)
            .maybeSingle(),
        ]);

        if (!isCurrent) return;

        const isOwner = !venueError && venue?.owner_user_id === user.id;
        const hasWorkModeSession =
          !employeeError &&
          Boolean(employeeLink?.venue_id) &&
          localStorage.getItem("work_mode") === "true" &&
          localStorage.getItem(WORK_MODE_VENUE_ID_KEY) === venueId;

        setAccess({ key: accessKey, status: isOwner || hasWorkModeSession ? "allowed" : "login" });
      } catch {
        if (isCurrent) setAccess({ key: accessKey, status: "login" });
      }
    };

    void verifyAccess();

    return () => {
      isCurrent = false;
    };
  }, [accessKey, authLoading, user?.id, venueId, venueLoading]);

  const requestedPath = `${location.pathname}${location.search}${location.hash}`;
  const currentStatus = access.key === accessKey ? access.status : "checking";

  if (authLoading || venueLoading || currentStatus === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(requestedPath)}`} replace />;
  }

  if (currentStatus !== "allowed") {
    return <Navigate to={`/venue/pos/login?redirect=${encodeURIComponent(requestedPath)}`} replace />;
  }

  return <>{children}</>;
}

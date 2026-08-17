import { useState, useEffect } from "react";
import { FlaskConical, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';

interface TestBalance {
  id: string;
  venue_id: string;
  balance_cents: number;
  initial_balance_cents: number;
  venue_name?: string;
}

export default function TestWalletBalances() {
  const { t } = useTranslation('wallet');
  const { user } = useAuth();
  const [balances, setBalances] = useState<TestBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchBalances = async () => {
      const { data, error } = await (supabase as any)
        .from("test_wallet_balances")
        .select("id, venue_id, balance_cents, initial_balance_cents")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (error || !data || data.length === 0) {
        setBalances([]);
        setLoading(false);
        return;
      }

      // Get venue names
      const venueIds = data.map((b: any) => b.venue_id);
      const { data: venues } = await supabase
        .from("venues")
        .select("id, name")
        .in("id", venueIds);

      const venueMap = new Map((venues || []).map((v: any) => [v.id, v.name]));

      setBalances(
        data.map((b: any) => ({
          ...b,
          venue_name: venueMap.get(b.venue_id) || "Unknown Venue",
        }))
      );
      setLoading(false);
    };

    fetchBalances();
  }, [user]);

  if (loading || balances.length === 0) return null;

  return (
    <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical className="w-4 h-4 text-violet-400" />
        <span className="text-xs uppercase tracking-wider text-violet-400 font-semibold">Sandbox Test Funds</span>
      </div>
      <div className="space-y-2">
        {balances.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between bg-violet-500/5 rounded-lg p-3"
          >
            <div className="flex items-center gap-2.5">
              <Store className="w-4 h-4 text-violet-300" />
              <div>
                <p className="text-sm font-medium text-white">{b.venue_name}</p>
                <p className="text-[10px] text-violet-300/70 uppercase">Test only · not real money</p>
              </div>
            </div>
            <span className="text-lg font-bold text-violet-300">
              ${(b.balance_cents / 100).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

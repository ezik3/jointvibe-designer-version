import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface BridgeCustomer {
  id: string;
  bridge_customer_id: string | null;
  kyc_status: "none" | "pending" | "approved" | "rejected" | "requires_action";
  kyc_link: string | null;
  kyc_link_expires_at: string | null;
  country_code: string | null;
}

export interface BridgeExternalAccount {
  id: string;
  rail: string;
  currency: string;
  account_label: string | null;
  beneficiary_name: string | null;
  status: "pending" | "active" | "disabled";
  is_default: boolean;
}

export interface BridgeTransfer {
  id: string;
  source_asset: string;
  source_amount: number;
  destination_currency: string;
  destination_amount: number | null;
  status: string;
  estimated_arrival: string | null;
  created_at: string;
  completed_at: string | null;
}

export function useBridge() {
  const { user } = useAuth();
  const [customer, setCustomer] = useState<BridgeCustomer | null>(null);
  const [accounts, setAccounts] = useState<BridgeExternalAccount[]>([]);
  const [transfers, setTransfers] = useState<BridgeTransfer[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [cRes, aRes, tRes] = await Promise.all([
      supabase.from("bridge_customers").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("bridge_external_accounts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("bridge_transfers").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setCustomer((cRes.data as BridgeCustomer) ?? null);
    setAccounts((aRes.data as BridgeExternalAccount[]) ?? []);
    setTransfers((tRes.data as BridgeTransfer[]) ?? []);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const startKyc = useCallback(async (country_code: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("bridge-create-customer", {
        body: { country_code, accept_tos: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refresh();
      return data;
    } finally { setLoading(false); }
  }, [refresh]);

  const linkBank = useCallback(async (input: {
    rail: string; currency: string; beneficiary_name: string; account_label?: string;
    account_number?: string; routing_number?: string; iban?: string; bic?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("bridge-link-bank", { body: input });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refresh();
      return data;
    } finally { setLoading(false); }
  }, [refresh]);

  const createOfframp = useCallback(async (input: {
    external_account_id: string; source_asset?: string; source_amount: number; destination_currency?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("bridge-create-offramp", { body: input });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refresh();
      return data;
    } finally { setLoading(false); }
  }, [refresh]);

  return { customer, accounts, transfers, loading, refresh, startKyc, linkBank, createOfframp };
}

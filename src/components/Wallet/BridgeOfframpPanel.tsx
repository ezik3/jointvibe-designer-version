import { useState } from "react";
import { useBridge } from "@/hooks/useBridge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, AlertCircle, Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Phase 4 UI: Bridge.xyz BaaS panel — KYC, link bank, off-ramp.
 * Renders a clear "stub mode" banner until live keys are configured server-side.
 */
export function BridgeOfframpPanel() {
  const { customer, accounts, transfers, loading, startKyc, linkBank, createOfframp } = useBridge();
  const [country, setCountry] = useState("US");
  const [bank, setBank] = useState({
    rail: "ach", currency: "USD", beneficiary_name: "",
    account_number: "", routing_number: "", account_label: "",
  });
  const [amount, setAmount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  const kycBadge = () => {
    if (!customer) return <Badge variant="outline">Not started</Badge>;
    const map: Record<string, { v: any; icon: any; label: string }> = {
      approved:  { v: "default",     icon: CheckCircle2, label: "Approved" },
      pending:   { v: "secondary",   icon: Clock,        label: "Pending" },
      rejected:  { v: "destructive", icon: AlertCircle,  label: "Rejected" },
      none:      { v: "outline",     icon: Clock,        label: "Not started" },
      requires_action: { v: "secondary", icon: AlertCircle, label: "Action needed" },
    };
    const m = map[customer.kyc_status] ?? map.none;
    const Icon = m.icon;
    return <Badge variant={m.v}><Icon className="h-3 w-3 mr-1" />{m.label}</Badge>;
  };

  const handleKyc = async () => {
    try { await startKyc(country); toast.success("KYC link generated"); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleLinkBank = async () => {
    if (!bank.beneficiary_name) return toast.error("Beneficiary name required");
    try {
      await linkBank(bank);
      toast.success("Bank account linked");
      setBank({ ...bank, beneficiary_name: "", account_number: "", routing_number: "", account_label: "" });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleOfframp = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("Enter an amount");
    if (!selectedAccount) return toast.error("Choose a destination account");
    try {
      const res = await createOfframp({
        external_account_id: selectedAccount,
        source_asset: "RLUSD",
        source_amount: n,
        destination_currency: "USD",
      });
      toast.success(`Off-ramp queued (${res.live_mode ? "live" : "stub"} mode)`);
      setAmount("");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card className="p-5 space-y-5 bg-card/60 backdrop-blur border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Bank Off-Ramp (Bridge)</h3>
        </div>
        {kycBadge()}
      </div>

      {/* KYC step */}
      {customer?.kyc_status !== "approved" && (
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="text-xs text-muted-foreground">Step 1 — Verify identity</div>
          <div className="flex gap-2">
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["US","GB","AU","CA","DE","FR","NL","ES","IT","SG"].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleKyc} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start KYC"}
            </Button>
          </div>
          {customer?.kyc_link && (
            <a href={customer.kyc_link} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
              Open KYC link →
            </a>
          )}
        </div>
      )}

      {/* Link bank */}
      {customer?.kyc_status === "approved" && (
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="text-xs text-muted-foreground">Step 2 — Link a bank account</div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={bank.rail} onValueChange={(v) => setBank({ ...bank, rail: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ach">ACH (US)</SelectItem>
                <SelectItem value="wire">Wire</SelectItem>
                <SelectItem value="sepa">SEPA</SelectItem>
              </SelectContent>
            </Select>
            <Select value={bank.currency} onValueChange={(v) => setBank({ ...bank, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["USD","EUR","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Beneficiary name" value={bank.beneficiary_name}
                   onChange={e => setBank({ ...bank, beneficiary_name: e.target.value })} className="col-span-2" />
            <Input placeholder="Account number / IBAN" value={bank.account_number}
                   onChange={e => setBank({ ...bank, account_number: e.target.value })} />
            <Input placeholder="Routing / BIC" value={bank.routing_number}
                   onChange={e => setBank({ ...bank, routing_number: e.target.value })} />
            <Input placeholder="Label (e.g. Chase ****4521)" value={bank.account_label}
                   onChange={e => setBank({ ...bank, account_label: e.target.value })} className="col-span-2" />
          </div>
          <Button onClick={handleLinkBank} disabled={loading} className="w-full">Link Bank</Button>
        </div>
      )}

      {/* Off-ramp */}
      {accounts.length > 0 && customer?.kyc_status === "approved" && (
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="text-xs text-muted-foreground">Step 3 — Withdraw to bank</div>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger><SelectValue placeholder="Choose bank account" /></SelectTrigger>
            <SelectContent>
              {accounts.filter(a => a.status === "active").map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.account_label || a.beneficiary_name} · {a.currency} ({a.rail})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="number" placeholder="Amount RLUSD" value={amount}
                   onChange={e => setAmount(e.target.value)} className="flex-1" />
            <Button onClick={handleOfframp} disabled={loading || !amount}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
            </Button>
          </div>
        </div>
      )}

      {/* Recent transfers */}
      {transfers.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <div className="text-xs text-muted-foreground">Recent payouts</div>
          {transfers.slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center justify-between text-xs">
              <span>{Number(t.source_amount).toFixed(2)} {t.source_asset} → {t.destination_currency}</span>
              <Badge
                variant={t.status === "completed" ? "default" : t.status === "failed" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {t.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

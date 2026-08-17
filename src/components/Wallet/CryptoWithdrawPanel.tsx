import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCryptoWithdraw } from "@/hooks/useCryptoWithdraw";
import { usePaymentSecurity } from "@/hooks/usePaymentSecurity";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, AlertTriangle, ArrowUpRight, Lock, Clock } from "lucide-react";

/**
 * Crypto withdrawal panel — Phase 2.
 * Additive only: render this inside the existing wallet UI when the user opts to
 * withdraw to a crypto address. Does not replace fiat withdrawal.
 */
export function CryptoWithdrawPanel({ onClose }: { onClose?: () => void }) {
  const { requestWithdrawal, submitting, history, available, error } = useCryptoWithdraw();
  const { isPinSet } = usePaymentSecurity();
  const { toast } = useToast();

  const [destination, setDestination] = useState("");
  const [destTag, setDestTag] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  const fee = 0.5;
  const amt = Number(amount) || 0;
  const total = amt + fee;
  const insufficient = available !== null && total > available;

  const validateBasics = () => {
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(destination)) {
      toast({ title: "Invalid XRPL address", variant: "destructive" });
      return false;
    }
    if (amt < 10) {
      toast({ title: "Minimum withdrawal is $10", variant: "destructive" });
      return false;
    }
    if (insufficient) {
      toast({ title: "Insufficient available balance", description: "Some funds may be under a 7-day hold.", variant: "destructive" });
      return false;
    }
    if (!isPinSet) {
      toast({ title: "Set up payment PIN first", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateBasics()) return;
    if (!showPin) { setShowPin(true); return; }
    if (pin.length < 4) {
      toast({ title: "Enter your PIN", variant: "destructive" });
      return;
    }

    // Verify PIN (re-uses existing payment security flow)
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: verified, error: vErr } = await supabase.rpc(
        "verify_payment_pin" as any,
        { _pin: pin }
      );
      if (vErr || !verified) {
        toast({ title: "Incorrect PIN", variant: "destructive" });
        return;
      }
    } catch {
      toast({ title: "PIN verification unavailable", variant: "destructive" });
      return;
    }

    try {
      const res = await requestWithdrawal({
        destination_address: destination.trim(),
        destination_tag: destTag ? Number(destTag) : null,
        asset: "XRP",
        amount_jvc: amt,
        pin_verified: true,
      });
      toast({ title: "Withdrawal submitted", description: res.message });
      setDestination(""); setDestTag(""); setAmount(""); setPin(""); setShowPin(false);
      onClose?.();
    } catch (e: any) {
      toast({ title: "Withdrawal failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <ArrowUpRight className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-bold text-white">Withdraw to Crypto Wallet</h3>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex gap-2 text-amber-200 text-xs">
        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Identity verification required</div>
          <div>Funds from recent crypto deposits are locked under a 7-day security hold (similar to bank withdrawals).</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-zinc-800/60 rounded-lg p-3">
          <div className="text-zinc-500 uppercase tracking-wider">Available</div>
          <div className="text-white font-bold text-base">
            ${available?.toFixed(2) ?? "—"}
          </div>
        </div>
        <div className="bg-zinc-800/60 rounded-lg p-3">
          <div className="text-zinc-500 uppercase tracking-wider">Fee</div>
          <div className="text-white font-bold text-base">${fee.toFixed(2)}</div>
        </div>
      </div>

      <div>
        <Label className="text-xs text-zinc-400">XRPL Destination Address</Label>
        <Input
          placeholder="r..."
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-zinc-400">Destination Tag (optional)</Label>
          <Input
            placeholder="e.g. 12345"
            inputMode="numeric"
            value={destTag}
            onChange={(e) => setDestTag(e.target.value.replace(/\D/g, ""))}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
        <div>
          <Label className="text-xs text-zinc-400">Amount (USD)</Label>
          <Input
            placeholder="10.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
      </div>

      {amt > 0 && (
        <div className="text-xs text-zinc-400 flex justify-between">
          <span>Total debited:</span>
          <span className={insufficient ? "text-red-400 font-semibold" : "text-white font-semibold"}>
            ${total.toFixed(2)}
          </span>
        </div>
      )}

      {amt >= 1000 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-2 text-xs text-orange-300 flex gap-2">
          <Clock className="w-4 h-4 flex-shrink-0" />
          Withdrawals ≥ $1,000 require manual review (within 24h).
        </div>
      )}

      {showPin && (
        <div>
          <Label className="text-xs text-zinc-400 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Confirm with payment PIN
          </Label>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="bg-zinc-800 border-zinc-700 text-white text-center tracking-[0.5em] text-lg"
            autoFocus
          />
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={submitting || insufficient}
        className="w-full bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white h-12 rounded-xl font-semibold"
      >
        {submitting ? "Processing..." : showPin ? "Confirm withdrawal" : "Continue"}
      </Button>

      {history.length > 0 && (
        <div className="pt-3 border-t border-zinc-800">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Recent crypto withdrawals</div>
          <div className="space-y-2">
            {history.slice(0, 5).map((w) => (
              <div key={w.id} className="flex justify-between text-xs bg-zinc-800/50 rounded-lg p-2">
                <div>
                  <div className="text-white font-mono truncate max-w-[140px]">{w.destination_address.slice(0, 8)}…{w.destination_address.slice(-4)}</div>
                  <div className="text-zinc-500">{new Date(w.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">${Number(w.amount_jvc).toFixed(2)}</div>
                  <div className={
                    w.status === "confirmed" ? "text-emerald-400" :
                    w.status === "failed" || w.status === "rejected" ? "text-red-400" :
                    "text-amber-400"
                  }>{w.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

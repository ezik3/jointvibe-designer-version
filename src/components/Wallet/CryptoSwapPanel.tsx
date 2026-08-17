import { useEffect, useMemo, useState } from "react";
import { useCryptoSwap } from "@/hooks/useCryptoSwap";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowDownUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Phase 3 UI: lets users swap between supported crypto assets
 * (XRP ↔ RLUSD ↔ USDC). Quotes lock for 30s; execution calls
 * the on-chain swap edge function.
 */
export function CryptoSwapPanel() {
  const { assets, quote, history, loading, getQuote, executeSwap } = useCryptoSwap();
  const [fromSymbol, setFromSymbol] = useState<string>("XRP");
  const [toSymbol, setToSymbol] = useState<string>("RLUSD");
  const [amount, setAmount] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (assets.length && !assets.find(a => a.symbol === fromSymbol)) setFromSymbol(assets[0].symbol);
  }, [assets, fromSymbol]);

  useEffect(() => {
    if (!quote) { setSecondsLeft(0); return; }
    const tick = () => {
      const ms = new Date(quote.expires_at).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [quote]);

  const flip = () => {
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
  };

  const handleQuote = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("Enter a valid amount");
    if (fromSymbol === toSymbol) return toast.error("Pick a different target asset");
    try {
      await getQuote(fromSymbol, toSymbol, n);
    } catch (e: any) {
      toast.error(e.message || "Quote failed");
    }
  };

  const handleSwap = async () => {
    if (!quote) return;
    try {
      await executeSwap(quote.id);
      toast.success(`Swapped ${quote.from_amount} ${quote.from_symbol} → ${quote.to_amount.toFixed(4)} ${quote.to_symbol}`);
      setAmount("");
    } catch (e: any) {
      toast.error(e.message || "Swap failed");
    }
  };

  const fromOptions = useMemo(() => assets, [assets]);
  const toOptions = useMemo(() => assets.filter(a => a.symbol !== fromSymbol), [assets, fromSymbol]);

  return (
    <Card className="p-5 space-y-4 bg-card/60 backdrop-blur border-border/50">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Swap Assets</h3>
        <Badge variant="outline" className="text-xs">XRPL DEX</Badge>
      </div>

      {/* From */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">From</label>
        <div className="flex gap-2">
          <Select value={fromSymbol} onValueChange={setFromSymbol}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fromOptions.map(a => (
                <SelectItem key={a.symbol} value={a.symbol}>{a.symbol}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="flex-1"
          />
        </div>
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" size="icon" onClick={flip} className="rounded-full">
          <ArrowDownUp className="h-4 w-4" />
        </Button>
      </div>

      {/* To */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">To</label>
        <div className="flex gap-2">
          <Select value={toSymbol} onValueChange={setToSymbol}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {toOptions.map(a => (
                <SelectItem key={a.symbol} value={a.symbol}>{a.symbol}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1 flex items-center px-3 rounded-md border border-border bg-muted/20 text-sm text-foreground">
            {quote ? quote.to_amount.toFixed(6) : "—"}
          </div>
        </div>
      </div>

      {/* Quote details */}
      {quote && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>1 {quote.from_symbol} = {quote.rate.toFixed(6)} {quote.to_symbol}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span>${quote.fee_amount_usd.toFixed(4)} ({quote.fee_bps} bps)</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Value</span><span>${quote.usd_value.toFixed(2)}</span></div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quote expires</span>
            <span className={secondsLeft < 6 ? "text-destructive" : ""}>{secondsLeft}s</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleQuote}
          disabled={loading || !amount}
        >
          {loading && !quote ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Quote"}
        </Button>
        <Button
          className="flex-1"
          onClick={handleSwap}
          disabled={!quote || secondsLeft === 0 || loading}
        >
          {loading && quote ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Swap"}
        </Button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="pt-3 border-t border-border/50 space-y-2">
          <div className="text-xs text-muted-foreground">Recent Swaps</div>
          {history.slice(0, 5).map(h => (
            <div key={h.id} className="flex items-center justify-between text-xs">
              <span>{Number(h.from_amount).toFixed(4)} {h.from_symbol} → {Number(h.to_amount).toFixed(4)} {h.to_symbol}</span>
              <Badge
                variant={h.status === "completed" ? "default" : h.status === "failed" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {h.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

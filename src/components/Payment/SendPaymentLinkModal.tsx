import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, 
  Send, 
  Loader2, 
  Users,
  CheckCircle2,
  MapPin
} from "lucide-react";
import { PaymentStatus } from "@/components/Payment/PaymentStatus";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from 'react-i18next';

interface CheckedInCustomer {
  user_id: string;
  table_number: string | null;
  checked_in_at: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface SendPaymentLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  paymentLink: string;
  amount: number;
  onLinkSent?: () => void;
}

export function SendPaymentLinkModal({
  open,
  onOpenChange,
  venueId,
  paymentLink,
  amount,
  onLinkSent,
}: SendPaymentLinkModalProps) {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [customers, setCustomers] = useState<CheckedInCustomer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CheckedInCustomer | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);

  // Fetch checked-in customers for this venue
  useEffect(() => {
    if (!open || !venueId) return;

    const fetchCheckedInCustomers = async () => {
      setLoading(true);
      try {
        const response = await supabase.functions.invoke('list-checked-in-customers', {
          body: { venue_id: venueId },
        });

        if (response.error) throw response.error;
        if ((response.data as any)?.error) throw new Error((response.data as any).error);

        setCustomers((response.data as CheckedInCustomer[]) || []);
      } catch (error) {
        console.error("Error fetching checked-in customers:", error);
        toast.error("Failed to load customers");
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCheckedInCustomers();
  }, [open, venueId]);

  // Filter customers by search query
  const filteredCustomers = customers.filter(customer => {
    const name = customer.display_name || "";
    const table = customer.table_number || "";
    const query = searchQuery.toLowerCase();
    return name.toLowerCase().includes(query) || table.toLowerCase().includes(query);
  });

  // Send payment link to customer via backend function
  const handleSendLink = async () => {
    if (!selectedCustomer) return;

    setSending(true);
    try {
      console.log("Sending payment link with:", {
        venue_id: venueId,
        customer_user_id: selectedCustomer.user_id,
        payment_link: paymentLink,
        amount,
      });

      const response = await supabase.functions.invoke('send-payment-link', {
        body: {
          venue_id: venueId,
          customer_user_id: selectedCustomer.user_id,
          payment_link: paymentLink,
          amount,
        },
      });

      console.log("Send payment link response:", response);

      if (response.error) {
        console.error("Function invoke error:", response.error);
        throw new Error(response.error.message || "Function error");
      }
      
      if ((response.data as any)?.error) {
        console.error("Backend error:", (response.data as any).error);
        throw new Error((response.data as any).error);
      }

      setSentSuccess(true);
      toast.success(`Payment link sent to ${selectedCustomer.display_name}!`);
      onLinkSent?.();

      // Close after brief success display
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error: any) {
      console.error("Error sending payment link:", error);
      const errorMessage = error?.message || "Failed to send payment link";
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSearchQuery("");
    setSelectedCustomer(null);
    setSentSuccess(false);
    onOpenChange(false);
  };

  const formatCheckInTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Payment Link
          </DialogTitle>
        </DialogHeader>

        {sentSuccess ? (
          <div className="py-8">
            <PaymentStatus
              state="success"
              title="Link Sent!"
              subtitle={`Payment link sent to ${selectedCustomer?.display_name}`}
            />
          </div>
        ) : (
          <>
            {/* Amount Display */}
            <div className="text-center py-2 bg-muted/50 rounded-lg mb-2">
              <p className="text-sm text-muted-foreground">Amount to collect</p>
              <p className="text-xl font-bold text-primary">${amount.toFixed(2)}</p>
            </div>

            {/* Quick Select Profile Row - Shows when customers exist */}
            {!loading && customers.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-muted-foreground mb-2">Quick select:</p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                  {customers.map((customer) => (
                    <button
                      key={customer.user_id}
                      onClick={() => setSelectedCustomer(customer)}
                      className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-full border transition-all whitespace-nowrap ${
                        selectedCustomer?.user_id === customer.user_id
                          ? "bg-primary/20 border-primary"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="relative">
                        <Avatar className="h-8 w-8 border border-background">
                          <AvatarImage src={customer.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {(customer.display_name || "?")[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {selectedCustomer?.user_id === customer.user_id && (
                          <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
                            <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium max-w-[140px] truncate">
                        {customer.display_name || "Customer"}
                      </span>
                      {customer.table_number && (
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                          {customer.table_number}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or table..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Customer List */}
            <ScrollArea className="flex-1 min-h-[150px] max-h-[250px]">
              <div className="space-y-2 pr-2">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-2 text-sm text-muted-foreground">Loading customers...</p>
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="h-12 w-12 text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">
                      {customers.length === 0 
                        ? "No customers checked in at this venue" 
                        : "No customers match your search"}
                    </p>
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.user_id}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                        selectedCustomer?.user_id === customer.user_id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={customer.avatar_url || undefined} />
                        <AvatarFallback>
                          {(customer.display_name || "?")[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{customer.display_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Checked in {formatCheckInTime(customer.checked_in_at)}</span>
                        </div>
                      </div>
                      {customer.table_number && (
                        <Badge variant="outline" className="shrink-0">
                          <MapPin className="h-3 w-3 mr-1" />
                          {customer.table_number}
                        </Badge>
                      )}
                      {selectedCustomer?.user_id === customer.user_id && (
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Send Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleSendLink}
              disabled={!selectedCustomer || sending}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send to {selectedCustomer?.display_name || "Selected Customer"}
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              The payment link will appear in the customer's app for them to confirm
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

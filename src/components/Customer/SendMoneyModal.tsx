import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Send, User, AlertCircle } from "lucide-react";
import { PaymentStatus } from "@/components/Payment/PaymentStatus";
import { supabase } from "@/integrations/supabase/client";
import { useJVCoinWallet } from "@/hooks/useJVCoinWallet";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface SendMoneyModalProps {
  open: boolean;
  onClose: () => void;
}

interface UserResult {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function SendMoneyModal({ open, onClose }: SendMoneyModalProps) {
  const { t } = useTranslation(['common', 'wallet']);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [step, setStep] = useState<'search' | 'confirm' | 'success'>('search');
  
  const { transferJVC, balance, TRANSACTION_FEE_USD } = useJVCoinWallet();
  const { jvcToLocal, formatCurrency, userCurrency } = useCurrency();

  // Search for users as they type
  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('customer_profiles')
          .select('user_id, display_name, avatar_url')
          .ilike('display_name', `%${searchQuery}%`)
          .limit(10);

        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSelectUser = (user: UserResult) => {
    setSelectedUser(user);
    setStep('confirm');
  };

  const handleSend = async () => {
    if (!selectedUser || !amount) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(t('wallet:send.invalid_amount'));
      return;
    }

    if (numAmount + TRANSACTION_FEE_USD > (balance?.jvc || 0)) {
      toast.error(t('wallet:send.insufficient_balance'));
      return;
    }

    setIsSending(true);
    try {
      const result = await transferJVC(selectedUser.user_id, numAmount, description || 'Payment');
      
      if (result.success) {
        setStep('success');
        toast.success(t('wallet:send.sent_to', { amount: formatCurrency(jvcToLocal(numAmount)), name: selectedUser.display_name || t('common:app.unknown') }));
      } else {
        toast.error(result.error || t('wallet:send.transfer_failed'));
      }
    } catch (error) {
      toast.error(t('wallet:send.transfer_failed'));
    } finally {
      setIsSending(false);
    }
  };

  const resetModal = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSelectedUser(null);
    setAmount("");
    setDescription("");
    setStep('search');
    onClose();
  };

  const localFee = formatCurrency(jvcToLocal(TRANSACTION_FEE_USD));
  const numAmount = parseFloat(amount) || 0;
  const totalAmount = numAmount + TRANSACTION_FEE_USD;

  return (
    <Dialog open={open} onOpenChange={resetModal}>
      <DialogContent className="customer-dialog-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            {t('wallet:send.title')}
          </DialogTitle>
        </DialogHeader>

        {step === 'search' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('wallet:send.search_recipient')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('wallet:send.enter_name')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="customer-modal-field pl-10"
                />
              </div>
            </div>

            {isSearching && (
              <p className="text-sm text-muted-foreground text-center py-4">{t('wallet:send.searching')}</p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((user) => (
                  <button
                    key={user.user_id}
                    onClick={() => handleSelectUser(user)}
                    className="customer-modal-list-item w-full flex items-center gap-3 p-3 text-left transition-colors"
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user.avatar_url || ''} />
                      <AvatarFallback>
                        <User className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user.display_name || t('common:app.anonymous')}</p>
                      <p className="text-xs text-muted-foreground">{t('wallet:send.tap_to_select')}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('wallet:send.no_users_found')}</p>
                <p className="text-sm">{t('wallet:send.try_different_name')}</p>
              </div>
            )}

            {searchQuery.length < 2 && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('wallet:send.start_typing')}</p>
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-[8px] border border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] p-4">
              <Avatar className="w-12 h-12">
                <AvatarImage src={selectedUser.avatar_url || ''} />
                <AvatarFallback>
                  <User className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{selectedUser.display_name || t('common:app.anonymous')}</p>
                <p className="text-sm text-muted-foreground">{t('wallet:send.recipient')}</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-auto"
                onClick={() => setStep('search')}
              >
                {t('common:app.change')}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t('wallet:send.amount_label', { currency: userCurrency })}</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="customer-modal-field text-lg"
                min="0"
                step="0.01"
              />
              <p className="text-xs text-muted-foreground">
                {t('wallet:send.available', { amount: formatCurrency(jvcToLocal(balance?.jvc || 0)) })}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('wallet:send.note_optional')}</Label>
              <Input
                placeholder={t('wallet:send.whats_this_for')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="customer-modal-field"
              />
            </div>

            {numAmount > 0 && (
              <div className="space-y-2 rounded-[8px] border border-[var(--customer-modal-line)] bg-[var(--customer-modal-canvas)] p-4">
                <div className="flex justify-between text-sm tabular-nums">
                  <span>{t('wallet:send.amount')}</span>
                  <span>{formatCurrency(jvcToLocal(numAmount))}</span>
                </div>
                <div className="flex justify-between text-sm tabular-nums">
                  <span>{t('wallet:send.platform_fee')}</span>
                  <span>{localFee}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold tabular-nums">
                  <span>{t('wallet:send.total')}</span>
                  <span>{formatCurrency(jvcToLocal(totalAmount))}</span>
                </div>
              </div>
            )}

            {totalAmount > (balance?.jvc || 0) && numAmount > 0 && (
              <div className="flex items-center gap-2 rounded-[6px] border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{t('wallet:send.insufficient_balance')}</span>
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={!amount || numAmount <= 0 || totalAmount > (balance?.jvc || 0) || isSending}
              className="customer-modal-primary w-full"
            >
              {isSending ? t('wallet:send.sending') : `${t('wallet:send.confirm')}${numAmount > 0 ? ` ${formatCurrency(jvcToLocal(numAmount))}` : ''}`}
            </Button>
          </div>
        )}

        {step === 'success' && selectedUser && (
          <div className="py-8 space-y-6">
            <PaymentStatus
              state="success"
              title={t('wallet:send.money_sent')}
              subtitle={t('wallet:send.sent_to', {
                amount: formatCurrency(jvcToLocal(parseFloat(amount))),
                name: selectedUser.display_name || t('common:app.unknown'),
              })}
              amount={formatCurrency(jvcToLocal(parseFloat(amount)))}
            />
            <Button onClick={resetModal} className="w-full">
              {t('common:app.done')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

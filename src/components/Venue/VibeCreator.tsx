import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, Clock, MapPin, UserCheck, Users, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from 'react-i18next';

interface VibeCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSendVibe: (message: string, reachType: string, duration: number, dealDraft?: DealDraft) => Promise<unknown>;
  vibeCredits: number;
  venueName: string;
  venueId?: string;
}

export interface DealDraft {
  headline: string;
  discountText: string;
  description: string;
  mediaUrl?: string;
  menuItemImageUrl?: string;
}

interface SmartSuggestion {
  message: string;
  headline: string;
  discount: string;
  description: string;
  menuItemName: string;
  menuItemImageUrl?: string;
}

// Human-sounding vibe templates — casual, not corporate
const vibeTemplates = [
  (item: string) => `We just fired up a fresh batch of ${item}. Want one?`,
  (item: string) => `Our ${item} is looking amazing tonight. Interested?`,
  (item: string) => `Craving ${item}? We might have something special coming up`,
  (item: string) => `${item} flying off the counter today. Should we save you one?`,
  (item: string) => `Thinking about running a deal on ${item}. Would you bite?`,
  (item: string) => `Just prepped some incredible ${item}. Come try it?`,
  (item: string) => `Who's in the mood for ${item}? We might have a surprise for you`,
  (item: string) => `Fresh ${item} ready to go — want first dibs?`,
];

const discountTemplates = [
  "20% off", "Buy 1 get 1 free", "15% off", "Half price", "25% off",
  "Free side included", "2 for 1 deal", "30% off today only",
];

const fallbackExamples: SmartSuggestion[] = [
  {
    message: "Thinking about 20% off pizza tonight. Interested?",
    headline: "Pizza Night Special",
    discount: "20% off",
    description: "Get 20% off all pizzas tonight only",
    menuItemName: "Pizza",
  },
  {
    message: "Happy hour special coming up — 2-for-1 drinks. Want in?",
    headline: "Happy Hour 2-for-1",
    discount: "2 for 1",
    description: "All drinks are buy one get one free",
    menuItemName: "Drinks",
  },
  {
    message: "Fresh pastries just out of the oven. Reserved one for you?",
    headline: "Fresh Baked Pastries",
    discount: "15% off",
    description: "Freshly baked pastries at a special price",
    menuItemName: "Pastries",
  },
];

function generateSuggestions(menuItems: { name: string; base_price: number; description?: string | null; image_url?: string | null }[]): SmartSuggestion[] {
  const { t } = useTranslation('venue');
  if (!menuItems.length) return fallbackExamples;

  // Pick up to 5 random items
  const shuffled = [...menuItems].sort(() => Math.random() - 0.5).slice(0, 5);

  return shuffled.map((item, i) => {
    const template = vibeTemplates[i % vibeTemplates.length];
    const discount = discountTemplates[i % discountTemplates.length];
    return {
      message: template(item.name),
      headline: `${item.name} Special`,
      discount,
      description: item.description || `Get ${discount} on our ${item.name}`,
      menuItemName: item.name,
      menuItemImageUrl: item.image_url || undefined,
    };
  });
}

const VibeCreator = ({
  isOpen,
  onClose,
  onSendVibe,
  vibeCredits,
  venueName,
  venueId,
}: VibeCreatorProps) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [reachType, setReachType] = useState<'local' | 'followers' | 'city'>('local');
  const [duration, setDuration] = useState(60);
  const [isSending, setIsSending] = useState(false);

  // Deal prep state
  const [prepareDeal, setPrepareDeal] = useState<'no' | 'yes'>('no');
  const [dealHeadline, setDealHeadline] = useState("");
  const [dealDiscount, setDealDiscount] = useState("");
  const [dealDescription, setDealDescription] = useState("");

  // Smart suggestions from menu
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>(fallbackExamples);

  useEffect(() => {
    if (!venueId || !isOpen) return;

    const fetchMenu = async () => {
      const { data } = await supabase
        .from('venue_menu_items')
        .select('name, base_price, description, image_url')
        .eq('venue_id', venueId)
        .eq('available', true)
        .limit(10);

      if (data && data.length > 0) {
        setSuggestions(generateSuggestions(data));
      } else {
        setSuggestions(fallbackExamples);
      }
    };

    fetchMenu();
  }, [venueId, isOpen]);

  const handleSend = async () => {
    if (!message.trim() || vibeCredits <= 0) return;
    
    setIsSending(true);
    try {
      // Find which suggestion was used to get the image URL
      const usedSuggestion = suggestions.find(s => s.message === message);
      const dealDraft: DealDraft | undefined = prepareDeal === 'yes' && (dealHeadline || dealDiscount || dealDescription)
        ? { headline: dealHeadline, discountText: dealDiscount, description: dealDescription, menuItemImageUrl: usedSuggestion?.menuItemImageUrl }
        : undefined;

      await onSendVibe(message, reachType, duration, dealDraft);
      setMessage("");
      setPrepareDeal('no');
      setDealHeadline("");
      setDealDiscount("");
      setDealDescription("");
      onClose();
    } catch (error) {
      console.error('Failed to send vibe:', error);
    } finally {
      setIsSending(false);
    }
  };

  const useSuggestion = (suggestion: SmartSuggestion) => {
    setMessage(suggestion.message);
    setPrepareDeal('yes');
    setDealHeadline(suggestion.headline);
    setDealDiscount(suggestion.discount);
    setDealDescription(suggestion.description);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="venue-dialog-surface max-w-md flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <div className="relative">
              <motion.div
                className="venue-dialog-icon--cyan w-8 h-8 rounded-full flex items-center justify-center"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="w-3 h-3 rounded-full bg-white" />
              </motion.div>
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-cyan-400"
                animate={{ scale: [1, 1.5], opacity: [0.8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
            Send a Vibe
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Test demand before using a Push Deal credit
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[70vh] overflow-y-auto pr-4">
          <div className="space-y-6 pb-4">
          {/* Credits Display */}
          <Card className="bg-cyan-500/10 border-cyan-500/30">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                <span className="text-sm text-white font-medium">Free Vibes Available</span>
              </div>
              <span className="text-2xl font-bold text-white">{vibeCredits}</span>
            </CardContent>
          </Card>

          {/* Message Input */}
          <div className="space-y-2">
            <Label htmlFor="vibe-message" className="text-slate-300">Your Vibe Message</Label>
            <Textarea
              id="vibe-message"
              placeholder="e.g., Thinking about 20% off pizza tonight. Interested?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 min-h-[100px] resize-none"
              maxLength={150}
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>Keep it short and enticing</span>
              <span>{message.length}/150</span>
            </div>
          </div>

          {/* Smart Suggestions from Menu */}
          <div className="space-y-2">
            <Label className="text-slate-400 text-xs">Suggestions from your menu</Label>
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 3).map((suggestion, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => useSuggestion(suggestion)}
                  className="text-xs border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 whitespace-normal text-left h-auto py-2"
                >
                  {suggestion.message.length > 40
                    ? suggestion.message.substring(0, 40) + "..."
                    : suggestion.message}
                </Button>
              ))}
            </div>
          </div>

          {/* Reach Type */}
          <div className="space-y-3">
            <Label className="text-slate-300">Who should see this?</Label>
            <RadioGroup value={reachType} onValueChange={(v) => setReachType(v as any)} className="space-y-2">
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <RadioGroupItem value="local" id="local" />
                <Label htmlFor="local" className="flex items-center gap-2 cursor-pointer flex-1">
                  <MapPin className="w-4 h-4 text-green-400" />
                  <div>
                    <p className="text-white">{t("feed:discover.nearby")}</p>
                    <p className="text-xs text-slate-400">People within 2km of your venue</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <RadioGroupItem value="followers" id="followers" />
                <Label htmlFor="followers" className="flex items-center gap-2 cursor-pointer flex-1">
                  <UserCheck className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-white">Followers</p>
                    <p className="text-xs text-slate-400">People who follow {venueName}</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <RadioGroupItem value="city" id="city" />
                <Label htmlFor="city" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <div>
                    <p className="text-white">City-wide</p>
                    <p className="text-xs text-slate-400">Everyone in your city</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Collection Window
            </Label>
            <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
              <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
                <SelectItem value="240">4 hours</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">After this time, you can convert to a Push Deal or let it expire</p>
          </div>

          {/* Prepare a Deal in Advance? */}
          <div className="space-y-3">
            <Label className="text-slate-300 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Prepare a Deal in Advance?
            </Label>
            <RadioGroup value={prepareDeal} onValueChange={(v) => setPrepareDeal(v as 'yes' | 'no')} className="space-y-2">
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <RadioGroupItem value="no" id="deal-no" />
                <Label htmlFor="deal-no" className="cursor-pointer text-white text-sm">No, just send the vibe</Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <RadioGroupItem value="yes" id="deal-yes" />
                <Label htmlFor="deal-yes" className="cursor-pointer text-white text-sm">Yes, I will prepare a deal now</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Deal Fields (shown when Yes is selected) */}
          {prepareDeal === 'yes' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20"
            >
              <p className="text-xs text-cyan-400 font-medium">Prepare now, push later</p>
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Deal Headline</Label>
                <Input
                  placeholder="e.g., Pizza Night Special"
                  value={dealHeadline}
                  onChange={(e) => setDealHeadline(e.target.value)}
                  maxLength={40}
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                />
                <span className="text-xs text-slate-500">{dealHeadline.length}/40</span>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Discount or Offer</Label>
                <Input
                  placeholder="e.g., 20% off, free dessert"
                  value={dealDiscount}
                  onChange={(e) => setDealDiscount(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Description</Label>
                <Textarea
                  placeholder="Brief description of the deal..."
                  value={dealDescription}
                  onChange={(e) => setDealDescription(e.target.value)}
                  maxLength={125}
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 min-h-[60px] resize-none"
                />
                <span className="text-xs text-slate-500">{dealDescription.length}/125</span>
              </div>
            </motion.div>
          )}

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={!message.trim() || vibeCredits <= 0 || isSending}
            className="venue-dialog-primary-action w-full h-12 text-lg"
          >
            {isSending ? (
              <motion.div
                className="w-5 h-5 rounded-full border-2 border-white border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            ) : (
              <>
                <Zap className="w-5 h-5 mr-2" />
                Send Vibe
              </>
            )}
          </Button>

          {vibeCredits <= 0 && (
            <p className="text-center text-sm text-amber-400">
              You're out of free vibes. Purchase more Push Deal credits to get more vibes.
            </p>
          )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default VibeCreator;

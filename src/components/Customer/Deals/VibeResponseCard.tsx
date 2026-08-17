import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Minus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface VibeResponseCardProps {
  vibeId: string;
  venueName: string;
  message: string;
  variant?: 'alert' | 'banner' | 'sidebar';
  onResponded?: () => void;
}

const VibeResponseCard = ({ vibeId, venueName, message, variant = 'alert', onResponded }: VibeResponseCardProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [responded, setResponded] = useState(false);
  const [responding, setResponding] = useState(false);

  const handleResponse = async (response: 'yes' | 'maybe' | 'no') => {
    if (!user) return;
    setResponding(true);
    try {
      await (supabase as any).from('vibe_responses').insert({
        vibe_id: vibeId,
        user_id: user.id,
        response,
      });
      setResponded(true);
      const msgs = { yes: '👍 Interested!', maybe: '🤔 Maybe', no: '👋 Not today' };
      toast.success(msgs[response]);
      onResponded?.();
    } catch {
      toast.error('Failed to respond');
    } finally {
      setResponding(false);
    }
  };

  if (responded) return null;

  if (variant === 'banner') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 left-4 right-4 z-40 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-white/10 p-4 shadow-2xl"
        >
          <p className="text-white/50 text-xs mb-1">{venueName}</p>
          <p className="text-white text-sm font-medium mb-3">{message}</p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 h-8" onClick={() => handleResponse('yes')} disabled={responding}>
              <Check className="w-3 h-3 mr-1" /> Yes
            </Button>
            <Button size="sm" className="flex-1 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 h-8" onClick={() => handleResponse('maybe')} disabled={responding}>
              <Minus className="w-3 h-3 mr-1" /> Maybe
            </Button>
            <Button size="sm" className="flex-1 bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 h-8" onClick={() => handleResponse('no')} disabled={responding}>
              <X className="w-3 h-3 mr-1" /> Not Today
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Alert / sidebar variant
  return (
    <div className={`p-4 rounded-xl border transition-colors ${variant === 'sidebar' ? 'bg-white/5 border-white/10' : 'bg-purple-500/5 border-purple-500/20'}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
        <span className="text-white/70 text-xs font-medium">{venueName}</span>
      </div>
      <p className="text-white text-sm mb-3 italic">"{message}"</p>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 h-8 text-xs" onClick={() => handleResponse('yes')} disabled={responding}>
          Yes
        </Button>
        <Button size="sm" className="flex-1 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 h-8 text-xs" onClick={() => handleResponse('maybe')} disabled={responding}>
          Maybe
        </Button>
        <Button size="sm" className="flex-1 bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 h-8 text-xs" onClick={() => handleResponse('no')} disabled={responding}>
          Not Today
        </Button>
      </div>
    </div>
  );
};

export default VibeResponseCard;

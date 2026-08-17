import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, User, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Import both avatar systems
import AvatarChatbot from './AvatarChatbot';
import VRMChatbot from './VRMChatbot';
import { useTranslation } from 'react-i18next';

type AvatarMode = 'svg' | 'vrm';

export default function AvatarSwitcher() {
  const { t } = useTranslation('common');
  // Default to VRM now that custom avatar is available
  const [mode, setMode] = useState<AvatarMode>('vrm');
  const [showSettings, setShowSettings] = useState(false);

  // Persist preference
  useEffect(() => {
    const saved = localStorage.getItem('jv-avatar-mode');
    if (saved === 'svg' || saved === 'vrm') {
      setMode(saved);
    }
  }, []);

  const handleModeChange = (newMode: AvatarMode) => {
    setMode(newMode);
    localStorage.setItem('jv-avatar-mode', newMode);
  };

  return (
    <>
      {/* Avatar mode switcher - subtle settings icon */}
      <div className="fixed bottom-4 left-4 z-50">
        <DropdownMenu open={showSettings} onOpenChange={setShowSettings}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 bg-background/50 backdrop-blur-md border border-border/30 hover:bg-background/80"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem 
              onClick={() => handleModeChange('vrm')}
              className="flex items-center gap-2"
            >
              <Box className={`h-4 w-4 ${mode === 'vrm' ? 'text-primary' : ''}`} />
              <span className={mode === 'vrm' ? 'font-medium' : ''}>3D Avatar (VRM)</span>
              {mode === 'vrm' && <span className="ml-auto text-primary">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleModeChange('svg')}
              className="flex items-center gap-2"
            >
              <User className={`h-4 w-4 ${mode === 'svg' ? 'text-primary' : ''}`} />
              <span className={mode === 'svg' ? 'font-medium' : ''}>Classic Avatar (SVG)</span>
              {mode === 'svg' && <span className="ml-auto text-primary">✓</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Render selected avatar */}
      <AnimatePresence mode="wait">
        {mode === 'vrm' ? (
          <motion.div
            key="vrm"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="w-full h-full"
          >
            <VRMChatbot />
          </motion.div>
        ) : (
          <motion.div
            key="svg"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="w-full h-full"
          >
            <AvatarChatbot />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

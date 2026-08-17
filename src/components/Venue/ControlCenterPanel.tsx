import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Radio, Menu as MenuIcon, Megaphone, Zap, Settings2, 
  ShoppingCart, ChefHat, MessageCircle, LayoutGrid,
  Activity, Users, Image, Video
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useTranslation } from 'react-i18next';

interface ControlCenterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onGoLive: () => void;
  onQuickMenu: () => void;
  onPushDeal: () => void;
  onSendVibe: () => void;
  onCustomizeOrbs: () => void;
  onDisplaySettings?: () => void;
  isLive: boolean;
  stats: {
    activeOrders: number;
    kitchenQueue: number;
    unreadMessages: number;
    tablesOccupied: number;
    checkedIn: number;
  };
}

const ControlCenterPanel = ({
  isOpen,
  onClose,
  onGoLive,
  onQuickMenu,
  onPushDeal,
  onSendVibe,
  onCustomizeOrbs,
  onDisplaySettings,
  isLive,
  stats,
}: ControlCenterPanelProps) => {
  const { t } = useTranslation('venue');
  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="venue-dialog-drawer">
        <DrawerHeader className="border-b border-slate-700/50 pb-4">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-xl font-bold text-white flex items-center gap-2">
              <div className="venue-dialog-icon--cyan w-8 h-8 rounded-full flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
              Control Center
            </DrawerTitle>
          </div>
        </DrawerHeader>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Quick Actions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              QUICK ACTIONS
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <Button
                onClick={() => { onGoLive(); onClose(); }}
                className={`h-20 flex flex-col items-center justify-center gap-2 ${
                  isLive 
                    ? "bg-red-500 hover:bg-red-600" 
                    : "venue-dialog-primary-action"
                }`}
              >
                <Radio className={`w-6 h-6 ${isLive ? 'animate-pulse' : ''}`} />
                <span className="text-xs font-medium">{isLive ? 'End Live' : 'Go Live'}</span>
              </Button>

              <Button
                onClick={() => { onQuickMenu(); onClose(); }}
                variant="outline"
                className="venue-dialog-secondary-action h-20 flex flex-col items-center justify-center gap-2"
              >
                <MenuIcon className="w-6 h-6" />
                <span className="text-xs font-medium">Quick Menu</span>
              </Button>

              <Button
                onClick={() => { onPushDeal(); onClose(); }}
                className="venue-dialog-primary-action h-20 flex flex-col items-center justify-center gap-2"
              >
                <Megaphone className="w-6 h-6" />
                <span className="text-xs font-medium">Push Deal</span>
              </Button>
            </div>

            {/* Second row - Vibe and Customize */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Button
                onClick={() => { onSendVibe(); onClose(); }}
                className="venue-dialog-primary-action h-16 flex items-center justify-center gap-3"
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full border-2 border-white/50 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white animate-ping absolute" />
                    <div className="w-3 h-3 rounded-full bg-white" />
                  </div>
                </div>
                <span className="font-medium">Send Vibe</span>
              </Button>

              <Button
                onClick={() => { onCustomizeOrbs(); onClose(); }}
                variant="outline"
                className="venue-dialog-secondary-action h-16 flex items-center justify-center gap-3"
              >
                <LayoutGrid className="w-5 h-5" />
                <span className="font-medium">Customize Orbs</span>
              </Button>
            </div>
          </div>

          {/* Live Status */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              LIVE STATUS
            </h3>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <ShoppingCart className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.activeOrders}</p>
                      <p className="text-xs text-slate-400">Active Orders</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <ChefHat className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.kitchenQueue}</p>
                      <p className="text-xs text-slate-400">Kitchen Queue</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.unreadMessages}</p>
                      <p className="text-xs text-slate-400">Unread Messages</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.checkedIn}</p>
                      <p className="text-xs text-slate-400">Checked In</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Display Settings */}
          {onDisplaySettings && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                <Image className="w-4 h-4" />
                DISPLAY SETTINGS
              </h3>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm text-slate-300">
                    Set your venue's default backdrop image or video for the public page.
                  </p>
                  <Button
                    onClick={() => { onDisplaySettings(); onClose(); }}
                    variant="outline"
                    className="w-full justify-between border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    <span className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      Manage Display
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Home Layout */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              HOME LAYOUT
            </h3>
            <Button
              onClick={() => { onCustomizeOrbs(); onClose(); }}
              variant="outline"
              className="w-full justify-between border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <span>Customize which orbs appear on home</span>
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ControlCenterPanel;

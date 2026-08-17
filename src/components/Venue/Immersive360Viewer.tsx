import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { X, MessageSquare, Bot, RotateCcw, Users, ChevronLeft, ChevronRight, Smartphone } from "lucide-react";
import { toast } from "sonner";
import AIChat from "@/components/Customer/AIChat";
import { useTranslation } from 'react-i18next';
import { readVenueFloorplan360 } from "@/lib/venueFloorplanStorage";

interface VenueHotspot {
  id: string;
  type: string;
  pitch: number;
  yaw: number;
  text: string;
  targetScene?: string;
  capacity?: number;
  tableNumber?: string;
  status?: 'available' | 'occupied' | 'reserved';
}

interface VenueScene {
  id: string;
  name: string;
  panoramaUrl: string;
  hotspots: VenueHotspot[];
  isDefault?: boolean;
  is360?: boolean;
}

interface Immersive360ViewerProps {
  isOpen: boolean;
  onClose: () => void;
  isVenueOwner?: boolean; // Show extra insights for venue owners
  venueId?: string | null;
}

const HOTSPOT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  table: { icon: '🪑', label: 'Table', color: 'bg-green-500' },
  bar: { icon: '🍸', label: 'Bar', color: 'bg-purple-500' },
  toilet: { icon: '🚻', label: 'Restroom', color: 'bg-blue-500' },
  entry: { icon: '🚪', label: 'Entry', color: 'bg-cyan-500' },
  exit: { icon: '🚪', label: 'Exit', color: 'bg-orange-500' },
  goto: { icon: '👆', label: 'Go To', color: 'bg-pink-500' },
  dj: { icon: '🎧', label: 'DJ Booth', color: 'bg-violet-500' },
  stage: { icon: '🎤', label: 'Stage', color: 'bg-yellow-500' },
  vip: { icon: '⭐', label: 'VIP', color: 'bg-amber-500' },
};

export default function Immersive360Viewer({ isOpen, onClose, isVenueOwner = false, venueId }: Immersive360ViewerProps) {
  const { t } = useTranslation('venue');
  const viewerRef = useRef<HTMLDivElement>(null);
  const pannellumViewer = useRef<JointVibePannellumViewer | null>(null);
  
  const [scenes, setScenes] = useState<VenueScene[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<VenueHotspot | null>(null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [needsRotation, setNeedsRotation] = useState(false);
  const [tourName, setTourName] = useState("Venue Tour");

  const currentScene = scenes.find(s => s.id === currentSceneId);

  // Load floorplan data
  useEffect(() => {
    if (!isOpen) return;

    const data = readVenueFloorplan360<{
      scenes?: VenueScene[];
      name?: string;
      orientation?: 'portrait' | 'landscape';
    }>(venueId);
    const savedScenes = Array.isArray(data?.scenes) ? data.scenes : [];

    if (savedScenes.length > 0) {
      setScenes(savedScenes);
      setTourName(data?.name || "Venue Tour");
      setOrientation(data?.orientation === 'portrait' ? 'portrait' : 'landscape');
      
      const defaultScene = savedScenes.find((scene) => scene.isDefault) || savedScenes[0];
      setCurrentSceneId(defaultScene.id);
    } else {
      setScenes([]);
      setCurrentSceneId(null);
      setTourName("Venue Tour");
      setOrientation('landscape');
    }
  }, [isOpen, venueId]);

  // Check device orientation
  useEffect(() => {
    const checkOrientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      if (orientation === 'landscape' && isPortrait) {
        setNeedsRotation(true);
      } else if (orientation === 'portrait' && !isPortrait) {
        setNeedsRotation(true);
      } else {
        setNeedsRotation(false);
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [orientation]);

  // Initialize Pannellum viewer
  const initViewer = useCallback((scene: VenueScene) => {
    if (!viewerRef.current || !window.pannellum || !scene.is360) return;
    
    if (pannellumViewer.current) {
      pannellumViewer.current.destroy();
    }

    const pannellumHotspots = scene.hotspots.map(hs => {
      const config = HOTSPOT_CONFIG[hs.type] || { icon: '📍', label: 'Point', color: 'bg-gray-500' };
      return {
        id: hs.id,
        pitch: hs.pitch,
        yaw: hs.yaw,
        type: "custom",
        cssClass: `venue-hotspot venue-hotspot-${hs.type}`,
        createTooltipFunc: (hotSpotDiv: HTMLDivElement) => {
          hotSpotDiv.innerHTML = `
            <div class="hotspot-marker ${config.color} rounded-full w-12 h-12 flex items-center justify-center text-2xl cursor-pointer shadow-lg border-2 border-white animate-pulse" style="display:flex;align-items:center;justify-content:center;">
              ${config.icon}
            </div>
            <div class="hotspot-tooltip hidden absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black/90 text-white text-sm rounded-lg whitespace-nowrap z-50">
              <div class="font-bold">${hs.text || config.label}</div>
              ${hs.type === 'table' ? `<div class="text-xs">Seats: ${hs.capacity || 4}</div>` : ''}
              ${hs.type === 'goto' && hs.targetScene ? `<div class="text-xs">→ Click to go</div>` : ''}
            </div>
          `;
          
          hotSpotDiv.addEventListener('mouseenter', () => {
            const tooltip = hotSpotDiv.querySelector('.hotspot-tooltip');
            if (tooltip) tooltip.classList.remove('hidden');
          });
          hotSpotDiv.addEventListener('mouseleave', () => {
            const tooltip = hotSpotDiv.querySelector('.hotspot-tooltip');
            if (tooltip) tooltip.classList.add('hidden');
          });
        },
        clickHandlerFunc: () => {
          if (hs.type === 'goto' && hs.targetScene) {
            setCurrentSceneId(hs.targetScene);
            toast.info(`Moving to ${scenes.find(s => s.id === hs.targetScene)?.name || 'next area'}...`);
          } else {
            setSelectedHotspot(hs);
          }
        }
      };
    });

    pannellumViewer.current = window.pannellum.viewer(viewerRef.current, {
      type: "equirectangular",
      panorama: scene.panoramaUrl,
      autoLoad: true,
      showControls: true,
      compass: true,
      hotSpots: pannellumHotspots,
      mouseZoom: true,
      draggable: true,
      friction: 0.15,
      yaw: 0,
      pitch: 0,
      hfov: 100,
      minHfov: 50,
      maxHfov: 120,
    });
  }, [scenes]);

  // Re-init viewer when scene changes
  useEffect(() => {
    if (currentScene && currentScene.is360 && isOpen) {
      setTimeout(() => initViewer(currentScene), 100);
    }
    return () => {
      if (pannellumViewer.current) {
        pannellumViewer.current.destroy();
        pannellumViewer.current = null;
      }
    };
  }, [currentSceneId, currentScene, isOpen, initViewer]);

  if (!isOpen) return null;

  // Show rotation prompt if needed
  if (needsRotation) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
            <Smartphone className={`w-12 h-12 text-primary ${orientation === 'landscape' ? 'rotate-90' : ''}`} />
          </div>
          <h2 className="text-2xl font-bold mb-3">Rotate Your Device</h2>
          <p className="text-muted-foreground mb-6">
            This immersive experience is best viewed in {orientation} mode
          </p>
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" /> Exit
          </Button>
        </div>
      </div>
    );
  }

  // No floorplan data
  if (scenes.length === 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <RotateCcw className="w-12 h-12 text-yellow-500" />
          </div>
          <h2 className="text-2xl font-bold mb-3">No Immersive Tour Available</h2>
          <p className="text-muted-foreground mb-6">
            {isVenueOwner 
              ? "Create a 360° floorplan to enable the immersive experience"
              : "This venue hasn't set up their immersive tour yet"
            }
          </p>
          <Button onClick={onClose}>
            <X className="w-4 h-4 mr-2" /> Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900">
      {/* Custom styles */}
      <style>{`
        .venue-hotspot { cursor: pointer !important; }
        .venue-hotspot .hotspot-marker {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
        }
        .venue-hotspot:hover .hotspot-marker { transform: scale(1.2); }
        .pnlm-container { background: #1a1a2e !important; }
      `}</style>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{tourName}</h2>
            <p className="text-sm text-white/70">{currentScene?.name || 'Main Area'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-white" onClick={() => setShowAIChat(true)}>
              <Bot className="w-4 h-4 mr-2" /> AI Waiter
            </Button>
            <Button variant="ghost" size="sm" className="text-white" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Viewer */}
      <div className="absolute inset-0">
        {currentScene?.is360 ? (
          <div ref={viewerRef} className="w-full h-full" />
        ) : (
          <div className="w-full h-full relative">
            <img 
              src={currentScene?.panoramaUrl} 
              alt={currentScene?.name}
              className="w-full h-full object-cover"
            />
            {/* Regular image hotspots */}
            {currentScene?.hotspots.map((hs) => {
              const config = HOTSPOT_CONFIG[hs.type] || { icon: '📍', label: 'Point', color: 'bg-gray-500' };
              return (
                <div
                  key={hs.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer hover:scale-110 transition-transform"
                  style={{ left: `${hs.yaw}%`, top: `${hs.pitch}%` }}
                  onClick={() => {
                    if (hs.type === 'goto' && hs.targetScene) {
                      setCurrentSceneId(hs.targetScene);
                      toast.info(`Moving to ${scenes.find(s => s.id === hs.targetScene)?.name || 'next area'}...`);
                    } else {
                      setSelectedHotspot(hs);
                    }
                  }}
                >
                  <div className={`${config.color} rounded-full w-12 h-12 flex items-center justify-center text-2xl shadow-lg border-2 border-white animate-pulse`}>
                    {config.icon}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scene Navigation */}
      {scenes.length > 1 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
          {scenes.map((scene, i) => (
            <button
              key={scene.id}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                currentSceneId === scene.id 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              onClick={() => setCurrentSceneId(scene.id)}
            >
              {scene.name}
              {scene.is360 && <Badge variant="secondary" className="ml-2 text-[10px] px-1">360°</Badge>}
            </button>
          ))}
        </div>
      )}

      {/* Selected Hotspot Info */}
      {selectedHotspot && (
        <div className="absolute bottom-4 left-4 right-4 z-10 max-w-md mx-auto">
          <Card className="bg-slate-800/95 backdrop-blur-sm border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`${HOTSPOT_CONFIG[selectedHotspot.type]?.color || 'bg-gray-500'} rounded-full w-12 h-12 flex items-center justify-center text-2xl`}>
                    {HOTSPOT_CONFIG[selectedHotspot.type]?.icon || '📍'}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{selectedHotspot.text}</h3>
                    <p className="text-sm text-white/70">{HOTSPOT_CONFIG[selectedHotspot.type]?.label || 'Point'}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedHotspot(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {selectedHotspot.type === 'table' && (
                <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-sm text-white/70">
                      <Users className="w-4 h-4" />
                      <span>{selectedHotspot.capacity} seats</span>
                    </div>
                    {isVenueOwner && (
                      <Badge className={
                        selectedHotspot.status === 'available' ? 'bg-green-500' :
                        selectedHotspot.status === 'occupied' ? 'bg-red-500' : 'bg-yellow-500'
                      }>
                        {selectedHotspot.status || 'available'}
                      </Badge>
                    )}
                  </div>
                  {!isVenueOwner && (
                    <Button size="sm" onClick={() => setShowAIChat(true)}>
                      <MessageSquare className="w-4 h-4 mr-2" /> Order Here
                    </Button>
                  )}
                </div>
              )}

              {isVenueOwner && selectedHotspot.type === 'table' && (
                <div className="mt-3 pt-3 border-t border-slate-700 text-sm text-white/70 space-y-1">
                  <p>Table #{selectedHotspot.tableNumber}</p>
                  <p>Today's Orders: 12</p>
                  <p>Revenue: $284.50</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI Chat Floating Button */}
      <Button
        className="absolute bottom-4 right-4 z-10 rounded-full w-14 h-14 bg-gradient-to-r from-cyan-500 to-purple-500 shadow-lg"
        onClick={() => setShowAIChat(true)}
      >
        <MessageSquare className="w-6 h-6" />
      </Button>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="flex flex-wrap gap-2 bg-black/60 backdrop-blur-sm rounded-lg p-2">
          {Object.entries(HOTSPOT_CONFIG).slice(0, 5).map(([type, config]) => (
            <div key={type} className="flex items-center gap-1 text-xs text-white/70">
              <span>{config.icon}</span>
              <span>{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Chat Modal */}
      {showAIChat && (
        <AIChat
          context="ai_waiter"
          onClose={() => setShowAIChat(false)}
        />
      )}
    </div>
  );
}

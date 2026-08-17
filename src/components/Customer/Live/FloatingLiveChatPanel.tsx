import { useState, useRef, useCallback, useEffect } from "react";
import { MessageCircle, X, Minus, Maximize2, GripVertical } from "lucide-react";
import LiveChatPanel from "./LiveChatPanel";
import { useTranslation } from 'react-i18next';

interface FloatingLiveChatPanelProps {
  streamId: string;
}

type PanelSize = "small" | "medium" | "large";

const SIZES: Record<PanelSize, { w: number; h: number }> = {
  small: { w: 280, h: 220 },
  medium: { w: 320, h: 300 },
  large: { w: 360, h: 400 },
};

const FloatingLiveChatPanel = ({ streamId }: FloatingLiveChatPanelProps) => {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const [size, setSize] = useState<PanelSize>("medium");
  const [position, setPosition] = useState({ x: 12, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Clamp position to viewport
  const clamp = useCallback((pos: { x: number; y: number }) => {
    const dim = SIZES[size];
    return {
      x: Math.max(0, Math.min(pos.x, window.innerWidth - dim.w)),
      y: Math.max(0, Math.min(pos.y, window.innerHeight - dim.h)),
    };
  }, [size]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    setIsDragging(true);
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition(clamp({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    }));
  }, [isDragging, clamp]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const cycleSize = () => {
    const order: PanelSize[] = ["small", "medium", "large"];
    const idx = order.indexOf(size);
    setSize(order[(idx + 1) % order.length]);
  };

  // Collapsed bubble
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed z-[999] bottom-28 right-4 w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/30 flex items-center justify-center hover:scale-110 transition-transform"
      >
        <MessageCircle className="w-6 h-6 text-white" />
      </button>
    );
  }

  const dim = SIZES[size];

  return (
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="fixed z-[999] rounded-2xl overflow-hidden border border-white/20 bg-black/80 backdrop-blur-xl shadow-2xl flex flex-col select-none"
      style={{
        left: position.x,
        top: position.y,
        width: dim.w,
        height: dim.h,
        cursor: isDragging ? "grabbing" : "default",
        touchAction: "none",
      }}
    >
      {/* Drag handle / header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/5 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5">
          <GripVertical className="w-4 h-4 text-white/40" />
          <span className="text-xs font-semibold text-white/70">Live Chat</span>
        </div>
        <div className="flex items-center gap-1" data-no-drag>
          <button onClick={cycleSize} className="p-1 hover:bg-white/10 rounded transition-colors">
            <Maximize2 className="w-3.5 h-3.5 text-white/50" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded transition-colors">
            <Minus className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>
      </div>

      {/* Chat body */}
      <div className="flex-1 overflow-hidden" data-no-drag>
        <LiveChatPanel streamId={streamId} />
      </div>
    </div>
  );
};

export default FloatingLiveChatPanel;

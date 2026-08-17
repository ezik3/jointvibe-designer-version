import { useState, useCallback, useRef } from 'react';

export type PipShape = 'rectangle' | 'rounded' | 'circle';
export type PipSize = 'small' | 'medium' | 'large';

interface PipPosition {
  x: number; // percentage from left (0-100)
  y: number; // percentage from top (0-100)
}

interface PipConfig {
  position: PipPosition;
  size: PipSize;
  shape: PipShape;
  isMainSwapped: boolean; // true = PiP source is now main
}

interface UsePipControlsReturn {
  config: PipConfig;
  setPosition: (pos: PipPosition) => void;
  setSize: (size: PipSize) => void;
  setShape: (shape: PipShape) => void;
  toggleSwap: () => void;
  startDrag: (clientX: number, clientY: number, containerRect: DOMRect, pointerId?: number) => void;
  updateDrag: (clientX: number, clientY: number, containerRect: DOMRect, pointerId?: number) => void;
  endDrag: () => void;
  isDragging: boolean;
  getSizeMultiplier: () => number;
  getBorderRadius: (width: number, height: number) => number;
}

/**
 * Hook for Picture-in-Picture controls: drag, resize, shape, swap
 */
export const usePipControls = (initialConfig?: Partial<PipConfig>): UsePipControlsReturn => {
  // Refs first to ensure stable order
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);

  // State hooks
  const [config, setConfig] = useState<PipConfig>(() => ({
    position: { x: 75, y: 70 },
    size: 'medium',
    shape: 'rounded',
    isMainSwapped: false,
    ...initialConfig,
  }));
  const [isDragging, setIsDragging] = useState(false);

  const setPosition = useCallback((pos: PipPosition) => {
    // Clamp position to valid range
    setConfig(prev => ({
      ...prev,
      position: {
        x: Math.max(5, Math.min(95, pos.x)),
        y: Math.max(5, Math.min(95, pos.y)),
      },
    }));
  }, []);

  const setSize = useCallback((size: PipSize) => {
    setConfig(prev => ({ ...prev, size }));
  }, []);

  const setShape = useCallback((shape: PipShape) => {
    setConfig(prev => ({ ...prev, shape }));
  }, []);

  const toggleSwap = useCallback(() => {
    setConfig(prev => ({ ...prev, isMainSwapped: !prev.isMainSwapped }));
  }, []);

  const getSizeMultiplier = useCallback((): number => {
    switch (config.size) {
      case 'small': return 0.15;
      case 'medium': return 0.22;
      case 'large': return 0.30;
      default: return 0.22;
    }
  }, [config.size]);

  const getBorderRadius = useCallback((width: number, height: number): number => {
    switch (config.shape) {
      case 'rectangle': return 8;
      case 'rounded': return 16;
      case 'circle': return Math.max(width, height); // Full circle
      default: return 16;
    }
  }, [config.shape]);

  const startDrag = useCallback((clientX: number, clientY: number, containerRect: DOMRect, pointerId?: number) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    if (pointerId !== undefined) activePointerIdRef.current = pointerId;
    
    // Calculate offset from PiP center
    const pipCenterX = (config.position.x / 100) * containerRect.width;
    const pipCenterY = (config.position.y / 100) * containerRect.height;
    
    dragOffsetRef.current = {
      x: clientX - containerRect.left - pipCenterX,
      y: clientY - containerRect.top - pipCenterY,
    };
  }, [config.position]);

  const updateDrag = useCallback((clientX: number, clientY: number, containerRect: DOMRect, pointerId?: number) => {
    if (!isDraggingRef.current) return;
    if (pointerId !== undefined && activePointerIdRef.current !== null && pointerId !== activePointerIdRef.current) return;

    const newX = clientX - containerRect.left - dragOffsetRef.current.x;
    const newY = clientY - containerRect.top - dragOffsetRef.current.y;

    const percentX = (newX / containerRect.width) * 100;
    const percentY = (newY / containerRect.height) * 100;

    setPosition({ x: percentX, y: percentY });
  }, [setPosition]);

  const endDrag = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    activePointerIdRef.current = null;
  }, []);

  return {
    config,
    setPosition,
    setSize,
    setShape,
    toggleSwap,
    startDrag,
    updateDrag,
    endDrag,
    isDragging,
    getSizeMultiplier,
    getBorderRadius,
  };
};

/**
 * Calculate PiP dimensions and position for canvas drawing
 */
export const calculatePipRect = (
  canvasWidth: number,
  canvasHeight: number,
  pipVideoWidth: number,
  pipVideoHeight: number,
  config: PipConfig,
  getSizeMultiplier: () => number,
  getBorderRadius: (w: number, h: number) => number
) => {
  const sizeMultiplier = getSizeMultiplier();
  const pipWidth = canvasWidth * sizeMultiplier;
  const pipHeight = (pipVideoHeight / pipVideoWidth) * pipWidth;
  
  // Convert percentage position to pixels (position is center of PiP)
  const centerX = (config.position.x / 100) * canvasWidth;
  const centerY = (config.position.y / 100) * canvasHeight;
  
  // Calculate top-left corner from center
  let pipX = centerX - pipWidth / 2;
  let pipY = centerY - pipHeight / 2;
  
  // Clamp to canvas bounds with margin
  const margin = 10;
  pipX = Math.max(margin, Math.min(canvasWidth - pipWidth - margin, pipX));
  pipY = Math.max(margin, Math.min(canvasHeight - pipHeight - margin, pipY));

  const borderRadius = getBorderRadius(pipWidth, pipHeight);

  return { pipX, pipY, pipWidth, pipHeight, borderRadius };
};

/**
 * Draw PiP onto canvas with configurable shape
 */
export const drawPipOnCanvas = (
  ctx: CanvasRenderingContext2D,
  pipVideo: HTMLVideoElement,
  rect: { pipX: number; pipY: number; pipWidth: number; pipHeight: number; borderRadius: number },
  mirror: boolean = false
) => {
  const { pipX, pipY, pipWidth, pipHeight, borderRadius } = rect;

  // Draw shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 25;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  // Draw border background
  ctx.beginPath();
  ctx.roundRect(pipX - 3, pipY - 3, pipWidth + 6, pipHeight + 6, borderRadius + 3);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Clip for rounded/circle corners
  ctx.beginPath();
  ctx.roundRect(pipX, pipY, pipWidth, pipHeight, borderRadius);
  ctx.clip();

  // Draw video (mirrored for front camera)
  if (mirror) {
    ctx.translate(pipX + pipWidth, pipY);
    ctx.scale(-1, 1);
    ctx.drawImage(pipVideo, 0, 0, pipWidth, pipHeight);
  } else {
    ctx.drawImage(pipVideo, pipX, pipY, pipWidth, pipHeight);
  }

  ctx.restore();
};

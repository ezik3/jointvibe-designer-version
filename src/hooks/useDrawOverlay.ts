import { useCallback, useMemo, useRef, useState } from "react";
import type React from "react";

type PointN = { x: number; y: number }; // normalized 0..1
export type DrawStroke = {
  color: string; // resolved CSS color string (e.g. "hsl(222.2 47.4% 11.2%)" or "#ff3399")
  size: number; // px
  points: PointN[];
};

export type DrawColorOption = {
  id: string;
  label: string;
  className: string; // semantic token class for UI swatch
  cssColor: string; // resolved color for canvas strokeStyle
};

type BaseColor = {
  id: string;
  label: string;
  className: string;
  cssVarName: `--${string}`;
  fallback: string;
};

const BASE_COLORS: BaseColor[] = [
  { id: "primary", label: "Primary", className: "bg-primary", cssVarName: "--primary", fallback: "#7c3aed" },
  { id: "accent", label: "Accent", className: "bg-accent", cssVarName: "--accent", fallback: "#22d3ee" },
  { id: "foreground", label: "Ink", className: "bg-foreground", cssVarName: "--foreground", fallback: "#111827" },
  { id: "destructive", label: "Red", className: "bg-destructive", cssVarName: "--destructive", fallback: "#ef4444" },
];

function resolveHslVar(cssVarName: `--${string}`, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
  // CSS vars in this project are stored as: "H S% L%" (space separated)
  return raw ? `hsl(${raw})` : fallback;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function getCanvasPointNormalized(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement
): PointN {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  return {
    x: clamp01((e.clientX - rect.left) / rect.width),
    y: clamp01((e.clientY - rect.top) / rect.height),
  };
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawStroke, w: number, h: number) {
  if (stroke.points.length < 1) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  const p0 = stroke.points[0];
  ctx.moveTo(p0.x * w, p0.y * h);
  for (let i = 1; i < stroke.points.length; i++) {
    const p = stroke.points[i];
    ctx.lineTo(p.x * w, p.y * h);
  }
  ctx.stroke();
}

export function useDrawOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const colors = useMemo<DrawColorOption[]>(() => {
    return BASE_COLORS.map((c) => ({
      id: c.id,
      label: c.label,
      className: c.className,
      cssColor: resolveHslVar(c.cssVarName, c.fallback),
    }));
  }, []);

  const [enabled, setEnabled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const [customColor, setCustomColorState] = useState<string>("#ff3399");
  const [color, setColor] = useState<DrawColorOption>(() => {
    return colors.find((c) => c.id === "foreground") ?? colors[0];
  });
  const [size, setSize] = useState<number>(8);

  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [redoStack, setRedoStack] = useState<DrawStroke[]>([]);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawStroke | null>(null);

  const clear = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const undo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const removed = prev[prev.length - 1];
      setRedoStack((r) => [removed, ...r]);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const [restore, ...rest] = prev;
      setStrokes((s) => [...s, restore]);
      return rest;
    });
  }, []);

  const setCustomColor = useCallback((hex: string) => {
    setCustomColorState(hex);
    setColor({ id: "custom", label: "Custom", className: "", cssColor: hex });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      e.preventDefault();
      e.stopPropagation();

      isDrawingRef.current = true;
      const p = getCanvasPointNormalized(e, canvas);
      const newStroke: DrawStroke = { color: color.cssColor, size, points: [p] };
      currentStrokeRef.current = newStroke;
      setRedoStack([]);

      // draw a dot immediately
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawStroke(ctx, newStroke, canvas.width, canvas.height);
      }
    },
    [enabled, color.cssColor, size]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      const stroke = currentStrokeRef.current;
      if (!canvas || !stroke) return;

      e.preventDefault();

      const p = getCanvasPointNormalized(e, canvas);
      const last = stroke.points[stroke.points.length - 1];
      if (Math.abs(p.x - last.x) < 0.001 && Math.abs(p.y - last.y) < 0.001) return;

      stroke.points.push(p);

      const ctx = canvas.getContext("2d");
      if (ctx) {
        // incremental draw for responsiveness
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(last.x * canvas.width, last.y * canvas.height);
        ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
        ctx.stroke();
      }
    },
    [enabled]
  );

  const finishStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (!stroke) return;
    setStrokes((prev) => [...prev, stroke]);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      e.preventDefault();
      finishStroke();
    },
    [enabled, finishStroke]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      e.preventDefault();
      finishStroke();
    },
    [enabled, finishStroke]
  );

  const canUndo = strokes.length > 0;
  const canRedo = redoStack.length > 0;

  return {
    canvasRef,
    enabled,
    setEnabled,
    panelOpen,
    setPanelOpen,
    colors,
    color,
    setColor,
    customColor,
    setCustomColor,
    size,
    setSize,
    canUndo,
    canRedo,
    undo,
    redo,
    clear,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}


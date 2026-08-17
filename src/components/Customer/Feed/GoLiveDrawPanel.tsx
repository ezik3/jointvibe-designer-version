import { AnimatePresence, motion } from "framer-motion";
import { Trash2, Undo2, Redo2, ChevronDown, Check, Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { DrawColorOption } from "@/hooks/useDrawOverlay";
import { useTranslation } from 'react-i18next';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisableDrawing: () => void;
  colors: DrawColorOption[];
  color: DrawColorOption;
  onColor: (c: DrawColorOption) => void;
  customColor: string;
  onCustomColor: (hex: string) => void;
  size: number;
  onSize: (s: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
};

export default function GoLiveDrawPanel({
  open,
  onOpenChange,
  onDisableDrawing,
  colors,
  color,
  onColor,
  customColor,
  onCustomColor,
  size,
  onSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: Props) {
  const { t } = useTranslation('feed');
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          className="absolute bottom-24 left-4 right-4 z-30 pointer-events-auto"
        >
          <div className="rounded-2xl border border-border/50 bg-background/35 backdrop-blur-md p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  className="h-9 w-9 rounded-full bg-background/25 border border-border/40"
                  aria-label={t("golive.collapse_drawing_tools")}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-2">
                  {colors.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onColor(c)}
                      className={`h-8 w-8 rounded-full border ${c.className} ${
                        c.id === color.id
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background/20"
                          : "border-border/60"
                      }`}
                      aria-label={c.label}
                    />
                  ))}

                  {/* Full color picker (millions of colors) */}
                  <label
                    className={`relative h-8 w-8 rounded-full border border-border/60 overflow-hidden cursor-pointer ${
                      color.id === "custom"
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background/20"
                        : ""
                    }`}
                    style={{ backgroundColor: customColor }}
                    aria-label={t("golive.pick_any_color")}
                    title={t("golive.pick_any_color")}
                  >
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => onCustomColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Pipette className="h-4 w-4 text-foreground/80" />
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="h-9 w-9 rounded-full bg-background/25 border border-border/40"
                  aria-label={t("common:actions.undo")}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="h-9 w-9 rounded-full bg-background/25 border border-border/40"
                  aria-label={t("common:actions.redo")}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClear}
                  className="h-9 w-9 rounded-full bg-background/25 border border-border/40"
                  aria-label={t("common:actions.clear")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onDisableDrawing}
                  className="h-9 w-9 rounded-full bg-background/25 border border-border/40"
                  aria-label={t("common:actions.done")}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="text-xs text-foreground/80 w-10">{t("golive.size")}</div>
              <Slider
                value={[size]}
                min={2}
                max={28}
                step={1}
                onValueChange={(v) => onSize(v[0] ?? 8)}
                className="flex-1"
              />
              <div className="text-xs text-foreground/80 w-10 text-right">{Math.round(size)}</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

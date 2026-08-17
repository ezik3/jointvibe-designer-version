import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brush,
  ChevronRight,
  Circle,
  Maximize2,
  Minimize2,
  RectangleHorizontal,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';

type Props = {
  hasPipControls: boolean;
  pipSize?: "small" | "medium" | "large";
  pipShape?: "rectangle" | "rounded" | "circle";
  onSwap?: () => void;
  onCycleSize?: () => void;
  onCycleShape?: () => void;
  drawEnabled: boolean;
  drawPanelOpen: boolean;
  onBrushPress: () => void;
};

export default function GoLiveSideRail({
  hasPipControls,
  pipSize,
  pipShape,
  onSwap,
  onCycleSize,
  onCycleShape,
  drawEnabled,
  drawPanelOpen,
  onBrushPress,
}: Props) {
  const { t } = useTranslation('feed');
  const [hidden, setHidden] = React.useState(false);

  const sizeIcon =
    pipSize === "small" ? Minimize2 : pipSize === "large" ? Maximize2 : RectangleHorizontal;
  const ShapeIcon = pipShape === "circle" ? Circle : RectangleHorizontal;

  const ToolButton = ({
    children,
    onClick,
    ariaLabel,
    active,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    ariaLabel: string;
    active?: boolean;
  }) => (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="icon"
      onClick={onClick}
      className={
        active
          ? "h-11 w-11 rounded-full shadow-sm"
          : "h-11 w-11 rounded-full bg-background/25 backdrop-blur-md border border-border/40 shadow-sm"
      }
      aria-label={ariaLabel}
    >
      {children}
    </Button>
  );

  return (
    <>
      <AnimatePresence>
        {!hidden && (
          <motion.div
            key="rail"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 140 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 60) setHidden(true);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-auto"
          >
            <div className="flex flex-col items-center gap-3">
              {hasPipControls && (
                <ToolButton onClick={onSwap} ariaLabel={t("golive.swap")}>
                  <RefreshCw className="h-5 w-5 text-foreground" />
                </ToolButton>
              )}

              {hasPipControls && (
                <ToolButton onClick={onCycleSize} ariaLabel={t("golive.pip_size")}>
                  {(() => {
                    const Icon = sizeIcon;
                    return <Icon className="h-5 w-5 text-foreground" />;
                  })()}
                </ToolButton>
              )}

              {hasPipControls && (
                <ToolButton onClick={onCycleShape} ariaLabel={t("golive.pip_shape")}>
                  <ShapeIcon className="h-5 w-5 text-foreground" />
                </ToolButton>
              )}

              <ToolButton
                onClick={onBrushPress}
                ariaLabel={drawEnabled ? t("golive.drawing_tools") : t("golive.enable_drawing")}
                active={drawEnabled}
              >
                <Brush className="h-5 w-5" />
              </ToolButton>

              {drawEnabled && !drawPanelOpen && (
                <div className="text-[10px] text-foreground/70 bg-background/20 border border-border/30 px-2 py-0.5 rounded-full">
                  {t("golive.tap_brush")}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hidden && (
          <motion.div
            key="handleWrap"
            initial={{ x: 18, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 18, opacity: 0 }}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 pointer-events-auto"
          >
            <Button
              type="button"
              variant={drawEnabled ? "default" : "ghost"}
              size="icon"
              onClick={onBrushPress}
              className={
                drawEnabled
                  ? "h-10 w-10 rounded-full shadow-sm"
                  : "h-10 w-10 rounded-full bg-background/25 backdrop-blur-md border border-border/40 shadow-sm"
              }
              aria-label={t("golive.drawing")}
            >
              <Brush className="h-5 w-5" />
            </Button>

            <motion.button
              type="button"
              onClick={() => setHidden(false)}
              className="h-16 w-9 rounded-l-full bg-background/25 backdrop-blur-md border border-border/40 flex items-center justify-center"
              aria-label={t("golive.show_controls")}
            >
              <ChevronRight className="h-5 w-5 text-foreground" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

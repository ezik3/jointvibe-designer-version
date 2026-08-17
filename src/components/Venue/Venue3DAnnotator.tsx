import { useState, useEffect, Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html, ContactShadows } from "@react-three/drei";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, MapPin, Trash2, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as THREE from "three";
import { useTranslation } from 'react-i18next';

interface Hotspot {
  id: string;
  type: string;
  label: string;
  position: [number, number, number];
}

interface Venue3DAnnotatorProps {
  venueId: string;
  modelUrl: string;
  modelId: string;
  existingHotspots?: Hotspot[];
}

const HOTSPOT_TYPES: Record<string, { label: string; emoji: string; color: string }> = {
  table: { label: "Table", emoji: "🪑", color: "#00d9ff" },
  bar: { label: "Bar", emoji: "🍸", color: "#a855f7" },
  toilet: { label: "Restroom", emoji: "🚻", color: "#14b8a6" },
  dj: { label: "DJ Booth", emoji: "🎧", color: "#ec4899" },
  stage: { label: "Stage", emoji: "🎤", color: "#f59e0b" },
  entry: { label: "Entry", emoji: "🚪", color: "#22c55e" },
  exit: { label: "Exit", emoji: "🚪", color: "#ef4444" },
  vip: { label: "VIP Area", emoji: "⭐", color: "#eab308" },
};

// 3D Model component
const VenueModel = ({ url, onPointerClick }: { url: string; onPointerClick: (point: THREE.Vector3) => void }) => {
  const { scene } = useGLTF(url);

  return (
    <primitive
      object={scene}
      onClick={(e: any) => {
        e.stopPropagation();
        onPointerClick(e.point);
      }}
    />
  );
};

// Hotspot marker in 3D
const HotspotMarker = ({ hotspot, selected, onClick }: { hotspot: Hotspot; selected: boolean; onClick: () => void }) => {
  const config = HOTSPOT_TYPES[hotspot.type] || HOTSPOT_TYPES.table;

  return (
    <group position={hotspot.position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color={config.color}
          emissive={config.color}
          emissiveIntensity={selected ? 1.5 : 0.5}
          transparent
          opacity={0.8}
        />
      </mesh>
      <Html position={[0, 0.4, 0]} center distanceFactor={8}>
        <div
          className={`px-2 py-1 rounded-lg text-xs whitespace-nowrap font-medium ${
            selected ? "bg-primary text-primary-foreground scale-110" : "bg-black/70 text-white"
          }`}
          style={{ pointerEvents: "none" }}
        >
          {config.emoji} {hotspot.label}
        </div>
      </Html>
    </group>
  );
};

const Venue3DAnnotator = ({ venueId, modelUrl, modelId, existingHotspots = [] }: Venue3DAnnotatorProps) => {
  const { t } = useTranslation('venue');
  const [hotspots, setHotspots] = useState<Hotspot[]>(existingHotspots);
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addType, setAddType] = useState<string>("table");
  const [saving, setSaving] = useState(false);

  const handleSceneClick = useCallback((point: THREE.Vector3) => {
    if (!addMode) return;

    const config = HOTSPOT_TYPES[addType];
    const newHotspot: Hotspot = {
      id: crypto.randomUUID(),
      type: addType,
      label: `${config.label} ${hotspots.filter(h => h.type === addType).length + 1}`,
      position: [point.x, point.y + 0.2, point.z],
    };

    setHotspots(prev => [...prev, newHotspot]);
    toast.success(`${config.emoji} ${config.label} marker added!`);
  }, [addMode, addType, hotspots]);

  const removeHotspot = (id: string) => {
    setHotspots(prev => prev.filter(h => h.id !== id));
    setSelectedHotspot(null);
    toast.success("Marker removed.");
  };

  const saveHotspots = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("venue_3d_models" as any)
        .update({ hotspots: JSON.stringify(hotspots), updated_at: new Date().toISOString() })
        .eq("id", modelId);

      if (error) throw error;
      toast.success("Hotspots saved!");
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-cyan/20 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="w-5 h-5 text-cyan" />
            Annotate Your 3D Venue
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={addMode ? "default" : "outline"}
              size="sm"
              onClick={() => setAddMode(!addMode)}
            >
              <Plus className="w-4 h-4 mr-1" />
              {addMode ? "Click to Place" : "Add Marker"}
            </Button>
            <Button size="sm" onClick={saveHotspots} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {addMode && (
          <div className="flex items-center gap-3 p-3 bg-cyan/10 rounded-xl border border-cyan/20">
            <span className="text-sm text-muted-foreground">Marker type:</span>
            <Select value={addType} onValueChange={setAddType}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(HOTSPOT_TYPES).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.emoji} {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Click on the 3D model to place</span>
          </div>
        )}

        {/* 3D Canvas */}
        <div className="w-full h-[400px] rounded-xl overflow-hidden border border-border bg-black">
          <Canvas camera={{ position: [0, 5, 8], fov: 50 }}>
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 10, 5]} intensity={0.6} />
            <pointLight position={[0, 3, 0]} intensity={0.3} color="#00d9ff" />

            <Suspense fallback={null}>
              <VenueModel url={modelUrl} onPointerClick={handleSceneClick} />
            </Suspense>

            {hotspots.map(hotspot => (
              <HotspotMarker
                key={hotspot.id}
                hotspot={hotspot}
                selected={selectedHotspot === hotspot.id}
                onClick={() => setSelectedHotspot(hotspot.id)}
              />
            ))}

            <ContactShadows position={[0, -0.01, 0]} opacity={0.4} blur={2} />
            <OrbitControls maxPolarAngle={Math.PI / 2.1} minDistance={2} maxDistance={20} />
          </Canvas>
        </div>

        {/* Hotspot list */}
        {hotspots.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Markers ({hotspots.length})</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {hotspots.map(h => {
                const cfg = HOTSPOT_TYPES[h.type] || HOTSPOT_TYPES.table;
                return (
                  <div
                    key={h.id}
                    className={`flex items-center justify-between p-2 rounded-lg border text-sm cursor-pointer ${
                      selectedHotspot === h.id ? "border-cyan bg-cyan/10" : "border-border"
                    }`}
                    onClick={() => setSelectedHotspot(h.id)}
                  >
                    <span>{cfg.emoji} {h.label}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => { e.stopPropagation(); removeHotspot(h.id); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Venue3DAnnotator;

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, ContactShadows, Html } from "@react-three/drei";
import * as THREE from "three";
import { useTranslation } from 'react-i18next';

interface Hotspot {
  id: string;
  type: string;
  label: string;
  position: [number, number, number];
}

interface Venue3DBackgroundProps {
  modelUrl: string;
  modelType: string;
  hotspots?: any;
}

const HOTSPOT_CONFIGS: Record<string, { emoji: string; color: string }> = {
  table: { emoji: "🪑", color: "#00d9ff" },
  bar: { emoji: "🍸", color: "#a855f7" },
  toilet: { emoji: "🚻", color: "#14b8a6" },
  dj: { emoji: "🎧", color: "#ec4899" },
  stage: { emoji: "🎤", color: "#f59e0b" },
  entry: { emoji: "🚪", color: "#22c55e" },
  exit: { emoji: "🚪", color: "#ef4444" },
  vip: { emoji: "⭐", color: "#eab308" },
};

// Auto-rotating camera rig
const AutoRotate = () => {
  const { t } = useTranslation('venue');
  const ref = useRef<any>(null);

  useFrame((_state, delta) => {
    if (ref.current) {
      ref.current.azimuthAngle += delta * 0.1;
      ref.current.update();
    }
  });

  return (
    <OrbitControls
      ref={ref}
      enableZoom={false}
      enablePan={false}
      maxPolarAngle={Math.PI / 2.2}
      minPolarAngle={Math.PI / 4}
      autoRotate={false}
    />
  );
};

// GLB Model renderer
const VenueGLBModel = ({ url }: { url: string }) => {
  const { scene } = useGLTF(url);

  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = child.material as THREE.MeshStandardMaterial;
      if (mat.emissive) {
        mat.emissiveIntensity = 0.05;
      }
    }
  });

  return <primitive object={scene} />;
};

// Pulsing hotspot marker for customer view
const CustomerHotspot = ({ hotspot }: { hotspot: Hotspot }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const cfg = HOTSPOT_CONFIGS[hotspot.type] || HOTSPOT_CONFIGS.table;

  useFrame((state) => {
    if (meshRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.15;
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group position={hotspot.position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial
          color={cfg.color}
          emissive={cfg.color}
          emissiveIntensity={0.8}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* Glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.3, 32]} />
        <meshStandardMaterial
          color={cfg.color}
          emissive={cfg.color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Html position={[0, 0.35, 0]} center distanceFactor={10}>
        <div
          className="px-2 py-1 rounded-lg text-xs whitespace-nowrap font-medium bg-black/60 text-white backdrop-blur-sm border border-white/10"
          style={{ pointerEvents: "none" }}
        >
          {cfg.emoji} {hotspot.label}
        </div>
      </Html>
    </group>
  );
};

// Fallback ambient scene
const FallbackScene = () => (
  <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial color="#0a0a1a" roughness={0.2} metalness={0.8} />
    </mesh>
    <gridHelper args={[30, 30, "#1a1a3e", "#111"]} />
  </>
);

const Venue3DBackground = ({ modelUrl, modelType, hotspots }: Venue3DBackgroundProps) => {
  // Parse hotspots - could be JSON string or array
  const parsedHotspots: Hotspot[] = useMemo(() => {
    if (!hotspots) return [];
    try {
      const data = typeof hotspots === "string" ? JSON.parse(hotspots) : hotspots;
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, [hotspots]);

  return (
    <div className="fixed inset-0 pointer-events-auto" style={{ zIndex: 1 }}>
      <Canvas
        camera={{ position: [0, 3, 6], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        {/* Moody lighting */}
        <ambientLight intensity={0.15} />
        <directionalLight position={[5, 8, 5]} intensity={0.3} color="#ffffff" />
        <pointLight position={[0, 3, 0]} intensity={0.4} color="#00d9ff" distance={15} />
        <pointLight position={[-3, 2, -3]} intensity={0.2} color="#a855f7" distance={10} />
        <pointLight position={[3, 2, 3]} intensity={0.2} color="#ec4899" distance={10} />

        {/* Fog for atmosphere */}
        <fog attach="fog" args={["#050510", 5, 25]} />

        <Suspense fallback={<FallbackScene />}>
          {modelUrl && modelType === "glb" ? (
            <VenueGLBModel url={modelUrl} />
          ) : (
            <FallbackScene />
          )}
        </Suspense>

        {/* Render customer-facing hotspot markers */}
        {parsedHotspots.map((hotspot) => (
          <CustomerHotspot key={hotspot.id} hotspot={hotspot} />
        ))}

        <ContactShadows position={[0, -0.01, 0]} opacity={0.3} blur={2} far={10} />
        <AutoRotate />
      </Canvas>
    </div>
  );
};

export default Venue3DBackground;

import { useRef, useState } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { useTranslation } from 'react-i18next';

interface SyncedTable {
  id: string;
  number: string;
  capacity: number;
  status: string;
  section: string;
  x: number;
  y: number;
  order?: string;
  guestCount?: number;
  duration?: string;
  reservationTime?: string;
}

interface ThreeDVenueViewerProps {
  tables: SyncedTable[];
  selectedTable: string | null;
  onTableSelect: (id: string) => void;
}

const STATUS_COLORS: Record<string, { color: string; emissive: string; emissiveIntensity: number }> = {
  available: { color: "#0a2a1a", emissive: "#00ff88", emissiveIntensity: 0.4 },
  occupied: { color: "#2a0a0a", emissive: "#ff4444", emissiveIntensity: 0.6 },
  reserved: { color: "#2a1a0a", emissive: "#ffaa00", emissiveIntensity: 0.5 },
};

function TableMesh3D({
  table,
  selected,
  onClick,
}: {
  table: SyncedTable;
  selected: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Convert 0-100 percentage coords to 3D space (-10 to 10)
  const posX = ((table.x - 50) / 50) * 9;
  const posZ = ((table.y - 50) / 50) * 9;

  // Radius based on capacity
  const radius = Math.min(0.3 + table.capacity * 0.06, 0.8);
  const height = 0.15;

  const statusStyle = STATUS_COLORS[table.status] || STATUS_COLORS.available;

  // Subtle hover/select animation
  useFrame(() => {
    if (!meshRef.current) return;
    const targetScale = selected ? 1.15 : hovered ? 1.08 : 1;
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.1
    );
  });

  return (
    <group position={[posX, 0, posZ]}>
      {/* Table top */}
      <mesh
        ref={meshRef}
        position={[0, height / 2 + 0.01, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        castShadow
      >
        <cylinderGeometry args={[radius, radius, height, 32]} />
        <meshStandardMaterial
          color={statusStyle.color}
          emissive={statusStyle.emissive}
          emissiveIntensity={
            selected
              ? statusStyle.emissiveIntensity * 2
              : hovered
              ? statusStyle.emissiveIntensity * 1.4
              : statusStyle.emissiveIntensity
          }
          metalness={0.3}
          roughness={0.6}
        />
      </mesh>

      {/* Selection ring */}
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius + 0.05, radius + 0.12, 32]} />
          <meshBasicMaterial
            color="#8b5cf6"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Chair dots around table */}
      {Array.from({ length: Math.min(table.capacity, 8) }).map((_, i) => {
        const angle = (i / Math.min(table.capacity, 8)) * Math.PI * 2;
        const chairDist = radius + 0.25;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * chairDist,
              0.05,
              Math.sin(angle) * chairDist,
            ]}
          >
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial
              color="#333"
              emissive={table.status === "occupied" ? "#ff4444" : "#444"}
              emissiveIntensity={0.2}
              metalness={0.5}
              roughness={0.4}
            />
          </mesh>
        );
      })}

      {/* Floating label */}
      <Text
        position={[0, 0.6, 0]}
        fontSize={0.25}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        T{table.number}
      </Text>

      {/* Capacity label */}
      <Text
        position={[0, 0.35, 0]}
        fontSize={0.13}
        color="#aaa"
        anchorX="center"
        anchorY="middle"
      >
        {table.capacity} seats
      </Text>

      {/* Status glow ring on floor */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.02, radius + 0.02, 32]} />
        <meshBasicMaterial
          color={statusStyle.emissive}
          transparent
          opacity={selected ? 0.6 : 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function FloorScene({
  tables,
  selectedTable,
  onTableSelect,
}: ThreeDVenueViewerProps) {
  return (
    <>
      {/* Lighting — nightlife feel */}
      <ambientLight intensity={0.2} color="#6366f1" />
      <directionalLight
        position={[8, 12, 8]}
        intensity={0.5}
        color="#e0e7ff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-5, 6, -5]} intensity={0.3} color="#8b5cf6" />
      <pointLight position={[5, 6, 5]} intensity={0.2} color="#06b6d4" />

      {/* Dark polished floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial
          color="#0f0f1a"
          metalness={0.4}
          roughness={0.3}
        />
      </mesh>

      {/* Subtle grid */}
      <gridHelper args={[20, 20, "#1e1e3a", "#16162a"]} position={[0, 0.003, 0]} />

      {/* Venue boundary */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[9.8, 10, 64]} />
        <meshBasicMaterial color="#2a2a4a" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Tables */}
      {tables.map((table) => (
        <TableMesh3D
          key={table.id}
          table={table}
          selected={selectedTable === table.id}
          onClick={() => onTableSelect(table.id)}
        />
      ))}

      {/* Contact shadows for depth */}
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.4}
        scale={22}
        blur={2}
        far={4}
        color="#000"
      />

      {/* Camera controls */}
      <OrbitControls
        maxPolarAngle={Math.PI / 2.2}
        minDistance={3}
        maxDistance={18}
        enablePan
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

export default function ThreeDVenueViewer({
  tables,
  selectedTable,
  onTableSelect,
}: ThreeDVenueViewerProps) {
  const { t } = useTranslation('pos');
  return (
    <div className="w-full aspect-video min-h-[300px] lg:min-h-[450px] rounded-xl overflow-hidden border border-border bg-[#0a0a14]">
      <Canvas
        shadows
        camera={{ position: [0, 10, 12], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor("#0a0a14");
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        <FloorScene
          tables={tables}
          selectedTable={selectedTable}
          onTableSelect={onTableSelect}
        />
      </Canvas>
    </div>
  );
}

import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import VRMAvatar, { VRMAvatarExpression } from './VRMAvatar';
import GLBAvatar from './GLBAvatar';
import { useTranslation } from 'react-i18next';

interface VRMSceneProps {
  speaking: boolean;
  mouthOpen: number;
  expression: VRMAvatarExpression;
  className?: string;
}

// Fallback avatar when model is loading or unavailable
function FallbackAvatar() {
  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial color="#9b87f5" />
    </mesh>
  );
}

export default function VRMScene({ speaking, mouthOpen, expression, className }: VRMSceneProps) {
  const { t } = useTranslation('common');
  const [modelError, setModelError] = useState(false);

  // Use GLB for now (VRMAvatar requires a .vrm that contains VRM metadata)
  const modelUrl = '/avatar.glb';

  const isVrm = useMemo(() => modelUrl.toLowerCase().endsWith('.vrm'), [modelUrl]);

  return (
    <div className={className} style={{ width: '100%', height: '100%', background: 'transparent' }}>
      <Canvas
        camera={{ position: [0, 0.5, 3.5], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, 2, 2]} intensity={2} />
        <directionalLight position={[-2, 1, -1]} intensity={0.5} />

        <Suspense fallback={<FallbackAvatar />}>
          {!modelError ? (
            isVrm ? (
              <VRMAvatar
                vrmUrl={modelUrl}
                speaking={speaking}
                mouthOpen={mouthOpen}
                expression={expression}
                onLoad={() => {
                  // noop
                }}
                onError={(err) => {
                  console.error('Avatar (VRM) failed to load:', err);
                  setModelError(true);
                }}
              />
            ) : (
              <GLBAvatar
                url={modelUrl}
                speaking={speaking}
                mouthOpen={mouthOpen}
                onLoad={() => {
                  // noop
                }}
                onError={(err) => {
                  console.error('Avatar (GLB) failed to load:', err);
                  setModelError(true);
                }}
              />
            )
          ) : (
            <FallbackAvatar />
          )}
        </Suspense>

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 2}
          target={[0, 0, 0]}
        />

        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}


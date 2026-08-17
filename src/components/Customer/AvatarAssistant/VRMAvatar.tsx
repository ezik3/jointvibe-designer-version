import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';

export type VRMAvatarExpression = 'idle' | 'thinking' | 'speaking' | 'happy' | 'sad' | 'neutral';

interface VRMAvatarProps {
  vrmUrl: string;
  speaking: boolean;
  mouthOpen: number;
  expression: VRMAvatarExpression;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export default function VRMAvatar({ 
  vrmUrl, 
  speaking, 
  mouthOpen, 
  expression, 
  onLoad, 
  onError 
}: VRMAvatarProps) {
  const { t } = useTranslation('common');
  const { scene } = useThree();
  const [vrm, setVrm] = useState<VRM | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const clockRef = useRef(new THREE.Clock());

  // Load VRM model
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      vrmUrl,
      async (gltf) => {
        const vrmModel = gltf.userData.vrm as VRM;
        
        if (!vrmModel) {
          onError?.(new Error('Failed to load VRM model'));
          return;
        }

        // Optimize the model
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        // Rotate to face camera
        vrmModel.scene.rotation.y = Math.PI;

        // Add to group
        if (groupRef.current) {
          groupRef.current.add(vrmModel.scene);
        }

        setVrm(vrmModel);
        onLoad?.();
      },
      undefined,
      (error) => {
        console.error('VRM loading error:', error);
        onError?.(error instanceof Error ? error : new Error('Failed to load VRM'));
      }
    );

    return () => {
      if (vrm) {
        vrm.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material?.dispose();
            }
          }
        });
      }
    };
  }, [vrmUrl]);

  // Map expression to VRM blendshapes
  const getExpressionWeights = (expr: VRMAvatarExpression) => {
    switch (expr) {
      case 'happy':
        return { happy: 0.8, sad: 0, angry: 0, surprised: 0 };
      case 'sad':
        return { happy: 0, sad: 0.6, angry: 0, surprised: 0 };
      case 'thinking':
        return { happy: 0, sad: 0.2, angry: 0, surprised: 0.3 };
      case 'speaking':
        return { happy: 0.3, sad: 0, angry: 0, surprised: 0 };
      default:
        return { happy: 0, sad: 0, angry: 0, surprised: 0 };
    }
  };

  // Animation loop
  useFrame((state, delta) => {
    if (!vrm) return;

    vrm.update(delta);
    const t = clockRef.current.getElapsedTime();

    // Idle breathing/swaying animation
    if (!speaking) {
      vrm.scene.position.y = Math.sin(t * 1.2) * 0.02 - 1.2;
      vrm.scene.rotation.y = Math.PI + Math.sin(t * 0.6) * 0.05;
    } else {
      vrm.scene.position.y = -1.2;
      vrm.scene.rotation.y = Math.PI;
    }

    // Apply expressions
    const expressionManager = vrm.expressionManager;
    if (expressionManager) {
      // Lip sync - mouth open
      const mouthValue = THREE.MathUtils.clamp(mouthOpen, 0, 1);
      
      // Try different viseme names (VRM models vary)
      try {
        expressionManager.setValue('aa', mouthValue);
      } catch {
        try {
          expressionManager.setValue('a', mouthValue);
        } catch {
          // Fallback - no aa viseme available
        }
      }

      // Apply emotion expressions
      const weights = getExpressionWeights(expression);
      
      try {
        expressionManager.setValue('happy', weights.happy);
        expressionManager.setValue('sad', weights.sad);
        expressionManager.setValue('angry', weights.angry);
        expressionManager.setValue('surprised', weights.surprised);
      } catch {
        // Some expressions may not exist in all models
      }

      // Blinking animation
      const blinkInterval = 4;
      const blinkDuration = 0.15;
      const blinkPhase = t % blinkInterval;
      const blinkValue = blinkPhase < blinkDuration ? 1 : 0;
      
      try {
        expressionManager.setValue('blink', blinkValue);
      } catch {
        try {
          expressionManager.setValue('blinkLeft', blinkValue);
          expressionManager.setValue('blinkRight', blinkValue);
        } catch {
          // No blink available
        }
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]} />
  );
}

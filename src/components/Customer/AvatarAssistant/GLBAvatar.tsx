import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type { ExpressionConfig } from '@/avatar/expressions';
import { useTranslation } from 'react-i18next';

interface GLBAvatarProps {
  url: string;
  speaking: boolean;
  /** Mouth openness from lip sync (0-1) */
  mouthOpen?: number;
  /** Expression configuration for emotions */
  expression?: ExpressionConfig;
  /** Personality energy level (affects animation intensity) */
  energy?: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

interface MorphTargetRefs {
  mesh: THREE.SkinnedMesh | null;
  influences: number[] | null;
  dictionary: Record<string, number> | null;
}

interface BoneRefs {
  jaw: THREE.Bone | null;
  head: THREE.Bone | null;
  neck: THREE.Bone | null;
  leftArm: THREE.Bone | null;
  rightArm: THREE.Bone | null;
  leftForearm: THREE.Bone | null;
  rightForearm: THREE.Bone | null;
}

export default function GLBAvatar({ 
  url, 
  speaking, 
  mouthOpen = 0,
  expression,
  energy = 0.7,
  onLoad, 
  onError 
}: GLBAvatarProps) {
  const { t } = useTranslation('common');
  const [scene, setScene] = useState<THREE.Object3D | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const clockRef = useRef(new THREE.Clock());
  const morphTargetsRef = useRef<MorphTargetRefs>({ mesh: null, influences: null, dictionary: null });
  const bonesRef = useRef<BoneRefs>({ 
    jaw: null, head: null, neck: null, 
    leftArm: null, rightArm: null, 
    leftForearm: null, rightForearm: null 
  });
  const lastBlinkRef = useRef(0);
  const isBlinkingRef = useRef(false);
  const armsPositionedRef = useRef(false);

  useEffect(() => {
    const loader = new GLTFLoader();

    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;

        // Fit-to-view: center + scale
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 1.6 / maxDim;

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        // Put feet on the "ground" and center for full body view
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;
        model.position.y -= 0.8;

        // Face the camera (no rotation needed - model already faces correct way)
        model.rotation.y = 0;

        // Collect all bone names for debugging
        const allBones: { name: string; bone: THREE.Bone }[] = [];
        
        // Find morph targets and bones
        model.traverse((obj) => {
          // Find skinned mesh with morph targets
          if (obj instanceof THREE.SkinnedMesh && obj.morphTargetDictionary) {
            morphTargetsRef.current = {
              mesh: obj,
              influences: obj.morphTargetInfluences || null,
              dictionary: obj.morphTargetDictionary,
            };
            console.log('GLBAvatar: Found morph targets:', Object.keys(obj.morphTargetDictionary));
          }
          
          // Collect ALL bones for debugging
          if (obj instanceof THREE.Bone) {
            allBones.push({ name: obj.name, bone: obj });
            const boneName = obj.name.toLowerCase();
            
            // Jaw
            if (boneName.includes('jaw')) {
              bonesRef.current.jaw = obj;
            }
            // Head
            if ((boneName.includes('head') && !boneName.includes('headtop')) || boneName === 'head') {
              bonesRef.current.head = obj;
            }
            // Neck
            if (boneName.includes('neck')) {
              bonesRef.current.neck = obj;
            }
            
            // Upper arm bones - VERY flexible matching
            const isLeftArm = boneName.includes('left') || boneName.includes('_l') || boneName.endsWith('.l');
            const isRightArm = boneName.includes('right') || boneName.includes('_r') || boneName.endsWith('.r');
            const isUpperArm = boneName.includes('upperarm') || boneName.includes('upper_arm') || 
                              (boneName.includes('arm') && !boneName.includes('fore') && !boneName.includes('lower'));
            const isForearm = boneName.includes('forearm') || boneName.includes('fore_arm') || 
                             boneName.includes('lowerarm') || boneName.includes('lower_arm');
            const isShoulder = boneName.includes('shoulder') || boneName.includes('clavicle');
            
            if (isUpperArm && !isForearm && !isShoulder) {
              if (isLeftArm) bonesRef.current.leftArm = obj;
              else if (isRightArm) bonesRef.current.rightArm = obj;
            }
            if (isForearm) {
              if (isLeftArm) bonesRef.current.leftForearm = obj;
              else if (isRightArm) bonesRef.current.rightForearm = obj;
            }
          }
        });

        // Log ALL bone names for debugging
        console.log('GLBAvatar: ALL BONE NAMES:', allBones.map(b => b.name));
        console.log('GLBAvatar: Found bones:', {
          jaw: bonesRef.current.jaw?.name || 'NOT FOUND',
          head: bonesRef.current.head?.name || 'NOT FOUND',
          leftArm: bonesRef.current.leftArm?.name || 'NOT FOUND',
          rightArm: bonesRef.current.rightArm?.name || 'NOT FOUND',
          leftForearm: bonesRef.current.leftForearm?.name || 'NOT FOUND',
          rightForearm: bonesRef.current.rightForearm?.name || 'NOT FOUND',
        });
        
        // === POSITION ARMS DOWN IMMEDIATELY ===
        // This must happen BEFORE adding to scene
        const { leftArm, rightArm, leftForearm, rightForearm } = bonesRef.current;
        if (leftArm) {
          console.log('GLBAvatar: Positioning left arm, original rotation:', leftArm.rotation.toArray());
          leftArm.rotation.set(0.2, 0, 1.2); // Rotate arm down toward body
        }
        if (rightArm) {
          console.log('GLBAvatar: Positioning right arm, original rotation:', rightArm.rotation.toArray());
          rightArm.rotation.set(0.2, 0, -1.2); // Mirror for right side
        }
        if (leftForearm) {
          leftForearm.rotation.set(0, 0.3, 0); // Slight bend
        }
        if (rightForearm) {
          rightForearm.rotation.set(0, -0.3, 0); // Mirror bend
        }
        armsPositionedRef.current = true;

        if (groupRef.current) groupRef.current.add(model);
        setScene(model);
        onLoad?.();
      },
      undefined,
      (e) => {
        const err = e instanceof Error ? e : new Error('Failed to load GLB');
        console.error('GLB loading error:', err);
        onError?.(err);
      }
    );

    return () => {
      if (!scene) return;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useFrame(() => {
    if (!groupRef.current) return;
    const t = clockRef.current.getElapsedTime();
    const { dictionary, influences } = morphTargetsRef.current;
    const { jaw, head, leftArm, rightArm, leftForearm, rightForearm } = bonesRef.current;

    // Arms already positioned in useEffect - no need to do it here

    // === LIP SYNC ===
    // Apply mouth openness from audio analysis
    if (speaking && mouthOpen > 0) {
      // Try morph targets first
      if (dictionary && influences) {
        // Common morph target names for mouth
        const mouthMorphs = ['mouthOpen', 'jawOpen', 'viseme_aa', 'viseme_O', 'mouth_open'];
        for (const morphName of mouthMorphs) {
          if (dictionary[morphName] !== undefined) {
            influences[dictionary[morphName]] = mouthOpen;
          }
        }
      }
      
      // Fallback: Animate jaw bone
      if (jaw) {
        jaw.rotation.x = mouthOpen * 0.25; // Subtle jaw movement
      }
    } else if (!speaking) {
      // Reset mouth when not speaking
      if (dictionary && influences) {
        const mouthMorphs = ['mouthOpen', 'jawOpen', 'viseme_aa', 'viseme_O', 'mouth_open'];
        for (const morphName of mouthMorphs) {
          if (dictionary[morphName] !== undefined) {
            influences[dictionary[morphName]] *= 0.9; // Smooth close
          }
        }
      }
      if (jaw) {
        jaw.rotation.x *= 0.9;
      }
    }

    // === BLINKING ===
    // Natural random blinking
    const now = Date.now();
    if (!isBlinkingRef.current && now - lastBlinkRef.current > 2500 + Math.random() * 2500) {
      isBlinkingRef.current = true;
      lastBlinkRef.current = now;
      
      // Close eyes
      if (dictionary && influences) {
        const blinkMorphs = ['eyeBlink', 'eyeBlink_L', 'eyeBlink_R', 'blink', 'eyes_closed'];
        for (const morphName of blinkMorphs) {
          if (dictionary[morphName] !== undefined) {
            influences[dictionary[morphName]] = 1;
          }
        }
      }
      
      // Open eyes after 100ms
      setTimeout(() => {
        if (dictionary && influences) {
          const blinkMorphs = ['eyeBlink', 'eyeBlink_L', 'eyeBlink_R', 'blink', 'eyes_closed'];
          for (const morphName of blinkMorphs) {
            if (dictionary[morphName] !== undefined) {
              influences[dictionary[morphName]] = 0;
            }
          }
        }
        isBlinkingRef.current = false;
      }, 100);
    }

    // === EXPRESSIONS ===
    // Apply emotion-based expressions
    if (expression && dictionary && influences) {
      // Smile
      if (expression.mouthSmile !== undefined) {
        const smileMorphs = ['mouthSmile', 'smile', 'mouthSmile_L', 'mouthSmile_R'];
        for (const morphName of smileMorphs) {
          if (dictionary[morphName] !== undefined) {
            const current = influences[dictionary[morphName]];
            influences[dictionary[morphName]] = current + (expression.mouthSmile - current) * 0.1;
          }
        }
      }
      
      // Eyebrow raise
      if (expression.browRaise !== undefined) {
        const browMorphs = ['browRaise', 'browInnerUp', 'browOuterUp_L', 'browOuterUp_R'];
        for (const morphName of browMorphs) {
          if (dictionary[morphName] !== undefined) {
            const current = influences[dictionary[morphName]];
            influences[dictionary[morphName]] = current + (expression.browRaise - current) * 0.1;
          }
        }
      }
      
      // Eyebrow down (concern/serious)
      if (expression.browDown !== undefined) {
        const browMorphs = ['browDown', 'browDown_L', 'browDown_R'];
        for (const morphName of browMorphs) {
          if (dictionary[morphName] !== undefined) {
            const current = influences[dictionary[morphName]];
            influences[dictionary[morphName]] = current + (expression.browDown - current) * 0.1;
          }
        }
      }
    }

    // === BODY ANIMATION ===
    const energyMult = 0.5 + energy * 0.5;
    
    if (speaking) {
      // Dynamic speaking animation - expressive movement
      const breathe = Math.sin(t * 2.5) * 0.02 * energyMult;
      const sway = Math.sin(t * 1.8) * 0.06 * energyMult;
      const lean = Math.sin(t * 3.2) * 0.025 * energyMult;
      const nod = Math.sin(t * 4) * 0.015 * energyMult;
      
      // Add emphasis movements based on amplitude
      const emphasisNod = mouthOpen * 0.02;
      
      groupRef.current.position.y = breathe;
      groupRef.current.rotation.y = sway;
      groupRef.current.rotation.x = nod + emphasisNod;
      groupRef.current.rotation.z = lean;
      
      // Head bone micro-movements for more realism
      if (head) {
        head.rotation.y = Math.sin(t * 2) * 0.05 * energyMult;
        head.rotation.x = Math.sin(t * 3) * 0.03 * energyMult;
      }
    } else {
      // Idle animation - subtle living presence
      const idleBreath = Math.sin(t * 0.8) * 0.01 * energyMult;
      const idleSway = Math.sin(t * 0.5) * 0.025 * energyMult;
      const idleShift = Math.sin(t * 0.3) * 0.01 * energyMult;
      const microMove = Math.sin(t * 1.5) * 0.005 * energyMult;
      
      groupRef.current.position.y = idleBreath;
      groupRef.current.position.x = idleShift;
      groupRef.current.rotation.y = idleSway;
      groupRef.current.rotation.x = microMove;
      groupRef.current.rotation.z = Math.sin(t * 0.4) * 0.008 * energyMult;
      
      // Subtle head movements while idle
      if (head) {
        head.rotation.y = Math.sin(t * 0.3) * 0.02;
        head.rotation.x = Math.sin(t * 0.4) * 0.01;
      }
    }
  });

  return <group ref={groupRef} position={[0, 0, 0]} />;
}

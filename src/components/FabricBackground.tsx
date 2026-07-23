'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import * as THREE from 'three';
import { fabricFragmentShader, fabricVertexShader } from '@/shaders/fabric';
import {
  createFabricState,
  estimateTension,
  qualityToGrid,
  stepFabric,
  type FabricParams,
  type FabricQuality,
  type PointerState,
} from '@/utils/physics';

type FabricBackgroundProps = {
  pointer: MutableRefObject<PointerState>;
  textureSrc?: string;
  textureAspect?: number;
  params?: Partial<FabricParams & { lightingIntensity: number }>;
};

type FabricMeshProps = {
  pointer: MutableRefObject<PointerState>;
  textureSrc: string;
  textureAspect: number;
  params: FabricParams & { lightingIntensity: number };
};

const CAMERA_DISTANCE = 6;

const DEFAULT_PARAMS: FabricParams & { lightingIntensity: number } = {
  stiffness: 58,
  damping: 0.86,
  sphereRadius: 0.25,
  deformationStrength: 172,
  recoverySpeed: 15,
  lightingIntensity: 2.45,
};

type WebGLBoundaryProps = {
  children: ReactNode;
  onError: () => void;
};

class WebGLBoundary extends Component<WebGLBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function canCreateWebGLContext() {
  if (typeof document === 'undefined') return false;

  const canvas = document.createElement('canvas');
  const context =
    canvas.getContext('webgl2') ||
    canvas.getContext('webgl') ||
    canvas.getContext('experimental-webgl');

  return Boolean(context);
}

function getQuality(width: number): FabricQuality {
  if (width >= 1200) return 'high';
  if (width >= 740) return 'medium';
  return 'low';
}

function FabricMesh({ pointer, textureSrc, textureAspect, params }: FabricMeshProps) {
  const meshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);
  const { viewport, size } = useThree();
  const quality = getQuality(size.width);
  const stateRef = useRef(createFabricState(quality));
  const texture = useMemo(() => {
    const loaded = new THREE.TextureLoader().load(textureSrc);
    loaded.wrapS = THREE.RepeatWrapping;
    loaded.wrapT = THREE.ClampToEdgeWrapping;
    return loaded;
  }, [textureSrc]);
  const textureRepeat = useMemo(
    () => new THREE.Vector2(size.width / size.height / textureAspect, 1),
    [size.height, size.width, textureAspect],
  );

  useEffect(() => {
    stateRef.current = createFabricState(quality);
  }, [quality]);

  const geometry = useMemo(() => {
    const { cols, rows } = qualityToGrid(quality);
    const plane = new THREE.PlaneGeometry(viewport.width, viewport.height, cols - 1, rows - 1);
    plane.setAttribute('tension', new THREE.BufferAttribute(new Float32Array(cols * rows), 1));
    plane.userData.basePositions = Float32Array.from(
      (plane.attributes.position as THREE.BufferAttribute).array as ArrayLike<number>,
    );
    return plane;
  }, [quality, viewport.height, viewport.width]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: false,
        depthWrite: false,
        uniforms: {
          uMap: { value: texture },
          uTextureRepeat: { value: textureRepeat },
          uLightIntensity: { value: params.lightingIntensity },
          uOpacity: { value: 1 },
        },
        vertexShader: fabricVertexShader,
        fragmentShader: fabricFragmentShader,
      }),
    [params.lightingIntensity, texture, textureRepeat],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const state = stateRef.current;
    stepFabric(state, pointer.current, params, delta);

    const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const tension = mesh.geometry.attributes.tension as THREE.BufferAttribute;
    const basePositions = mesh.geometry.userData.basePositions as Float32Array;

    for (let i = 0; i < state.heights.length; i++) {
      const height = Math.max(state.heights[i] * 0.95, 0);
      const perspectiveScale = Math.max(
        0.05,
        (CAMERA_DISTANCE - height) / CAMERA_DISTANCE,
      );

      position.setXYZ(
        i,
        basePositions[i * 3] * perspectiveScale,
        basePositions[i * 3 + 1] * perspectiveScale,
        height,
      );
      tension.setX(i, estimateTension(state, i));
    }

    position.needsUpdate = true;
    tension.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  }, [geometry, material, texture]);

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}

export function FabricBackground({
  pointer,
  textureSrc = '/images/cta-mashrabiya.png',
  textureAspect = 1774 / 887,
  params = {},
}: FabricBackgroundProps) {
  const mergedParams = { ...DEFAULT_PARAMS, ...params };
  const [webglAvailable, setWebglAvailable] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setWebglAvailable(canCreateWebGLContext());
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!webglAvailable) return null;

  return (
    <div className="fabric-background" aria-hidden="true">
      <WebGLBoundary onError={() => setWebglAvailable(false)}>
        <Canvas
          camera={{ position: [0, 0, CAMERA_DISTANCE], fov: 32 }}
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        >
          <FabricMesh
            pointer={pointer}
            textureSrc={textureSrc}
            textureAspect={textureAspect}
            params={mergedParams}
          />
        </Canvas>
      </WebGLBoundary>
    </div>
  );
}

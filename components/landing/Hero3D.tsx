'use client';

// -----------------------------------------------------------------------------
// Hero3D (Phase 9.5-C)
//
// Landing Page (/) の Hero セクション背景に配置する Three.js 3D シーン。
// Minecraft ブロック風の cube を複数、ランダムな位置・回転で配置し、
// 全体でゆっくり浮遊 + 自転する演出。
//
// 【重要】必ず dynamic import + ssr: false で読み込む (計画書 §8.2):
//   const Hero3D = dynamic(() => import('@/components/landing/Hero3D'), {
//     ssr: false,
//     loading: () => <HeroFallback />
//   });
//
// - @react-three/fiber の Canvas は WebGL 前提。SSR で読み込むと
//   'window is not defined' で落ちる。
// - Reduced Motion 環境では自動回転を停止 (WCAG 2.1 SC 2.3.3)。
// - モバイル対応: dpr={[1, 1.5]} でパフォーマンス確保。
// - 装飾なので Canvas 全体を aria-hidden で SR に無視させる。
// -----------------------------------------------------------------------------

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import type { Mesh, Group } from 'three';

/** Reduced Motion 判定 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface CubeSpec {
  key: string;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  scale: number;
  rotSpeed: number;
  floatSpeed: number;
  floatAmp: number;
}

/** ランダムな Minecraft 風 cube を N 個生成 (deterministic seed で SSR/CSR 一致) */
function generateCubes(count: number): CubeSpec[] {
  // 疑似乱数 (mulberry32) で seed 固定 → SSR / CSR 一致 (今回 dynamic import
  // なので実質 CSR のみだが、React strict mode の double-render で一致させるため)
  let seed = 42;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Minecraft 風パステルカラー (草・石・水・砂・木・ダイヤモンド・エメラルド 風)
  const palette = [
    '#7ec850', // 芝生の緑
    '#a0a0a0', // 石の灰
    '#5b91d6', // 水の青
    '#e6d194', // 砂
    '#8b6a3f', // 木
    '#6de3d0', // ダイヤモンドシアン
    '#10b981', // DropMod emerald
    '#f0a04b'  // 明るいオレンジ (アクセント)
  ];

  const cubes: CubeSpec[] = [];
  for (let i = 0; i < count; i++) {
    cubes.push({
      key: `cube-${i}`,
      // -6..6 の空間にランダム配置。ただし中央 (title 位置) は避けやすいよう
      // z を -3..-1 に寄せる (背景に押し込む)
      position: [
        (rand() - 0.5) * 12,
        (rand() - 0.5) * 6,
        -1 - rand() * 2
      ],
      rotation: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
      color: palette[Math.floor(rand() * palette.length)] ?? '#10b981',
      scale: 0.5 + rand() * 0.8,
      rotSpeed: 0.1 + rand() * 0.3,
      floatSpeed: 0.5 + rand() * 0.5,
      floatAmp: 0.2 + rand() * 0.4
    });
  }
  return cubes;
}

interface CubeProps {
  spec: CubeSpec;
  animate: boolean;
}

function FloatingCube({ spec, animate }: CubeProps) {
  const meshRef = useRef<Mesh>(null);
  const initialY = spec.position[1];

  useFrame(({ clock }) => {
    if (!animate || !meshRef.current) return;
    const t = clock.getElapsedTime();
    // 自転
    meshRef.current.rotation.x = spec.rotation[0] + t * spec.rotSpeed;
    meshRef.current.rotation.y = spec.rotation[1] + t * spec.rotSpeed * 0.7;
    // 浮遊 (sin 波)
    meshRef.current.position.y = initialY + Math.sin(t * spec.floatSpeed) * spec.floatAmp;
  });

  return (
    <mesh
      ref={meshRef}
      position={spec.position}
      rotation={spec.rotation}
      scale={spec.scale}
    >
      <boxGeometry args={[1, 1, 1]} />
      {/* MeshStandardMaterial: 環境光と反射を受ける (Environment preset の恩恵) */}
      <meshStandardMaterial
        color={spec.color}
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>
  );
}

/** Scene 全体をゆっくり回転させる */
function SceneRoot({
  children,
  animate
}: {
  children: React.ReactNode;
  animate: boolean;
}) {
  const groupRef = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!animate || !groupRef.current) return;
    groupRef.current.rotation.y = clock.getElapsedTime() * 0.05;
  });
  return <group ref={groupRef}>{children}</group>;
}

export default function Hero3D() {
  // Reduced Motion は初期 render 時に判定 (途中変更を想定しない)
  const animate = useMemo(() => !prefersReducedMotion(), []);
  const cubes = useMemo(() => generateCubes(14), []);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {/* 環境ライティング (自然な影と反射) */}
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-5, -3, 5]} intensity={0.3} color="#5b91d6" />
        {/* HDR-like preset (Modrinth 風の柔らかい光) */}
        <Environment preset="city" />

        <SceneRoot animate={animate}>
          {cubes.map((spec) => (
            <FloatingCube key={spec.key} spec={spec} animate={animate} />
          ))}
        </SceneRoot>
      </Canvas>
    </div>
  );
}

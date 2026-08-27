/**
 * zipImport Zustand store (Sub-Phase 9-B.2)
 *
 * 従来 useZipImport hook (useState) の内部 state (pendingImportData) を
 * Zustand slice に分離。shim パターンで既存 hook API は維持。
 *
 * 設計方針:
 *   - pendingImportData: .mrpack 検出後、NewProfileModal に渡すための一時データ
 *     → 複数コンポーネント (AppShell の NewProfileModal + Settings の import UI 等)
 *       から参照される可能性があるため store に置く
 *   - inFlightRef: hook 内 Ref に維持 (シリアライズ不能、hook ライフサイクル依存)
 */

'use client';

import { create } from 'zustand';
import type { ProjectItem, UnknownFile } from '@/types';
import type { AnalysisIssue } from '@/lib/env/analysis';
import type { DetectedEnvironment } from '@/lib/env/detector/types';

// ============================================================================
// 型
// ============================================================================

export interface PendingImportData {
  name: string;
  mods: ProjectItem[];
  mcVersion?: string;
  loader?: string;
  loaderVersion?: string;
  description?: string;
  /** ZIP 取り込みか、検索画面からの複製か */
  source?: 'import' | 'duplicate';
  // ---- Phase 11: .minecraft フォルダ/ZIP 解析取り込み ----
  resourcepacks?: ProjectItem[];
  shaderpacks?: ProjectItem[];
  unknownFiles?: UnknownFile[];
  /** 解析結果の検査 (NewProfileModal の Analysis View 表示用) */
  analysisIssues?: AnalysisIssue[];
  /** 検出されたルート構造 (表示用) */
  rootType?: DetectedEnvironment['rootType'];
}

export interface ZipImportStoreState {
  pendingImportData: PendingImportData | null;
  setPendingImportData: (data: PendingImportData | null) => void;
  clearPendingImportData: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useZipImportStore = create<ZipImportStoreState>((set) => ({
  pendingImportData: null,

  setPendingImportData: (data) => set({ pendingImportData: data }),

  clearPendingImportData: () => set({ pendingImportData: null })
}));

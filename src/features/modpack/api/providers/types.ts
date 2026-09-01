/**
 * ContentProvider 抽象 (Phase 12-C / PHASE12_PLAN.md §3)。
 *
 * Mod の**入手元**を差し替えられるようにする層。Phase 12 は `ModrinthProvider` のみ、
 * **CurseForge は Phase 13** (`P13-A: API proxy + Murmur2`)。
 *
 * ## なぜ薄い抽象なのか
 *
 * 既存コード (`lib/modrinth/client.ts` を直接呼ぶ箇所) を一斉に書き換えると
 * Phase 12 の範囲を超える。ここでは **P12-C で新規に必要になる操作だけ**を
 * インターフェース化し、`ModrinthProvider` は既存クライアントへ委譲する。
 * 既存の呼び出し側の移行は Phase 13 で CurseForge を入れるときにまとめて行う。
 */

import type { ContentCategory } from '@/types';

export type ProviderId = 'modrinth' | 'curseforge';

/** プロバイダ横断のバージョン表現 */
export interface ProviderVersion {
  id: string;
  projectId: string;
  /** 表示用のバージョン番号 (例: `0.6.0`) */
  versionNumber: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
  /** ISO 8601。更新検知の新旧比較に使う */
  datePublished: string;
  versionType: 'release' | 'beta' | 'alpha';
  files: { url: string; filename: string; primary: boolean; size: number }[];
}

/** プロバイダ横断のプロジェクト表現 */
export interface ProviderProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  projectType: ContentCategory;
  downloads: number;
  iconUrl?: string;
}

/** 検索・絞り込みの文脈 (Profile の環境) */
export interface ProviderContext {
  loader?: string;
  mcVersion?: string;
}

export interface ProviderSearchInput extends ProviderContext {
  query?: string;
  categories?: string[];
  /** 対象カテゴリ (mod / resourcepack / shader) */
  projectType?: ContentCategory;
  limit?: number;
  offset?: number;
}

export interface ProviderSearchResult {
  hits: ProviderProject[];
  totalHits: number;
}

/** 更新検知の結果 (§10.6「現状より新しい version が存在するか」) */
export interface ProviderUpdateInfo {
  hasUpdate: boolean;
  /** 現在 Profile が指している version。見つからなければ null */
  current: ProviderVersion | null;
  /** 環境 (loader / mcVersion) で絞り込んだ最新の release */
  latest: ProviderVersion | null;
}

export interface ContentProvider {
  readonly id: ProviderId;
  readonly label: string;

  getProject(idOrSlug: string): Promise<ProviderProject | null>;

  searchProjects(input: ProviderSearchInput): Promise<ProviderSearchResult>;

  /** 環境で絞り込んだ version 一覧 (新しい順) */
  listVersions(projectId: string, context?: ProviderContext): Promise<ProviderVersion[]>;

  /**
   * 更新検知。
   *
   * `currentVersionId` が不明でも「最新の release」は返す (`hasUpdate` は false)。
   * 比較は `datePublished` で行う — バージョン番号の文字列比較は
   * `0.10.0` < `0.9.0` のような誤判定をするため使わない。
   */
  checkForUpdate(
    projectId: string,
    currentVersionId: string | undefined,
    context?: ProviderContext
  ): Promise<ProviderUpdateInfo>;
}

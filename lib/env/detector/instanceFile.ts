/**
 * 単一インスタンス定義 JSON 方式ランチャー向け Detector 基底クラス
 * (2026-08-29 ユーザー要望: 他ランチャー追加の容易化)。
 *
 * Prism (mmc-pack.json) / MojoLauncher (mojo_instance.json) のように
 * 「instance root 直下に JSON 定義ファイルが 1 つあれば判定できる」形式は、
 * この基底クラスを継承して `parse` を渡すだけですむ。canDetect / detect /
 * パース失敗時の env なしフォールバック / contentDirs 探索は共通処理する。
 *
 * 新規ランチャー追加手順 (詳細は registry.ts のコメント参照):
 *   1. 本クラスを継承 (or EnvironmentDetector を直接実装)
 *   2. lib/env/detector/registry.ts の DETECTOR_REGISTRY に 1 エントリ追記
 *   3. (必要なら) types.ts の RootType 補完リストへ追記
 *   ※ chain 順序・UI ラベルは registry から自動導出されるため
 *     index.ts / NewProfileModal.tsx の変更は不要。
 */

import type { ProfileLoader } from '@/types';
import type { EnvironmentSource } from '../source';
import {
  type DetectedEnvironment,
  type EnvironmentDetector,
  type RootType,
  detectContentDirs
} from './types';

/** インスタンス定義から抽出する環境情報 (全ランチャー共通の契約) */
export interface ParsedLauncherEnv {
  mcVersion?: string;
  loader?: ProfileLoader;
  loaderVersion?: string;
}

export interface InstanceFileDetectorOptions<TJson> {
  /** Detector 名 (ログ・テスト用) */
  readonly name: string;
  /** 検出結果の rootType (registry.ts の登録キーと一致させる) */
  readonly rootType: RootType;
  /** root 直下に存在すればこのランチャーと判定する定義ファイル名 */
  readonly instanceFile: string;
  /**
   * 定義 JSON → 環境情報のパーサ。
   * 未知形式・解析不能は `{}` を返すこと (UI の手動設定へフォールバック)。
   */
  readonly parse: (json: TJson) => ParsedLauncherEnv;
  /** contentDirs を探す探索ルート (省略時 ['', '.minecraft']) */
  readonly contentRoots?: readonly string[];
}

export class InstanceFileDetector<TJson = unknown> implements EnvironmentDetector {
  readonly name: string;

  constructor(private readonly options: InstanceFileDetectorOptions<TJson>) {
    this.name = options.name;
  }

  async canDetect(source: EnvironmentSource): Promise<boolean> {
    return source.exists(this.options.instanceFile);
  }

  async detect(source: EnvironmentSource): Promise<DetectedEnvironment> {
    let parsed: ParsedLauncherEnv = {};
    try {
      const raw = await source.readFile(this.options.instanceFile);
      parsed = this.options.parse(JSON.parse(new TextDecoder().decode(raw)) as TJson);
    } catch {
      // 定義ファイルの読み取り・パース失敗は「検出失敗」扱い (env なし)
    }

    return {
      rootType: this.options.rootType,
      mcVersion: parsed.mcVersion,
      loader: parsed.loader,
      loaderVersion: parsed.loaderVersion,
      contentDirs: await detectContentDirs(
        source,
        this.options.contentRoots ?? ['', '.minecraft']
      )
    };
  }
}

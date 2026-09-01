/**
 * Sync 実行前の環境一致チェック (Phase 12-B)。
 *
 * ## D-1 (2026-08-27 確定): 不一致は **ブロック**
 *
 * `Profile.environment` とローカル検出環境が不一致の場合、**Sync 実行を禁止**する。
 * Preview にも到達させず、「Profile の環境を実際の環境に合わせるか、別の Profile を
 * 選択してください」と促す。
 *
 * **理由**: 互換性のない Mod をインスタンスへ書き込むと起動不能になる。
 * ユーザーデータの破壊リスクを最優先で防ぐ。
 *
 * **緩和はしない**: `loaderVersion` だけが異なる場合も一律ブロックする
 * (「警告付きで許可」は採用しなかった)。
 */

import type { ProfileLoader } from '@/types';

export type EnvironmentField = 'mcVersion' | 'loader' | 'loaderVersion';

/** 比較対象の 3 フィールド (固定順。UI 表示順もこれに揃える) */
export const ENVIRONMENT_FIELDS: readonly EnvironmentField[] = [
  'mcVersion',
  'loader',
  'loaderVersion'
];

/** UI 表示用のラベル */
export const ENVIRONMENT_FIELD_LABEL: Record<EnvironmentField, string> = {
  mcVersion: 'Minecraft バージョン',
  loader: 'ローダー',
  loaderVersion: 'ローダーバージョン'
};

export interface EnvironmentMismatch {
  field: EnvironmentField;
  label: string;
  profile: string;
  detected: string;
}

/** 検出できなかったフィールド (不一致ではなく「検証不能」として扱う) */
export interface EnvironmentUnverified {
  field: EnvironmentField;
  label: string;
  profile: string;
}

export interface EnvironmentCheckResult {
  /** Sync を実行してよいか。**false ならブロック** (D-1) */
  ok: boolean;
  mismatches: EnvironmentMismatch[];
  /**
   * ローカル側が検出できなかったフィールド。
   * **不一致ではない**のでブロック要因にしない (Generic フォルダ等で
   * 検出に失敗した場合に Sync が使えなくなるのを避ける)。
   */
  unverified: EnvironmentUnverified[];
  /** UI にそのまま出せる一行メッセージ (ok の場合は undefined) */
  message?: string;
}

/** 検出側の環境 (Detector の結果。未取得フィールドは undefined) */
export interface DetectedEnvironmentValues {
  mcVersion?: string;
  loader?: ProfileLoader;
  loaderVersion?: string;
}

/**
 * Profile の環境とローカル検出環境を比較する。
 *
 * **比較するのはローカル側が値を持つフィールドのみ。**
 * ローカル側が `undefined` のフィールドは「検証不能」として `unverified` に
 * 分類し、ブロック要因にしない。
 */
export function checkEnvironmentMatch(
  profileEnvironment: {
    mcVersion: string;
    loader: ProfileLoader;
    loaderVersion?: string;
  },
  detected: DetectedEnvironmentValues
): EnvironmentCheckResult {
  const mismatches: EnvironmentMismatch[] = [];
  const unverified: EnvironmentUnverified[] = [];

  for (const field of ENVIRONMENT_FIELDS) {
    const profileValue = profileEnvironment[field];
    const detectedValue = detected[field];
    const label = ENVIRONMENT_FIELD_LABEL[field];

    // Profile 側に値が無ければ比較対象外 (loaderVersion は optional)
    if (profileValue === undefined || profileValue === '') continue;

    if (detectedValue === undefined || detectedValue === '') {
      unverified.push({ field, label, profile: profileValue });
      continue;
    }

    if (profileValue !== detectedValue) {
      mismatches.push({ field, label, profile: profileValue, detected: detectedValue });
    }
  }

  if (mismatches.length === 0) {
    return { ok: true, mismatches, unverified };
  }

  const detail = mismatches
    .map((m) => `${m.label}: Profile「${m.profile}」/ 検出「${m.detected}」`)
    .join('、');
  return {
    ok: false,
    mismatches,
    unverified,
    message:
      `Profile の環境がローカルの Minecraft 環境と一致しないため Sync できません (${detail})。` +
      'Profile の環境を実際の環境に合わせるか、別の Profile を選択してください。'
  };
}

import type Dexie from 'dexie';
import type { Profile } from '@/types';
import { normalizeProfileForV2 } from '@/lib/state/sanitize';

/**
 * DropModDB の version / stores / upgrade を登録する。
 * クラス本体 (`dexie.ts`) から分離し、スキーマ進化を追いやすくする。
 */
export function registerDropModSchema(db: Dexie): void {
  // v1 スキーマ: primary key はカラム名の 1 番目、以降はインデックス
  db.version(1).stores({
    profiles: 'id, updatedAt',
    apiCache: 'key, expiresAt',
    meta: 'key'
  });

  // v2 (Phase 11-A): Profile 形状変更。index は不変 (スキーマ宣言は v1 と同一)、
  // upgrade で保存済み row を新形状に一括変換する:
  //   - flat な mcVersion / loader / loaderVersion → environment に集約
  //     (loader の不正値は 'Fabric' に正規化)
  //   - ModItem → ProjectItem: id→projectId / title→name /
  //     projectType?→type (未設定は 'mod') / selectedVersionId→versionId /
  //     selectedVersionNumber→versionNumber
  //   - resourcepacks / shaderpacks / unknownFiles は optional のため
  //     旧データはそのまま互換 (設定されないだけ)
  // 変換ロジックは lib/state/sanitize.ts の normalizeProfileForV2 と共用
  // (LocalStorage 旧データの流入経路と同一 semantics を保証)。
  db.version(2)
    .stores({
      profiles: 'id, updatedAt',
      apiCache: 'key, expiresAt',
      meta: 'key'
    })
    .upgrade(async (tx) => {
      const table = tx.table('profiles');
      const rows = (await table.toArray()) as Array<
        Record<string, unknown> & { updatedAt?: unknown }
      >;
      const converted = rows
        .map((row) => {
          const normalized = normalizeProfileForV2(row);
          if (!normalized) return null;
          return {
            ...normalized,
            updatedAt:
              typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt)
                ? row.updatedAt
                : Date.now()
          };
        })
        .filter((row): row is Profile & { updatedAt: number } => row !== null);
      if (converted.length > 0) {
        await table.clear();
        await table.bulkPut(converted);
      }
    });

  // v3 (Phase 12-A): Sync 基盤のテーブルを追加。
  //   - managedFiles: 管理下ファイルの台帳 (削除可否の fingerprint 判定に使用)
  //   - dirHandles:   FileSystemDirectoryHandle の永続化 (Profile.linkedSource から参照)
  //
  // **既存テーブルの index は不変・upgrade 関数なし**。新規テーブルの追加のみなので
  // 既存データは無変換のまま読み出せる (v2 の Profile 形状変換とは独立)。
  // 旧バージョンの DB を開いたユーザーは「空の台帳」から始まる = 紐付け直後の
  // 初回 Sync まで deletion は発生しない (§10.2 の「台帳に存在する」条件を満たさないため)。
  // これは安全側の挙動であり、意図したもの。
  //
  // ※ SyncTransaction テーブルは P12-B (Executor / Rollback) で v4 として追加する。
  //   P12-A のスコープ (§9) に含めないため、ここで先回りはしない。
  db.version(3).stores({
    profiles: 'id, updatedAt',
    apiCache: 'key, expiresAt',
    meta: 'key',
    managedFiles: 'id, profileId, category, projectId, sha1',
    dirHandles: 'id, profileId'
  });

  // v4 (Phase 12-B): Transaction Journal のテーブルを追加。
  //   - syncTransactions: Sync 操作のジャーナル + 状態 (Rollback / History UI が読む)
  //
  // v3 と同様に**新規テーブル追加のみ・upgrade 関数なし**。
  // `status` を index しているのは D-4 の「起動時に running の残存を検出する」
  // クエリを O(log n) で走らせるため。
  db.version(4).stores({
    profiles: 'id, updatedAt',
    apiCache: 'key, expiresAt',
    meta: 'key',
    managedFiles: 'id, profileId, category, projectId, sha1',
    dirHandles: 'id, profileId',
    syncTransactions: 'id, profileId, status, startedAt'
  });
}

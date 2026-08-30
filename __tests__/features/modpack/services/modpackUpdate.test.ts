/**
 * Modpack 更新検知 (Phase 12-C / §10.6) test — `lib/env/modpackUpdate.ts`
 *
 * Provider はスタブで差し替え、検知ロジックと Analysis 変換に絞る。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkModpackUpdates,
  updateIssueFromReport,
  type ModpackUpdateReport
} from '@/features/modpack/services/modpackUpdate';
import type { ContentProvider, ProviderUpdateInfo } from '@/features/modpack';
import type { Profile, ProjectItem } from '@/types';

function versionInfo(overrides: Partial<ProviderUpdateInfo> = {}): ProviderUpdateInfo {
  return {
    hasUpdate: false,
    current: null,
    latest: null,
    ...overrides
  };
}

/** checkForUpdate の戻り値を projectId ごとに指定できるスタブ */
function stubProvider(byId: Record<string, ProviderUpdateInfo | Error>): ContentProvider & {
  checkForUpdate: ReturnType<typeof vi.fn>;
} {
  return {
    id: 'modrinth',
    label: 'Modrinth',
    getProject: vi.fn(async () => null),
    searchProjects: vi.fn(async () => ({ hits: [], totalHits: 0 })),
    listVersions: vi.fn(async () => []),
    checkForUpdate: vi.fn(async (projectId: string) => {
      const result = byId[projectId];
      if (result instanceof Error) throw result;
      return result ?? versionInfo();
    })
  };
}

function item(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return { projectId: 'proj-1', name: 'Sodium', type: 'mod', ...overrides };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Pack',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    mods: [],
    ...overrides
  };
}

describe('checkModpackUpdates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('**Modpack 本体**の更新を検知する', async () => {
    const provider = stubProvider({
      'pack-1': versionInfo({
        hasUpdate: true,
        current: {
          id: 'v1',
          projectId: 'pack-1',
          versionNumber: '1.0.0',
          name: 'v1',
          gameVersions: [],
          loaders: [],
          datePublished: '',
          versionType: 'release',
          files: []
        },
        latest: {
          id: 'v2',
          projectId: 'pack-1',
          versionNumber: '2.0.0',
          name: 'v2',
          gameVersions: [],
          loaders: [],
          datePublished: '',
          versionType: 'release',
          files: []
        }
      })
    });

    const report = await checkModpackUpdates({
      profile: profile({
        modpackSource: {
          provider: 'modrinth',
          projectId: 'pack-1',
          name: 'Fabulously Optimized',
          versionId: 'v1',
          importedAt: 1
        }
      }),
      provider,
      includeMods: false
    });

    expect(report.entries).toEqual([
      {
        projectId: 'pack-1',
        name: 'Fabulously Optimized',
        category: 'modpack',
        currentVersionNumber: '1.0.0',
        latestVersionNumber: '2.0.0',
        hasUpdate: true
      }
    ]);
    expect(report.updatableCount).toBe(1);
    expect(report.checkedCount).toBe(1);
    expect(report.unresolvedCount).toBe(0);
  });

  it('収録 Mod ごとに検知し、カテゴリを付ける', async () => {
    const provider = stubProvider({
      'proj-1': versionInfo({ hasUpdate: true }),
      'proj-2': versionInfo({ hasUpdate: false }),
      'proj-3': versionInfo({ hasUpdate: true })
    });

    const report = await checkModpackUpdates({
      profile: profile({
        mods: [item(), item({ projectId: 'proj-2', name: 'Lithium' })],
        resourcepacks: [item({ projectId: 'proj-3', name: 'Faithful', type: 'resourcepack' })]
      }),
      provider
    });

    expect(report.entries.map((e) => [e.name, e.category, e.hasUpdate])).toEqual([
      ['Sodium', 'mod', true],
      ['Lithium', 'mod', false],
      ['Faithful', 'resourcepack', true]
    ]);
    expect(report.updatableCount).toBe(2);
  });

  it('Profile の環境 (loader / mcVersion) を context として渡す', async () => {
    const provider = stubProvider({});
    await checkModpackUpdates({ profile: profile({ mods: [item()] }), provider });

    expect(provider.checkForUpdate).toHaveBeenCalledWith('proj-1', undefined, {
      loader: 'Fabric',
      mcVersion: '1.20.1'
    });
  });

  it('**Resource Pack / Shader は loader を渡さない** (loader 非依存のため)', async () => {
    const provider = stubProvider({});
    await checkModpackUpdates({
      profile: profile({
        mods: [],
        resourcepacks: [item({ projectId: 'rp-1', type: 'resourcepack' })],
        shaderpacks: [item({ projectId: 'sh-1', type: 'shader' })]
      }),
      provider
    });

    const contexts = provider.checkForUpdate.mock.calls.map((c) => c[2]);
    expect(contexts).toEqual([{ mcVersion: '1.20.1' }, { mcVersion: '1.20.1' }]);
  });

  it('選択中 version (versionId) を現在値として渡す', async () => {
    const provider = stubProvider({});
    await checkModpackUpdates({
      profile: profile({ mods: [item({ versionId: 'v-cur' })] }),
      provider
    });
    expect(provider.checkForUpdate).toHaveBeenCalledWith('proj-1', 'v-cur', expect.any(Object));
  });

  it('limit を超える分は問い合わせない (レート制限対策)', async () => {
    const provider = stubProvider({});
    await checkModpackUpdates({
      profile: profile({ mods: Array.from({ length: 5 }, (_, i) => item({ projectId: `p${i}` })) }),
      provider,
      limit: 2
    });
    expect(provider.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('**1 件失敗しても全体を失敗にしない** (unresolved として記録)', async () => {
    const provider = stubProvider({
      'proj-1': new Error('rate limited'),
      'proj-2': versionInfo({ hasUpdate: true })
    });

    const report = await checkModpackUpdates({
      profile: profile({ mods: [item(), item({ projectId: 'proj-2', name: 'Lithium' })] }),
      provider
    });

    expect(report.entries[0]).toMatchObject({
      projectId: 'proj-1',
      hasUpdate: false,
      unresolved: 'rate limited'
    });
    expect(report.entries[1]).toMatchObject({ hasUpdate: true });
    expect(report).toMatchObject({ updatableCount: 1, checkedCount: 1, unresolvedCount: 1 });
  });

  it('projectId が無いアイテムは問い合わせない', async () => {
    const provider = stubProvider({});
    await checkModpackUpdates({
      profile: profile({ mods: [item({ projectId: '' })] }),
      provider
    });
    expect(provider.checkForUpdate).not.toHaveBeenCalled();
  });

  it('**CurseForge 由来は問い合わせない** (Phase 13 まで未対応)', async () => {
    const provider = stubProvider({});
    await checkModpackUpdates({
      profile: profile({ mods: [item({ provider: 'curseforge' })] }),
      provider
    });
    expect(provider.checkForUpdate).not.toHaveBeenCalled();
  });

  it('includeMods=false なら Modpack 本体だけ', async () => {
    const provider = stubProvider({});
    const report = await checkModpackUpdates({
      profile: profile({
        mods: [item()],
        modpackSource: { provider: 'modrinth', projectId: 'pack-1', name: 'P', importedAt: 1 }
      }),
      provider,
      includeMods: false
    });
    expect(report.entries.map((e) => e.category)).toEqual(['modpack']);
  });

  it('provider が無ければ空のレポート (throw しない)', async () => {
    const report = await checkModpackUpdates({ profile: profile(), provider: null });
    expect(report).toEqual({
      entries: [],
      updatableCount: 0,
      checkedCount: 0,
      unresolvedCount: 0
    });
  });

  it('modpackSource が無くても収録 Mod は検知する', async () => {
    const provider = stubProvider({ 'proj-1': versionInfo({ hasUpdate: true }) });
    const report = await checkModpackUpdates({ profile: profile({ mods: [item()] }), provider });
    expect(report.entries.map((e) => e.category)).toEqual(['mod']);
    expect(report.updatableCount).toBe(1);
  });
});

describe('updateIssueFromReport', () => {
  function report(overrides: Partial<ModpackUpdateReport> = {}): ModpackUpdateReport {
    return { entries: [], updatableCount: 0, checkedCount: 0, unresolvedCount: 0, ...overrides };
  }

  it('対象が無ければ ok', () => {
    expect(updateIssueFromReport(report())).toEqual({
      id: 'modpack-update',
      status: 'ok',
      message: '更新の対象がありません',
      details: []
    });
  });

  it('すべて最新なら ok (確認件数を出す)', () => {
    const issue = updateIssueFromReport(
      report({ entries: [{ projectId: 'a', name: 'A', category: 'mod', hasUpdate: false }], checkedCount: 1 })
    );
    expect(issue.status).toBe('ok');
    expect(issue.message).toBe('すべて最新です (1 件確認)');
  });

  it('確認できなかった件数も出す', () => {
    const issue = updateIssueFromReport(
      report({
        entries: [
          { projectId: 'a', name: 'A', category: 'mod', hasUpdate: false },
          { projectId: 'b', name: 'B', category: 'mod', hasUpdate: false, unresolved: 'rate limited' }
        ],
        checkedCount: 1,
        unresolvedCount: 1
      })
    );
    expect(issue.message).toBe('すべて最新です (1 件確認 / 1 件は確認できず)');
  });

  it('更新があれば **warning** (error ではない) + 差分を details に', () => {
    const issue = updateIssueFromReport(
      report({
        entries: [
          {
            projectId: 'a',
            name: 'Sodium',
            category: 'mod',
            currentVersionNumber: '0.5.0',
            latestVersionNumber: '0.6.0',
            hasUpdate: true
          },
          { projectId: 'b', name: 'Lithium', category: 'mod', hasUpdate: false }
        ],
        updatableCount: 1,
        checkedCount: 2
      })
    );
    expect(issue).toEqual({
      id: 'modpack-update',
      status: 'warning',
      message: '1 件の更新があります',
      details: ['Sodium: 0.5.0 → 0.6.0']
    });
  });

  it('version 番号が不明なら ? を出す', () => {
    const issue = updateIssueFromReport(
      report({
        entries: [{ projectId: 'a', name: 'A', category: 'mod', hasUpdate: true }],
        updatableCount: 1
      })
    );
    expect(issue.details).toEqual(['A: ? → ?']);
  });
});

describe('checkModpackUpdates: 問い合わせない項目 (体系的バグチェックで発見)', () => {
  beforeEach(() => vi.clearAllMocks());

  /** 問い合わせられた projectId を順に返す */
  function calledIds(provider: { checkForUpdate: ReturnType<typeof vi.fn> }): string[] {
    return provider.checkForUpdate.mock.calls.map((c) => c[0] as string);
  }

  it('**DropMod 内部生成 id (`mrpack-…`) には問い合わせない**', async () => {
    const provider = stubProvider({});
    const p = profile({
      mods: [
        item({ projectId: 'mrpack-3f1c2a', name: 'Unresolved Import' }),
        item({ projectId: 'proj-1', name: 'Sodium' })
      ]
    });

    const report = await checkModpackUpdates({ profile: p, provider });

    // 内部 id は Modrinth に存在せず 404 確定なので問い合わせない
    expect(calledIds(provider)).toEqual(['proj-1']);
    expect(report.entries.map((e) => e.projectId)).toEqual(['proj-1']);
  });

  it('**無効な projectId が limit の枠を食わない**', async () => {
    const provider = stubProvider({});
    // 無効 id 5 件 + 有効 id 1 件、limit=1
    const p = profile({
      mods: [
        ...Array.from({ length: 5 }, (_, i) =>
          item({ projectId: `mrpack-${i}`, name: `Bad ${i}` })
        ),
        item({ projectId: 'proj-1', name: 'Sodium' })
      ]
    });

    const report = await checkModpackUpdates({ profile: p, provider, limit: 1 });

    // slice を絞り込みより後にすると 0 件になる
    expect(calledIds(provider)).toEqual(['proj-1']);
    expect(report.checkedCount).toBe(1);
  });

  it('空 projectId にも問い合わせない', async () => {
    const provider = stubProvider({});
    const p = profile({ mods: [item({ projectId: '' })] });

    const report = await checkModpackUpdates({ profile: p, provider });

    expect(calledIds(provider)).toEqual([]);
    expect(report.entries).toEqual([]);
  });

  it('**modpackSource に projectId が無ければ理由を返す** (.mrpack には入っていない)', async () => {
    const provider = stubProvider({});
    const p = profile({
      modpackSource: { provider: 'modrinth', name: 'CF Pack', versionId: '1.0', importedAt: 1 }
    });

    const report = await checkModpackUpdates({ profile: p, provider, includeMods: false });

    // 「確認した結果 最新」と誤解させないため、確認していない事実を理由付きで返す
    expect(report.modpackUncheckedReason).toContain('プロジェクト ID');
    expect(report.entries).toEqual([]);
  });

  it('projectId があれば本体を確認する (理由は付かない)', async () => {
    const provider = stubProvider({});
    const p = profile({
      modpackSource: {
        provider: 'modrinth',
        projectId: 'pack-1',
        name: 'CF Pack',
        versionId: 'v1',
        importedAt: 1
      }
    });

    const report = await checkModpackUpdates({ profile: p, provider, includeMods: false });

    expect(calledIds(provider)).toEqual(['pack-1']);
    expect(report.modpackUncheckedReason).toBeUndefined();
    expect(report.entries[0]?.category).toBe('modpack');
  });
});

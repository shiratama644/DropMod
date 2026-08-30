/**
 * Modpack インポート時競合検出・適用 (Phase 12-D2 / bug 3) test
 * — `lib/env/modpackAdd.ts`
 *
 * D-3 の「インポート時」側: 同一 projectId・別バージョン = 競合。
 * 既定 = ユーザー版を残す。replace を選んだものだけ Modpack 版へ。
 */

import { describe, it, expect } from 'vitest';
import {
  applyLockedVersionsToProfile,
  applyModpackAddPlan,
  buildModpackAddPlan,
  type ModpackAddPlan
} from '@/features/modpack/utils/modpackAdd';
import type { Profile, ProjectItem } from '@/types';

const PACK_META = {
  projectId: 'pack-1',
  slug: 'pack-slug',
  name: 'Test Pack',
  versionId: 'pack-ver-2',
  versionNumber: '2.0.0'
};

function item(projectId: string, versionId: string, name = projectId): ProjectItem {
  return {
    projectId,
    versionId,
    name,
    type: 'mod',
    versionNumber: `v-${versionId}`,
    filename: `${projectId}-${versionId}.jar`,
    fileUrl: `https://cdn.example/${projectId}/${versionId}.jar`
  };
}

function profile(mods: ProjectItem[]): Profile {
  return {
    id: 'p1',
    name: 'Profile',
    environment: { mcVersion: '1.21.1', loader: 'Fabric' },
    description: '',
    mods
  };
}

describe('buildModpackAddPlan', () => {
  it('Profile に無い projectId は additions になる', () => {
    const plan = buildModpackAddPlan(profile([]), [item('a', 'va1')]);
    expect(plan.additions).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.skipped).toBe(0);
  });

  it('同一 projectId + 別 versionId は conflict になる (bug 3 の再現)', () => {
    const plan = buildModpackAddPlan(profile([item('sodium', 'v-user')]), [
      item('sodium', 'v-pack')
    ]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({
      projectId: 'sodium',
      profileItem: { versionId: 'v-user' },
      packItem: { versionId: 'v-pack' }
    });
    expect(plan.additions).toHaveLength(0);
    expect(plan.skipped).toBe(0);
  });

  it('同一 projectId + 同一 versionId は skipped (重複追加しない)', () => {
    const plan = buildModpackAddPlan(profile([item('sodium', 'v1')]), [item('sodium', 'v1')]);
    expect(plan.skipped).toBe(1);
    expect(plan.additions).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
  });

  it('resourcepack / shader カテゴリも横断して検出する', () => {
    const base: Profile = {
      ...profile([item('mod-a', 'v1')]),
      resourcepacks: [{ ...item('rp-a', 'rp-user'), type: 'resourcepack' }]
    };
    const plan = buildModpackAddPlan(base, [
      item('mod-a', 'v1'),
      { ...item('rp-a', 'rp-pack'), type: 'resourcepack' }
    ]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.packItem.type).toBe('resourcepack');
    expect(plan.skipped).toBe(1);
  });
});

describe('applyModpackAddPlan', () => {
  const plan: ModpackAddPlan = {
    additions: [item('new-mod', 'v1')],
    conflicts: [
      {
        projectId: 'sodium',
        name: 'Sodium',
        profileItem: item('sodium', 'v-user'),
        packItem: item('sodium', 'v-pack')
      }
    ],
    skipped: 0
  };

  it('既定 (keep) はユーザー版を残し、追加分だけ足す', () => {
    const next = applyModpackAddPlan(profile([item('sodium', 'v-user')]), plan, new Map(), PACK_META, 1);
    expect(next.mods.find((m) => m.projectId === 'sodium')?.versionId).toBe('v-user');
    expect(next.mods.find((m) => m.projectId === 'new-mod')?.versionId).toBe('v1');
    expect(next.modpackSource).toMatchObject({
      provider: 'modrinth',
      projectId: 'pack-1',
      versionId: 'pack-ver-2',
      versionNumber: '2.0.0'
    });
  });

  it('replace を選ぶと Modpack 版に置き換わる', () => {
    const next = applyModpackAddPlan(
      profile([item('sodium', 'v-user')]),
      plan,
      new Map([['sodium', 'replace']]),
      PACK_META,
      1
    );
    expect(next.mods.find((m) => m.projectId === 'sodium')?.versionId).toBe('v-pack');
    expect(next.mods.find((m) => m.projectId === 'sodium')?.fileUrl).toContain('v-pack');
  });

  it('lockedVersions は追加分・競合分の全収録物を記録する (keep でも残る = D-3 の基準)', () => {
    const next = applyModpackAddPlan(profile([item('sodium', 'v-user')]), plan, new Map(), PACK_META, 1);
    expect(next.modpackSource?.lockedVersions).toEqual({
      'new-mod': {
        versionId: 'v1',
        versionNumber: 'v-v1',
        fileUrl: 'https://cdn.example/new-mod/v1.jar',
        filename: 'new-mod-v1.jar'
      },
      sodium: {
        versionId: 'v-pack',
        versionNumber: 'v-v-pack',
        fileUrl: 'https://cdn.example/sodium/v-pack.jar',
        filename: 'sodium-v-pack.jar'
      }
    });
  });

  it('resourcepack 系の追加は mods[] に混入しない (カテゴリ保持)', () => {
    const rpPlan: ModpackAddPlan = {
      additions: [{ ...item('rp-new', 'v1'), type: 'resourcepack' }],
      conflicts: [],
      skipped: 0
    };
    const next = applyModpackAddPlan(profile([]), rpPlan, new Map(), PACK_META, 1);
    expect(next.mods).toHaveLength(0);
    expect(next.resourcepacks).toHaveLength(1);
    expect(next.resourcepacks?.[0]?.projectId).toBe('rp-new');
  });

  it('resourcepacks / shaderpacks 配列が元々無い Profile ではキーを作らない', () => {
    const next = applyModpackAddPlan(profile([]), plan, new Map(), PACK_META, 1);
    expect(next.resourcepacks).toBeUndefined();
    expect(next.shaderpacks).toBeUndefined();
  });
});

describe('applyLockedVersionsToProfile (P12-D3 / §10.4)', () => {
  const lockedProfile: Profile = {
    ...profile([
      {
        ...item('sodium', 'v-user'),
        versionNumber: 'v-v-user',
        fileUrl: 'https://cdn.example/user.jar',
        filename: 'user.jar',
        artifact: { sha1: 'sha-user', path: 'mods/user.jar', size: 100 }
      }
    ]),
    resourcepacks: [
      { ...item('rp-a', 'rp-user'), type: 'resourcepack' }
    ],
    modpackSource: {
      provider: 'modrinth',
      projectId: 'pack-1',
      name: 'Pack',
      importedAt: 1,
      lockedVersions: {
        sodium: {
          versionId: 'v-pack',
          versionNumber: 'v-v-pack',
          fileUrl: 'https://cdn.example/pack.jar',
          filename: 'pack.jar',
          sha1: 'sha-pack',
          size: 200,
          path: 'mods/pack.jar'
        },
        'rp-a': {
          versionId: 'rp-pack',
          versionNumber: 'rp-v-pack',
          fileUrl: 'https://cdn.example/rp.zip',
          filename: 'rp.zip',
          sha1: 'sha-rp',
          size: 50,
          path: 'resourcepacks/rp.zip'
        }
      }
    }
  };

  it('replace を選んだ projectId だけロック版に復元する (実体情報込み)', () => {
    const next = applyLockedVersionsToProfile(
      lockedProfile,
      new Map([['sodium', 'replace']])
    );
    const sodium = next.mods.find((m) => m.projectId === 'sodium');
    expect(sodium).toMatchObject({
      versionId: 'v-pack',
      versionNumber: 'v-v-pack',
      fileUrl: 'https://cdn.example/pack.jar',
      filename: 'pack.jar',
      artifact: { sha1: 'sha-pack', path: 'mods/pack.jar', size: 200 }
    });
    // 未選択の resourcepack は不変
    expect(next.resourcepacks?.[0]).toMatchObject({ versionId: 'rp-user' });
    // keep は明示的でも不変
    expect(
      applyLockedVersionsToProfile(lockedProfile, new Map([['sodium', 'keep']]))
    ).toBe(lockedProfile);
  });

  it('replace でもロックが無い projectId は変更しない (安全側)', () => {
    const input = profile([item('solo', 'v1')]);
    const next = applyLockedVersionsToProfile(input, new Map([['solo', 'replace']]));
    expect(next).toBe(input);
  });

  it('resourcepacks / shaderpacks も横断して置換する', () => {
    const next = applyLockedVersionsToProfile(
      lockedProfile,
      new Map([['rp-a', 'replace']])
    );
    expect(next.resourcepacks?.[0]).toMatchObject({
      versionId: 'rp-pack',
      fileUrl: 'https://cdn.example/rp.zip',
      artifact: { sha1: 'sha-rp', path: 'resourcepacks/rp.zip', size: 50 }
    });
  });

  it('元の Profile は変更しない (pure)', () => {
    applyLockedVersionsToProfile(lockedProfile, new Map([['sodium', 'replace']]));
    expect(lockedProfile.mods[0]).toMatchObject({ versionId: 'v-user' });
  });
});

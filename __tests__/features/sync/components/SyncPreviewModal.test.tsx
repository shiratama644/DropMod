/**
 * SyncPreviewModal (Phase 12-B / §10.3) test
 *
 * 6 セクションの表示と、**Import / Modpack 由来の削除はユーザー選択** (§10.3)、
 * **D-2 で「同期する」が押せない**ことを検証する。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncPreviewModal } from '@/features/sync/components/SyncPreviewModal';
import type { SyncPlan, SyncPlanEntry } from '@/features/sync/utils/diff';
import type { ManagedFileSource } from '@/types';

function makePlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
    profileId: 'p1',
    generatedAt: 1,
    additions: [],
    updates: [],
    deletions: [],
    unchanged: [],
    unmanaged: [],
    conflicts: [],
    totals: {
      counts: { addition: 0, update: 0, deletion: 0, unchanged: 0, unmanaged: 0, conflict: 0 },
      writeBytes: 0,
      removeBytes: 0,
      backupBytes: 0
    },
    ...overrides
  };
}

function entry(overrides: Partial<SyncPlanEntry> = {}): SyncPlanEntry {
  return {
    kind: 'addition',
    category: 'mod',
    path: 'mods/a.jar',
    name: 'A',
    projectId: 'proj-1',
    size: 2048,
    ...overrides
  };
}

function del(source: ManagedFileSource, path: string): SyncPlanEntry {
  return entry({ kind: 'deletion', path, name: path, source, size: 1024 });
}

function renderModal(overrides: Partial<React.ComponentProps<typeof SyncPreviewModal>> = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <SyncPreviewModal
      isOpen
      plan={makePlan()}
      rootName=".minecraft"
      writable
      writableReason={null}
      scanSkipped={[]}
      running={false}
      applyProgress={null}
      onClose={onClose}
      onApply={onApply}
      {...overrides}
    />
  );
  return { ...utils, onApply, onClose };
}

describe('SyncPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isOpen=false なら何も描画しない', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container.firstChild).toBeNull();
  });

  it('6 セクションの見出しを (空でも) 常に出す', () => {
    renderModal();
    const headings = screen
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent ?? '');
    for (const title of ['追加', '更新', '競合', '削除', '外部変更を検知', '保持', '管理外']) {
      // サマリタイルにも「削除」があるので見出しロールで絞る
      expect(headings.some((h) => h.startsWith(title))).toBe(true);
    }
    expect(headings).toHaveLength(7);
  });

  it('各セクションに件数を表示する', () => {
    renderModal({
      plan: makePlan({
        additions: [entry()],
        updates: [entry({ kind: 'update', path: 'mods/u.jar' })],
        unmanaged: [entry({ kind: 'unmanaged', path: 'mods/other.jar', projectId: undefined })]
      })
    });
    expect(screen.getByText('追加').parentElement?.textContent).toContain('1');
    expect(screen.getByText('更新').parentElement?.textContent).toContain('1');
    expect(screen.getByText('管理外').parentElement?.textContent).toContain('1');
  });

  it('空のセクションは「なし」と出す', () => {
    renderModal();
    expect(screen.getAllByText(/なし/).length).toBeGreaterThan(0);
  });

  it('**D-2**: writable=false では「同期する」が無効で理由を出す', () => {
    renderModal({
      writable: false,
      writableReason: 'フォルダへの書き込み権限が得られませんでした。'
    });
    const apply = screen.getByRole('button', { name: /同期する/ });
    expect(apply).toBeDisabled();
    expect(apply.getAttribute('title')).toBe('フォルダへの書き込み権限が得られませんでした。');
    expect(screen.getByRole('alert').textContent).toContain('書き込み権限がありません');
    expect(screen.getByRole('alert').textContent).toContain('ZIPダウンロード');
  });

  it('**§10.3**: Import 由来の削除は既定で「保持」= onApply に除外として渡る', () => {
    const { onApply } = renderModal({
      plan: makePlan({
        deletions: [del('import', 'mods/imported.jar')],
        totals: {
          counts: { addition: 0, update: 0, deletion: 1, unchanged: 0, unmanaged: 0, conflict: 0 },
          writeBytes: 0,
          removeBytes: 1024,
          backupBytes: 1024
        }
      })
    });

    // 選択 UI が出る
    expect(screen.getByLabelText('削除する')).toBeInTheDocument();
    expect((screen.getByLabelText('削除する') as HTMLInputElement).checked).toBe(false);
    // フッタの削除件数は 0 (既定は保持)
    expect(screen.getByText(/削除 0 件/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /同期する/ }));
    expect(onApply).toHaveBeenCalledWith(['mods/imported.jar'], new Map());
  });

  it('**§10.3**: チェックを入れると削除対象になる', () => {
    const { onApply } = renderModal({
      plan: makePlan({ deletions: [del('modpack', 'mods/mp.jar')] })
    });

    fireEvent.click(screen.getByLabelText('削除する'));
    expect(screen.getByText(/削除 1 件/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /同期する/ }));
    expect(onApply).toHaveBeenCalledWith([], new Map());
  });

  it('source バッジを表示する', () => {
    renderModal({
      plan: makePlan({
        deletions: [del('dropmod', 'mods/dm.jar'), del('import', 'mods/im.jar')],
        updates: [entry({ kind: 'update', path: 'mods/up.jar', source: 'modpack' })]
      })
    });
    expect(screen.getByText('DropMod 追加')).toBeInTheDocument();
    expect(screen.getByText('Import 由来')).toBeInTheDocument();
    expect(screen.getByText('Modpack 更新')).toBeInTheDocument();
  });

  it('**DropMod 追加の削除には選択 UI を出さない** (常に削除される)', () => {
    const { onApply } = renderModal({
      plan: makePlan({ deletions: [del('dropmod', 'mods/dm.jar')] })
    });
    expect(screen.queryByLabelText('削除する')).not.toBeInTheDocument();
    expect(screen.getByText(/削除 1 件/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /同期する/ }));
    expect(onApply).toHaveBeenCalledWith([], new Map());
  });

  it('外部変更を検知したファイルは「触りません」と明記する', () => {
    renderModal({
      plan: makePlan({
        unchanged: [entry({ kind: 'unchanged', path: 'mods/touched.jar', externallyModified: true })]
      })
    });
    expect(screen.getByText('mods/touched.jar')).toBeInTheDocument();
    expect(screen.getByText(/触りません/)).toBeInTheDocument();
  });

  // ====================================================================
  // P12-D3: 競合セクション (keep 既定 / replace 選択)
  // ====================================================================
  const conflict = {
    category: 'mod' as const,
    projectId: 'sodium',
    name: 'Sodium',
    userVersionId: 'v-user',
    userVersionNumber: 'v-v-user',
    packVersionId: 'v-pack',
    packVersionNumber: 'v-v-pack',
    pack: {
      fileUrl: 'https://cdn.example/pack.jar',
      filename: 'pack.jar',
      sha1: 'sha-pack',
      size: 200,
      path: 'mods/pack.jar'
    }
  };

  it('**P12-D3**: 競合セクションを「更新」の下に表示し、既定は keep', () => {
    const { onApply } = renderModal({
      plan: makePlan({
        conflicts: [conflict],
        totals: {
          counts: { addition: 0, update: 0, deletion: 0, unchanged: 0, unmanaged: 0, conflict: 1 },
          writeBytes: 0,
          removeBytes: 0,
          backupBytes: 0
        }
      })
    });

    // 見出しと選択 UI
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent ?? '');
    expect(headings.some((h) => h.startsWith('競合'))).toBe(true);
    const select = screen.getByLabelText('Sodium の競合解決') as HTMLSelectElement;
    expect(select.value).toBe('keep');
    expect(screen.getByText(/v-v-user/)).toBeInTheDocument();
    expect(screen.getByText(/v-v-pack/)).toBeInTheDocument();

    // 既定のまま実行 → choices は空 Map (keep)
    fireEvent.click(screen.getByRole('button', { name: /同期する/ }));
    expect(onApply).toHaveBeenCalledWith([], new Map());
  });

  it('**P12-D3**: 「Modpack 版に置換」を選ぶと onApply に replace が渡る', () => {
    const { onApply } = renderModal({
      plan: makePlan({ conflicts: [conflict] })
    });

    fireEvent.change(screen.getByLabelText('Sodium の競合解決'), {
      target: { value: 'replace' }
    });
    fireEvent.click(screen.getByRole('button', { name: /同期する/ }));
    expect(onApply).toHaveBeenCalledWith(
      [],
      new Map([['sodium', 'replace']])
    );
  });

  it('**P12-D3**: 複数競合は projectId ごとに独立して選択できる', () => {
    const rpConflict = {
      ...conflict,
      category: 'resourcepack' as const,
      projectId: 'rp-a',
      name: 'RP',
      packVersionNumber: 'rp-v-pack'
    };
    const { onApply } = renderModal({
      plan: makePlan({ conflicts: [conflict, rpConflict] })
    });

    fireEvent.change(screen.getByLabelText('RP の競合解決'), {
      target: { value: 'replace' }
    });
    fireEvent.click(screen.getByRole('button', { name: /同期する/ }));
    expect(onApply).toHaveBeenCalledWith(
      [],
      new Map([['rp-a', 'replace']])
    );
  });

  it('**P12-D3**: 競合 0 件でも見出しは出す (7 分類固定)', () => {
    renderModal();
    expect(screen.getByText('競合')).toBeInTheDocument();
    // 「競合」セクション内に「なし」が出る (見出し → note → なし)
    const heading = screen.getByRole('heading', { level: 4, name: /競合/ });
    expect(heading.parentElement?.textContent).toContain('なし');
  });

  it('外部変更のファイルは「保持」セクションに重複表示しない', () => {
    renderModal({
      plan: makePlan({
        unchanged: [
          entry({ kind: 'unchanged', path: 'mods/touched.jar', externallyModified: true }),
          entry({ kind: 'unchanged', path: 'mods/kept.jar' })
        ]
      })
    });
    expect(screen.getByText('mods/kept.jar')).toBeInTheDocument();
    expect(screen.getByText(/削除しません/)).toBeInTheDocument(); // 管理外の注記
  });

  it('管理外ファイルは一覧に出すが削除しない旨を書く', () => {
    renderModal({
      plan: makePlan({
        unmanaged: [entry({ kind: 'unmanaged', path: 'mods/foreign.jar', projectId: undefined })]
      })
    });
    expect(screen.getByText('mods/foreign.jar')).toBeInTheDocument();
  });

  it('読み取れなかったファイルを一覧に出す', () => {
    renderModal({ scanSkipped: ['mods/locked.jar'] });
    expect(screen.getByText(/読み取れなかったファイル 1 件/)).toBeInTheDocument();
    expect(screen.getByText('mods/locked.jar')).toBeInTheDocument();
  });

  it('容量を人間可読な形式で出す', () => {
    renderModal({
      plan: makePlan({
        totals: {
          counts: { addition: 1, update: 0, deletion: 0, unchanged: 0, unmanaged: 0, conflict: 0 },
          writeBytes: 2048,
          removeBytes: 0,
          backupBytes: 1048576
        }
      })
    });
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByText('1 MB')).toBeInTheDocument();
  });

  it('実行中は「同期する」が無効で進捗を出す', () => {
    renderModal({
      running: true,
      applyProgress: { done: 2, total: 5, path: 'mods/x.jar' }
    });
    expect(screen.getByRole('button', { name: /同期中/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('2 / 5 — mods/x.jar');
    // 閉じるボタンも無効 (途中で閉じさせない)
    expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled();
  });

  it('キャンセル / 背景クリックで onClose', () => {
    const { onClose, container } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('.modal-overlay') as Element);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

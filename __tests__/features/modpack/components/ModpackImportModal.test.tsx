/**
 * インポート時競合解決モーダル (Phase 12-D2 / bug 3) test
 * — `components/ModpackImportModal.tsx`
 *
 * D-3 の決定: 競合ごとに [ユーザー版を残す] / [Modpack 版に置換]、既定はユーザー版。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModpackImportModal } from '@/features/modpack/components/ModpackImportModal';
import type { ModpackAddPlan } from '@/features/modpack/utils/modpackAdd';
import type { ProjectItem } from '@/types';

function item(projectId: string, versionId: string, name: string): ProjectItem {
  return {
    projectId,
    versionId,
    versionNumber: `v-${versionId}`,
    name,
    type: 'mod'
  };
}

const PLAN: ModpackAddPlan = {
  additions: [item('new-mod', 'v1', 'New Mod')],
  conflicts: [
    {
      projectId: 'sodium',
      name: 'Sodium',
      profileItem: item('sodium', 'v-user', 'Sodium'),
      packItem: item('sodium', 'v-pack', 'Sodium')
    }
  ],
  skipped: 1
};

describe('ModpackImportModal', () => {
  it('競合一覧を表示し、既定は「ユーザー版を残す」', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ModpackImportModal isOpen plan={PLAN} onConfirm={onConfirm} onClose={() => {}} />
    );

    expect(screen.getByText('Sodium')).toBeInTheDocument();
    const userRadio = screen.getByRole('radio', { name: /ユーザー版を残す/ });
    expect(userRadio).toBeChecked();
    const packRadio = screen.getByRole('radio', { name: /Modpack 版に置換/ });
    expect(packRadio).not.toBeChecked();
    expect(screen.getByText(/追加 1 件/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /追加する/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const choices = onConfirm.mock.calls[0]?.[0] as Map<string, string>;
    expect(choices.get('sodium')).toBe('keep');
  });

  it('「Modpack 版に置換」を選ぶと replace で確定される', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ModpackImportModal isOpen plan={PLAN} onConfirm={onConfirm} onClose={() => {}} />
    );

    await user.click(screen.getByRole('radio', { name: /Modpack 版に置換/ }));
    expect(screen.getByRole('radio', { name: /Modpack 版に置換/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /追加する/ }));

    const choices = onConfirm.mock.calls[0]?.[0] as Map<string, string>;
    expect(choices.get('sodium')).toBe('replace');
  });

  it('キャンセルは onConfirm を呼ばず onClose する', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ModpackImportModal isOpen plan={PLAN} onConfirm={onConfirm} onClose={onClose} />
    );

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('plan が null なら何も描画しない', () => {
    const { container } = render(
      <ModpackImportModal isOpen plan={null} onConfirm={() => {}} onClose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

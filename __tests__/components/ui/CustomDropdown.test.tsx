/**
 * CustomDropdown component test (Sub-Phase 9-C.4)
 *
 * - React Portal (document.body) にメニューを描画するので、screen 全体から検索
 * - gsap のアニメーションは jsdom で走るが visible な差を確認しない (DOM 出現のみ検証)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomDropdown } from '@/components/ui/CustomDropdown';

const options = [
  { label: 'Fabric', value: 'Fabric' },
  { label: 'Forge', value: 'Forge' },
  { label: 'NeoForge', value: 'NeoForge' },
  { label: 'Quilt', value: 'Quilt' }
];

describe('CustomDropdown', () => {
  it('選択済みラベルを trigger に表示', () => {
    render(
      <CustomDropdown
        options={options}
        selectedValue="Forge"
        onChange={() => {}}
        label="Loader"
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Loader' });
    expect(trigger).toHaveTextContent('Forge');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('trigger クリックで listbox が開き、全 option が表示される', async () => {
    const user = userEvent.setup();
    render(
      <CustomDropdown
        options={options}
        selectedValue="Fabric"
        onChange={() => {}}
        label="Loader"
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Loader' }));
    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: 'Loader' })).toBeInTheDocument();
    });
    for (const opt of options) {
      expect(screen.getByRole('option', { name: opt.label })).toBeInTheDocument();
    }
    expect(screen.getByRole('combobox', { name: 'Loader' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('option クリックで onChange が呼ばれ、メニューが閉じる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CustomDropdown
        options={options}
        selectedValue="Fabric"
        onChange={onChange}
        label="Loader"
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Loader' }));
    await user.click(screen.getByRole('option', { name: 'NeoForge' }));
    expect(onChange).toHaveBeenCalledWith('NeoForge');
    // 閉じている
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );
  });

  it('選択済み option には aria-selected=true', async () => {
    const user = userEvent.setup();
    render(
      <CustomDropdown
        options={options}
        selectedValue="Quilt"
        onChange={() => {}}
        label="Loader"
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Loader' }));
    const quiltOpt = await screen.findByRole('option', { name: 'Quilt' });
    expect(quiltOpt).toHaveAttribute('aria-selected', 'true');
    const fabricOpt = screen.getByRole('option', { name: 'Fabric' });
    expect(fabricOpt).toHaveAttribute('aria-selected', 'false');
  });

  it('Enter キーで trigger が開き、もう一度 Enter で選択', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CustomDropdown
        options={options}
        selectedValue="Fabric"
        onChange={onChange}
        label="Loader"
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Loader' });
    trigger.focus();
    await user.keyboard('{Enter}');
    // 開いた
    await waitFor(() =>
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    );
    // もう一度 Enter (focusedIndex=Fabric の位置)
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('Fabric');
  });

  it('Arrow キーで focusedIndex を移動し、Enter で選択', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CustomDropdown
        options={options}
        selectedValue="Fabric"
        onChange={onChange}
        label="Loader"
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Loader' });
    trigger.focus();
    // 開く (Fabric が focused)
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    // Down 3 回 → Quilt
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('Quilt');
  });

  it('Escape で閉じる (open 状態から)', async () => {
    const user = userEvent.setup();
    render(
      <CustomDropdown
        options={options}
        selectedValue="Fabric"
        onChange={() => {}}
        label="Loader"
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Loader' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('tone/icon 付き option でもラベルで選択できる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CustomDropdown
        options={[
          { label: '0.6.13', value: 'stable', icon: 'fa-circle-check', tone: 'stable' },
          { label: '0.6.14-beta', value: 'beta', icon: 'fa-flask', tone: 'beta' }
        ]}
        selectedValue="stable"
        onChange={onChange}
        label="Version"
      />
    );
    expect(screen.getByRole('combobox', { name: 'Version' })).toHaveTextContent('0.6.13');
    await user.click(screen.getByRole('combobox', { name: 'Version' }));
    await user.click(screen.getByRole('option', { name: '0.6.14-beta' }));
    expect(onChange).toHaveBeenCalledWith('beta');
  });

  it('options が空なら開かない (無反応)', async () => {
    const user = userEvent.setup();
    render(
      <CustomDropdown
        options={[]}
        selectedValue=""
        onChange={() => {}}
        label="Empty"
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Empty' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

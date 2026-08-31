/**
 * CustomDropdown component test (Sub-Phase 9-C.4)
 *
 * - React Portal (document.body) にメニューを描画するので、screen 全体から検索
 * - gsap のアニメーションは jsdom で走るが visible な差を確認しない (DOM 出現のみ検証)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomDropdown } from '@/components/ui/CustomDropdown';

function domRect(overrides: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...overrides
  };
}

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

  it('options が配列でなければ空扱いで安全', async () => {
    const user = userEvent.setup();
    render(
      <CustomDropdown
        options={null as unknown as { label: string; value: string }[]}
        selectedValue=""
        onChange={() => {}}
        label="Null"
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Null' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('tone=alpha の option は赤系スタイル (text-red-500)', async () => {
    const user = userEvent.setup();
    render(
      <CustomDropdown
        options={[
          { label: 'alpha版', value: 'alpha', tone: 'alpha' },
          { label: 'stable版', value: 'stable', tone: 'stable' }
        ]}
        selectedValue="alpha"
        onChange={() => {}}
        label="Version"
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Version' }));
    const alphaOpt = await screen.findByRole('option', { name: 'alpha版' });
    expect(alphaOpt.querySelector('.text-red-500')).not.toBeNull();
    const stableOpt = screen.getByRole('option', { name: 'stable版' });
    expect(stableOpt.querySelector('.text-emerald-500')).not.toBeNull();
  });

  it('selectedValue が options に無ければ先頭から開始する', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CustomDropdown
        options={options}
        selectedValue="missing"
        onChange={onChange}
        label="Loader"
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Loader' });
    trigger.focus();
    await user.keyboard('{Enter}'); // open (focusedIndex = 0)
    await screen.findByRole('listbox');
    await user.keyboard('{Enter}'); // Fabric を選択
    expect(onChange).toHaveBeenCalledWith('Fabric');
  });

  it('open 中に trigger をクリックすると閉じる', async () => {
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
    await user.click(trigger); // open
    await screen.findByRole('listbox');
    await user.click(trigger); // close (mousedown は trigger 内 → 外側扱いしない)
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );
  });

  it('外側クリックで閉じる', async () => {
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
    await screen.findByRole('listbox');
    fireEvent.mouseDown(document.body);
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );
  });

  it('ウィンドウスクロールで閉じる', async () => {
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
    await screen.findByRole('listbox');
    // ブラウザの scroll イベントは target が document (window ではない)
    fireEvent.scroll(document);
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );
  });

  it('メニュー内スクロールでは閉じない', async () => {
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
    const menu = await screen.findByRole('listbox');
    fireEvent.scroll(menu);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('ウィンドウリサイズで閉じる', async () => {
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
    await screen.findByRole('listbox');
    fireEvent.resize(window);
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );
  });

  it('画面下部に trigger があるとメニューを上向きに開く', async () => {
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
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
      domRect({ top: 500, right: 400, bottom: 600, left: 100, width: 300 })
    );
    await user.click(trigger);
    const menu = await screen.findByRole('listbox', { name: 'Loader' });
    expect(menu.style.top).toBe('auto');
    expect(menu.style.bottom).toBe(`${window.innerHeight - 500 + 6}px`);
    expect(menu.style.transformOrigin).toBe('bottom right');
  });

  it('右端付近の trigger でもメニューは画面内に収まる (left 補正)', async () => {
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
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
      domRect({ top: 100, right: 800, bottom: 200, left: 500, width: 300 })
    );
    await user.click(trigger);
    const menu = await screen.findByRole('listbox', { name: 'Loader' });
    // leftPos = 800 - max(300, 140) = 500 >= 10 → 補正なし
    expect(menu.style.left).toBe('500px');
    expect(menu.style.transformOrigin).toBe('top right');
  });

  it('矢印・Enter・Escape 以外のキーは無視される', async () => {
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
    await user.keyboard('a');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('閉じている状態で Escape は無視される', async () => {
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
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('空 options のときキーボード操作は無視される', async () => {
    const user = userEvent.setup();
    render(
      <CustomDropdown
        options={[]}
        selectedValue=""
        onChange={() => {}}
        label="Empty"
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Empty' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ArrowDown でも開いて選択できる', async () => {
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
    await user.keyboard('{ArrowDown}'); // open
    await screen.findByRole('listbox');
    await user.keyboard('{Enter}'); // Fabric
    expect(onChange).toHaveBeenCalledWith('Fabric');
  });

  it('ArrowUp で前の option に移動して選択できる', async () => {
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
    await user.keyboard('{ArrowUp}'); // open (focusedIndex 0)
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowUp}'); // (0 - 1 + 4) % 4 = 3 → Quilt
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('Quilt');
  });

  it('open 中に options が縮小しても Enter は安全に閉じる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <CustomDropdown
        options={options}
        selectedValue="Fabric"
        onChange={onChange}
        label="Loader"
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Loader' });
    trigger.focus();
    await user.keyboard('{Enter}'); // open (focusedIndex 0)
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}'); // focusedIndex 3
    rerender(
      <CustomDropdown
        options={[options[0]!]}
        selectedValue="Fabric"
        onChange={onChange}
        label="Loader"
      />
    );
    // focusedIndex 3 は options 範囲外 → onChange は呼ばれず close のみ
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );
  });

  it('open 中に unmount しても安全', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <CustomDropdown
        options={options}
        selectedValue="Fabric"
        onChange={() => {}}
        label="Loader"
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Loader' }));
    await screen.findByRole('listbox');
    unmount();
  });
});

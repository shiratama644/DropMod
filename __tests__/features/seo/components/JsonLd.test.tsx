/**
 * features/seo/components/JsonLd.tsx tests (COV-3)
 *
 * RSC 用 JSON-LD コンポーネント。serializeJsonLd で `<` をエスケープして
 * dangerouslySetInnerHTML に流すだけの薄いラッパーなので、描画結果を検証する。
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JsonLd } from '@/features/seo/components/JsonLd';
import { buildWebSiteJsonLd } from '@/features/seo/utils/jsonld';

describe('JsonLd', () => {
  it('WebSite JSON-LD を script タグに描画する', () => {
    const data = buildWebSiteJsonLd('https://example.com');
    const { container } = render(<JsonLd data={data} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(script?.textContent).toContain('"@type":"WebSite"');
    expect(script?.textContent).toContain('"url":"https://example.com"');
  });

  it('JSON-LD の < をエスケープして描画する (script 破壊防止)', () => {
    const { container } = render(
      <JsonLd data={{ name: '</script><script>alert(1)</script>' }} />
    );
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent).not.toContain('</script>');
    expect(script?.textContent).toContain('\\u003c/script>');
  });

  it('オブジェクト以外の値 (null) も安全に描画できる', () => {
    const { container } = render(<JsonLd data={null} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
  });
});

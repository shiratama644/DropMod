import { describe, expect, it } from 'vitest';
import { buildDiscoverModalMetadata } from '@/features/project/server';

describe('buildDiscoverModalMetadata (SEO-2)', () => {
  it('モーダル直接 URL は noindex かつ follow、canonical は詳細へ', () => {
    const meta = buildDiscoverModalMetadata('mods', 'sodium');
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toEqual({ canonical: '/mod/sodium' });
  });

  it('4 種別の discover セグメントを詳細パスへ写す', () => {
    expect(buildDiscoverModalMetadata('modpacks', 'foo').alternates).toEqual({
      canonical: '/modpack/foo'
    });
    expect(buildDiscoverModalMetadata('resourcepacks', 'bar').alternates).toEqual({
      canonical: '/resourcepack/bar'
    });
    expect(buildDiscoverModalMetadata('shaders', 'iris').alternates).toEqual({
      canonical: '/shader/iris'
    });
  });

  it('未知セグメントは noindex のみ（誤った canonical を付けない）', () => {
    const meta = buildDiscoverModalMetadata('plugins', 'x');
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toBeUndefined();
  });
});

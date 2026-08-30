import { describe, it, expect } from 'vitest';
import {
  compareVersionsDesc,
  forgeVersionsForMc,
  getLoaderVersions,
  mergeVersionLists,
  neoforgeMatchesMc,
  neoforgeVersionsForMc,
  parseFabricOrQuiltLoaders,
  parseMavenVersions,
  withPreferredVersion
} from '@/features/profiles/loaders/versions';

describe('getLoaderVersions fallback', () => {
  it('Fabric の先頭は 0.19.3', () => {
    expect(getLoaderVersions('Fabric')[0]).toBe('0.19.3');
    expect(getLoaderVersions('Fabric')).toContain('0.19.3');
  });

  it('未知ローダーは空', () => {
    expect(getLoaderVersions('Vanilla')).toEqual([]);
  });
});

describe('parseFabricOrQuiltLoaders', () => {
  it('flat version と loader.version の両方を読む', () => {
    expect(
      parseFabricOrQuiltLoaders([
        { version: '0.19.3', stable: true },
        { loader: { version: '0.16.14' } },
        '0.15.11'
      ])
    ).toEqual(['0.19.3', '0.16.14', '0.15.11']);
  });

  it('壊れた入力は空', () => {
    expect(parseFabricOrQuiltLoaders(null)).toEqual([]);
    expect(parseFabricOrQuiltLoaders({})).toEqual([]);
  });
});

describe('parseMavenVersions', () => {
  it('maven-metadata の version 一覧を取る', () => {
    const xml = `
      <metadata>
        <versioning>
          <versions>
            <version>1.20.1-47.4.0</version>
            <version>1.21.1-52.0.45</version>
          </versions>
        </versioning>
      </metadata>
    `;
    expect(parseMavenVersions(xml)).toEqual(['1.20.1-47.4.0', '1.21.1-52.0.45']);
  });
});

describe('forge / neoforge MC 絞り込み', () => {
  it('Forge は選択中 MC のビルドだけ返す', () => {
    expect(
      forgeVersionsForMc(['1.20.1-47.4.0', '1.21.1-52.0.45', '1.20.1-47.3.0'], '1.20.1')
    ).toEqual(['47.4.0', '47.3.0']);
  });

  it('NeoForge 21.1.x は MC 1.21.1', () => {
    expect(neoforgeMatchesMc('21.1.133', '1.21.1')).toBe(true);
    expect(neoforgeMatchesMc('21.0.10', '1.21')).toBe(true);
    expect(neoforgeMatchesMc('21.1.133', '1.20.1')).toBe(false);
    expect(neoforgeVersionsForMc(['21.1.133', '20.4.237', '21.1.80'], '1.21.1')).toEqual([
      '21.1.133',
      '21.1.80'
    ]);
  });
});

describe('merge / preferred', () => {
  it('新しい順にマージし重複を除く', () => {
    expect(mergeVersionLists(['0.16.14', '0.19.3'], ['0.19.3', '0.15.11'])).toEqual([
      '0.19.3',
      '0.16.14',
      '0.15.11'
    ]);
  });

  it('未収録の preferred を先頭に残す', () => {
    expect(withPreferredVersion(['0.19.3'], '0.15')).toEqual(['0.15', '0.19.3']);
  });

  it('semver 比較は 0.19.3 > 0.16.14', () => {
    expect(compareVersionsDesc('0.19.3', '0.16.14')).toBeLessThan(0);
  });
});

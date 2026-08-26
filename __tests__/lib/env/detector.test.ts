/**
 * EnvironmentDetector chain test (Phase 11-B)
 *
 * Fake ファイルツリー上で Official / Prism / Generic の各 Detector と
 * chain (detectEnvironment) の優先順位を検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  detectEnvironment,
  OfficialLauncherDetector,
  PrismDetector,
  GenericDetector
} from '@/lib/env/detector';
import {
  parseVersionManifest,
  extractMcVersionFromId
} from '@/lib/env/detector/official';
import { parseMmcPack } from '@/lib/env/detector/prism';
import { FileSystemSource } from '@/lib/env/source';
import { createFakeFileSystem } from '../../test-utils/fakeFs';

function sourceOf(files: Record<string, string>, rootName = '.minecraft') {
  return new FileSystemSource(createFakeFileSystem(files, rootName), rootName);
}

// ---------------------------------------------------------------------------
// バージョン JSON パーサ (計画書 §4.4.1 の表)
// ---------------------------------------------------------------------------

describe('parseVersionManifest (公式ランチャー versions/*.json)', () => {
  it('Fabric: mainClass net.fabricmc.loader + fabric-loader バージョン抽出', () => {
    const parsed = parseVersionManifest({
      id: 'fabric-loader-0.16.0-1.21.1',
      inheritsFrom: '1.21.1',
      mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
      libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }]
    });
    expect(parsed).toEqual({
      mcVersion: '1.21.1',
      loader: 'Fabric',
      loaderVersion: '0.16.0'
    });
  });

  it('Quilt: mainClass org.quiltmc.loader + quilt-loader バージョン抽出', () => {
    const parsed = parseVersionManifest({
      id: 'quilt-loader-0.26.0-1.21.1',
      inheritsFrom: '1.21.1',
      mainClass: 'org.quiltmc.loader.impl.launch.knot.QuiltClient',
      libraries: [{ name: 'org.quiltmc:quilt-loader:0.26.0' }]
    });
    expect(parsed).toEqual({
      mcVersion: '1.21.1',
      loader: 'Quilt',
      loaderVersion: '0.26.0'
    });
  });

  it('Forge: bootstraplauncher + net.minecraftforge:forge (MC バージョン接頭辞を除去)', () => {
    const parsed = parseVersionManifest({
      id: '1.20.1-forge-47.2.0',
      inheritsFrom: '1.20.1',
      mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
      libraries: [{ name: 'net.minecraftforge:forge:1.20.1-47.2.0' }]
    });
    expect(parsed).toEqual({
      mcVersion: '1.20.1',
      loader: 'Forge',
      loaderVersion: '47.2.0'
    });
  });

  it('NeoForge: bootstraplauncher + net.neoforged:neoforge', () => {
    const parsed = parseVersionManifest({
      id: 'neoforge-20.4.237',
      inheritsFrom: '1.20.4',
      mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
      libraries: [{ name: 'net.neoforged:neoforge:20.4.237' }]
    });
    expect(parsed).toEqual({
      mcVersion: '1.20.4',
      loader: 'NeoForge',
      loaderVersion: '20.4.237'
    });
  });

  it('Vanilla: mainClass net.minecraft は loader なし', () => {
    const parsed = parseVersionManifest({
      id: '1.21.1',
      mainClass: 'net.minecraft.client.main.Main'
    });
    expect(parsed).toEqual({ mcVersion: '1.21.1', loader: 'Vanilla' });
  });

  it('inheritsFrom が無ければ id の最後のバージョントークンから抽出', () => {
    expect(extractMcVersionFromId('fabric-loader-0.16.0-1.21.1')).toBe('1.21.1');
    expect(extractMcVersionFromId('1.21.1')).toBe('1.21.1');
    expect(extractMcVersionFromId('custom-name')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mmc-pack.json パーサ (計画書 §4.4.2)
// ---------------------------------------------------------------------------

describe('parseMmcPack (Prism/MultiMC mmc-pack.json)', () => {
  it('components の uid から MC バージョンと loader を抽出', () => {
    const parsed = parseMmcPack({
      formatVersion: 1,
      components: [
        { uid: 'net.minecraft', version: '1.21.1' },
        { uid: 'net.fabricmc.fabric-loader', version: '0.16.0' }
      ]
    });
    expect(parsed).toEqual({
      mcVersion: '1.21.1',
      loader: 'Fabric',
      loaderVersion: '0.16.0'
    });
  });

  it('NeoForge / Forge / Quilt の uid も判定', () => {
    expect(
      parseMmcPack({
        components: [
          { uid: 'net.minecraft', version: '1.20.4' },
          { uid: 'net.neoforged', version: '20.4.237' }
        ]
      })
    ).toEqual({ mcVersion: '1.20.4', loader: 'NeoForge', loaderVersion: '20.4.237' });

    expect(
      parseMmcPack({
        components: [
          { uid: 'net.minecraft', version: '1.20.1' },
          { uid: 'net.minecraftforge', version: '47.2.0' }
        ]
      })
    ).toEqual({ mcVersion: '1.20.1', loader: 'Forge', loaderVersion: '47.2.0' });

    expect(
      parseMmcPack({
        components: [
          { uid: 'net.minecraft', version: '1.21.1' },
          { uid: 'org.quiltmc.quilt-loader', version: '0.26.0' }
        ]
      })
    ).toEqual({ mcVersion: '1.21.1', loader: 'Quilt', loaderVersion: '0.26.0' });
  });

  it('components 空・loader 無し (Vanilla) は mcVersion のみ', () => {
    expect(parseMmcPack({ components: [{ uid: 'net.minecraft', version: '1.21.1' }] })).toEqual({
      mcVersion: '1.21.1'
    });
    expect(parseMmcPack({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Detector 実装 + chain
// ---------------------------------------------------------------------------

describe('OfficialLauncherDetector', () => {
  const fabricJson = JSON.stringify({
    id: 'fabric-loader-0.16.0-1.21.1',
    inheritsFrom: '1.21.1',
    mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }]
  });

  it('versions/*.json があるとき canDetect', async () => {
    const detector = new OfficialLauncherDetector();
    expect(await detector.canDetect(sourceOf({ 'versions/x/x.json': '{}' }))).toBe(true);
    expect(await detector.canDetect(sourceOf({ 'mods/a.jar': 'x' }))).toBe(false);
  });

  it('Loader 付きバージョンを優先して検出 (Vanilla が先にあっても)', async () => {
    const detector = new OfficialLauncherDetector();
    const detected = await detector.detect(
      sourceOf({
        'versions/1.21.1/1.21.1.json': JSON.stringify({
          id: '1.21.1',
          mainClass: 'net.minecraft.client.main.Main'
        }),
        'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json': fabricJson,
        'mods/sodium.jar': 'jar',
        'resourcepacks/fresh.zip': 'zip'
      })
    );
    expect(detected.rootType).toBe('official');
    expect(detected.mcVersion).toBe('1.21.1');
    expect(detected.loader).toBe('Fabric');
    expect(detected.loaderVersion).toBe('0.16.0');
    expect(detected.contentDirs).toEqual({
      mods: 'mods',
      resourcepacks: 'resourcepacks'
    });
  });

  it('全部 Vanilla なら最初のパース成功版を使う (loader=Vanilla)', async () => {
    const detector = new OfficialLauncherDetector();
    const detected = await detector.detect(
      sourceOf({
        'versions/1.20.1/1.20.1.json': JSON.stringify({
          id: '1.20.1',
          mainClass: 'net.minecraft.client.main.Main'
        })
      })
    );
    expect(detected.loader).toBe('Vanilla');
    expect(detected.mcVersion).toBe('1.20.1');
  });

  it('versions/ が空・JSON 無しでも rootType=official で env は undefined', async () => {
    const detector = new OfficialLauncherDetector();
    const detected = await detector.detect(sourceOf({ 'versions/empty/README.txt': 'x' }));
    expect(detected.rootType).toBe('official');
    expect(detected.mcVersion).toBeUndefined();
    expect(detected.loader).toBeUndefined();
  });
});

describe('PrismDetector', () => {
  const mmcPack = JSON.stringify({
    formatVersion: 1,
    components: [
      { uid: 'net.minecraft', version: '1.21.1' },
      { uid: 'net.fabricmc.fabric-loader', version: '0.16.0' }
    ]
  });

  it('mmc-pack.json があるとき canDetect', async () => {
    const detector = new PrismDetector();
    expect(await detector.canDetect(sourceOf({ 'mmc-pack.json': mmcPack }))).toBe(true);
    expect(await detector.canDetect(sourceOf({ 'mods/a.jar': 'x' }))).toBe(false);
  });

  it('.minecraft/ サブフォルダの有無両方の contentDirs を解決', async () => {
    const detector = new PrismDetector();

    // instance root 直下に mods
    const a = await detector.detect(
      sourceOf({
        'mmc-pack.json': mmcPack,
        'mods/a.jar': 'x'
      })
    );
    expect(a.rootType).toBe('prism');
    expect(a.mcVersion).toBe('1.21.1');
    expect(a.loader).toBe('Fabric');
    expect(a.loaderVersion).toBe('0.16.0');
    expect(a.contentDirs).toEqual({ mods: 'mods' });

    // .minecraft/ サブフォルダに mods
    const b = await detector.detect(
      sourceOf({
        'mmc-pack.json': mmcPack,
        '.minecraft/mods/a.jar': 'x',
        '.minecraft/resourcepacks/rp.zip': 'zip'
      })
    );
    expect(b.contentDirs).toEqual({
      mods: '.minecraft/mods',
      resourcepacks: '.minecraft/resourcepacks'
    });
  });

  it('mmc-pack.json のパース失敗は env なしで contentDirs のみ', async () => {
    const detector = new PrismDetector();
    const detected = await detector.detect(
      sourceOf({ 'mmc-pack.json': 'not-json', 'mods/a.jar': 'x' })
    );
    expect(detected.rootType).toBe('prism');
    expect(detected.mcVersion).toBeUndefined();
    expect(detected.contentDirs).toEqual({ mods: 'mods' });
  });
});

describe('GenericDetector + chain (detectEnvironment)', () => {
  it('mods/ だけの構造は GenericDetector が担当 (env は undefined)', async () => {
    const detected = await detectEnvironment(sourceOf({ 'mods/a.jar': 'x' }));
    expect(detected.rootType).toBe('generic');
    expect(detected.mcVersion).toBeUndefined();
    expect(detected.loader).toBeUndefined();
    expect(detected.contentDirs).toEqual({ mods: 'mods' });
  });

  it('何も無い空フォルダでも Generic が fallback (unknown にしない)', async () => {
    const detected = await detectEnvironment(sourceOf({}));
    expect(detected.rootType).toBe('generic');
    expect(detected.contentDirs).toEqual({});
  });

  it('chain 優先順位: versions があると Official が Prism より優先', async () => {
    const detected = await detectEnvironment(
      sourceOf({
        'versions/1.21.1/1.21.1.json': JSON.stringify({
          id: '1.21.1',
          mainClass: 'net.minecraft.client.main.Main'
        }),
        'mmc-pack.json': JSON.stringify({
          components: [{ uid: 'net.minecraft', version: '9.9.9' }]
        }),
        'mods/a.jar': 'x'
      })
    );
    expect(detected.rootType).toBe('official');
    expect(detected.mcVersion).toBe('1.21.1'); // Prism の 9.9.9 ではない
  });

  it('chain: versions 無し + mmc-pack.json ありなら Prism', async () => {
    const detected = await detectEnvironment(
      sourceOf({
        'mmc-pack.json': JSON.stringify({
          components: [{ uid: 'net.minecraft', version: '1.20.1' }]
        }),
        '.minecraft/mods/a.jar': 'x'
      })
    );
    expect(detected.rootType).toBe('prism');
    expect(detected.mcVersion).toBe('1.20.1');
    expect(detected.contentDirs.mods).toBe('.minecraft/mods');
  });

  it('GenericDetector を単体で直接呼んでも canDetect=true', async () => {
    const detector = new GenericDetector();
    expect(await detector.canDetect()).toBe(true);
  });
});

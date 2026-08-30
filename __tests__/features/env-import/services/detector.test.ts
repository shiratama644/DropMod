/**
 * EnvironmentDetector chain test (Phase 11-B)
 *
 * Fake ファイルツリー上で Official / Prism / Generic の各 Detector と
 * chain (detectEnvironment) の優先順位を検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  detectEnvironment,
  DETECTOR_REGISTRY,
  createDetectorChain,
  rootTypeLabel,
  InstanceFileDetector,
  OfficialLauncherDetector,
  PrismDetector,
  MojoLauncherDetector,
  GenericDetector
} from '@/features/env-import/services/detector';
import {
  parseVersionManifest,
  extractMcVersionFromId
} from '@/features/env-import/services/detector/official';
import { parseMmcPack } from '@/features/env-import/services/detector/prism';
import { parseMojoInstance } from '@/features/env-import/services/detector/mojoLauncher';
import { FileSystemSource } from '@/lib/env/source';
import { createFakeFileSystem } from '@/__tests__/test-utils/fakeFs';

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
// mojo_instance.json パーサ (MojoLauncher / 2026-08-29 ユーザー要望)
// ---------------------------------------------------------------------------

describe('parseMojoInstance (MojoLauncher mojo_instance.json)', () => {
  it('Fabric: fabric-loader-<loaderVer>-<mc>', () => {
    expect(
      parseMojoInstance({
        argsMode: 0,
        renderer: 'opengles3_ltw',
        sharedData: false,
        icon: 'fabric',
        name: 'てすと',
        versionId: 'fabric-loader-0.19.3-1.21.11'
      })
    ).toEqual({ loader: 'Fabric', loaderVersion: '0.19.3', mcVersion: '1.21.11' });
  });

  it('Quilt: quilt-loader-<loaderVer>-<mc> (26.2 形式も取得)', () => {
    expect(
      parseMojoInstance({
        argsMode: 0,
        sharedData: false,
        icon: 'quilt',
        name: 'Quilt',
        versionId: 'quilt-loader-0.24.0-26.2'
      })
    ).toEqual({ loader: 'Quilt', loaderVersion: '0.24.0', mcVersion: '26.2' });
  });

  it('Forge: <mc>-forge-<forgeVer>', () => {
    expect(
      parseMojoInstance({
        argsMode: 0,
        sharedData: false,
        icon: 'forge',
        name: 'Forge',
        versionId: '1.21-forge-51.0.33'
      })
    ).toEqual({ loader: 'Forge', loaderVersion: '51.0.33', mcVersion: '1.21' });
  });

  it('NeoForge: neoforge-<ver> から MC を導出 (21.11.45 → 1.21.11)', () => {
    expect(
      parseMojoInstance({
        argsMode: 0,
        sharedData: false,
        icon: 'neoforge',
        name: 'NeoForge',
        versionId: 'neoforge-21.11.45'
      })
    ).toEqual({ loader: 'NeoForge', loaderVersion: '21.11.45', mcVersion: '1.21.11' });
  });

  it('NeoForge 旧形式 (MC 1.20.2〜1.21.11) の MC 導出', () => {
    expect(parseMojoInstance({ versionId: 'neoforge-21.0.167' })).toEqual({
      loader: 'NeoForge',
      loaderVersion: '21.0.167',
      mcVersion: '1.21'
    });
    expect(parseMojoInstance({ versionId: 'neoforge-20.4.251' })).toEqual({
      loader: 'NeoForge',
      loaderVersion: '20.4.251',
      mcVersion: '1.20.4'
    });
    expect(parseMojoInstance({ versionId: 'neoforge-20.2.93' })).toEqual({
      loader: 'NeoForge',
      loaderVersion: '20.2.93',
      mcVersion: '1.20.2'
    });
    expect(parseMojoInstance({ versionId: 'neoforge-21.10.64' })).toEqual({
      loader: 'NeoForge',
      loaderVersion: '21.10.64',
      mcVersion: '1.21.10'
    });
  });

  it('NeoForge 新形式 (MC 26.1〜) は date ベースの MC に一致', () => {
    expect(parseMojoInstance({ versionId: 'neoforge-26.1.0.19-beta' })).toEqual({
      loader: 'NeoForge',
      loaderVersion: '26.1.0.19-beta',
      mcVersion: '26.1'
    });
    expect(parseMojoInstance({ versionId: 'neoforge-26.1.1.15-beta' })).toEqual({
      loader: 'NeoForge',
      loaderVersion: '26.1.1.15-beta',
      mcVersion: '26.1.1'
    });
    expect(parseMojoInstance({ versionId: 'neoforge-26.2.0.67' })).toEqual({
      loader: 'NeoForge',
      loaderVersion: '26.2.0.67',
      mcVersion: '26.2'
    });
    expect(parseMojoInstance({ versionId: 'neoforge-26.1.2.97' })).toEqual({
      loader: 'NeoForge',
      loaderVersion: '26.1.2.97',
      mcVersion: '26.1.2'
    });
  });

  it('Legacy Fabric: legacy-fabric-loader-<loaderVer>-<mc> (Fabric として扱う)', () => {
    expect(parseMojoInstance({ versionId: 'legacy-fabric-loader-0.6.3-1.21' })).toEqual({
      loader: 'Fabric',
      loaderVersion: '0.6.3',
      mcVersion: '1.21'
    });
  });

  it('未知形式・versionId 欠落は env なし', () => {
    expect(parseMojoInstance({ versionId: 'custom-unknown' })).toEqual({});
    expect(parseMojoInstance({ name: 'No Version' })).toEqual({});
    expect(parseMojoInstance({ versionId: '' })).toEqual({});
    expect(parseMojoInstance({ versionId: 'fabric-loader-0.16.0' })).toEqual({});
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

describe('MojoLauncherDetector', () => {
  const mojo = (versionId: string) =>
    JSON.stringify({ argsMode: 0, sharedData: false, icon: 'fabric', name: 'てすと', versionId });

  it('mojo_instance.json があるとき canDetect', async () => {
    const detector = new MojoLauncherDetector();
    expect(await detector.canDetect(sourceOf({ 'mojo_instance.json': mojo('fabric-loader-0.19.3-1.21.11') }))).toBe(true);
    expect(await detector.canDetect(sourceOf({ 'mods/a.jar': 'x' }))).toBe(false);
  });

  it('instance root 直下 / .minecraft 配下の両方の contentDirs を解決', async () => {
    const detector = new MojoLauncherDetector();

    // root 直下に mods/
    const a = await detector.detect(
      sourceOf({
        'mojo_instance.json': mojo('fabric-loader-0.19.3-1.21.11'),
        'mods/sodium.jar': 'jar',
        'shaderpacks/s.zip': 'zip'
      })
    );
    expect(a.rootType).toBe('mojo-launcher');
    expect(a.mcVersion).toBe('1.21.11');
    expect(a.loader).toBe('Fabric');
    expect(a.loaderVersion).toBe('0.19.3');
    expect(a.contentDirs).toEqual({ mods: 'mods', shaderpacks: 'shaderpacks' });

    // .minecraft/ 配下に mods/
    const b = await detector.detect(
      sourceOf({
        'mojo_instance.json': mojo('1.20.1-forge-47.2.0'),
        '.minecraft/mods/a.jar': 'x',
        '.minecraft/resourcepacks/rp.zip': 'zip'
      })
    );
    expect(b.rootType).toBe('mojo-launcher');
    expect(b.loader).toBe('Forge');
    expect(b.mcVersion).toBe('1.20.1');
    expect(b.contentDirs).toEqual({
      mods: '.minecraft/mods',
      resourcepacks: '.minecraft/resourcepacks'
    });
  });

  it('mojo_instance.json のパース失敗は env なしで contentDirs のみ', async () => {
    const detector = new MojoLauncherDetector();
    const detected = await detector.detect(
      sourceOf({ 'mojo_instance.json': 'not-json', 'mods/a.jar': 'x' })
    );
    expect(detected.rootType).toBe('mojo-launcher');
    expect(detected.mcVersion).toBeUndefined();
    expect(detected.loader).toBeUndefined();
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

  it('chain: versions / mmc-pack が無く mojo_instance.json があれば MojoLauncher', async () => {
    const detected = await detectEnvironment(
      sourceOf({
        'mojo_instance.json': JSON.stringify({
          argsMode: 0,
          sharedData: false,
          icon: 'fabric',
          name: 'てすと',
          versionId: 'fabric-loader-0.19.3-1.21.11'
        }),
        'mods/a.jar': 'x'
      })
    );
    expect(detected.rootType).toBe('mojo-launcher');
    expect(detected.mcVersion).toBe('1.21.11');
    expect(detected.loader).toBe('Fabric');
    expect(detected.contentDirs).toEqual({ mods: 'mods' });
  });

  it('GenericDetector を単体で直接呼んでも canDetect=true', async () => {
    const detector = new GenericDetector();
    expect(await detector.canDetect()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DETECTOR_REGISTRY (2026-08-29: 他ランチャー追加の容易化)
// ---------------------------------------------------------------------------

describe('DETECTOR_REGISTRY (ランチャー登録表)', () => {
  it('組み込み 4 種が registered され、chain は priority 順', () => {
    expect(DETECTOR_REGISTRY.map((entry) => entry.rootType)).toEqual([
      'official',
      'prism',
      'mojo-launcher',
      'generic'
    ]);

    const chain = createDetectorChain();
    expect(chain.map((detector) => detector.name)).toEqual([
      'OfficialLauncher',
      'Prism',
      'MojoLauncher',
      'Generic'
    ]);
  });

  it('rootTypeLabel は登録済みラベル・レガシーラベル・未登録フォールバックを返す', () => {
    expect(rootTypeLabel('official')).toBe('公式ランチャー (.minecraft)');
    expect(rootTypeLabel('prism')).toBe('Prism / MultiMC インスタンス');
    expect(rootTypeLabel('mojo-launcher')).toBe('MojoLauncher インスタンス');
    expect(rootTypeLabel('generic')).toBe('汎用構造 (mods/ 等)');
    // 後方互換 (Detector を持たない rootType)
    expect(rootTypeLabel('multimc')).toBe('MultiMC インスタンス');
    expect(rootTypeLabel('modrinth-app')).toBe('Modrinth App インスタンス');
    expect(rootTypeLabel('unknown')).toBe('不明');
    // 未登録は raw 文字列
    expect(rootTypeLabel('gdlauncher')).toBe('gdlauncher');
  });

  it('InstanceFileDetector 基底で新ランチャーを追加できる (登録 1 エントリに相当)', async () => {
    // 例: 仮想的な "gdlauncher" (instance.json) を基底クラスだけで実装
    const gdLauncher = new InstanceFileDetector({
      name: 'GDLauncher',
      rootType: 'gdlauncher',
      instanceFile: 'instance.json',
      parse: (json) => {
        const instance = json as { minecraft?: { version?: string } };
        return {
          mcVersion: instance?.minecraft?.version,
          loader: 'Vanilla'
        };
      },
      contentRoots: ['', '.minecraft']
    });

    // canDetect / detect の共通動作
    expect(await gdLauncher.canDetect(sourceOf({ 'instance.json': '{}' }))).toBe(true);
    expect(await gdLauncher.canDetect(sourceOf({ 'mods/a.jar': 'x' }))).toBe(false);

    const detected = await gdLauncher.detect(
      sourceOf({
        'instance.json': JSON.stringify({ minecraft: { version: '1.20.1' } }),
        'mods/a.jar': 'x'
      })
    );
    expect(detected.rootType).toBe('gdlauncher');
    expect(detected.mcVersion).toBe('1.20.1');
    expect(detected.loader).toBe('Vanilla');
    expect(detected.contentDirs).toEqual({ mods: 'mods' });
  });

  it('chain に新規 Detector を追加しても detectEnvironment が動作する (注入テスト)', async () => {
    // registry は直接変更せず、chain を差し替えて「追加が容易」であることを検証
    const customChain = [
      ...createDetectorChain().filter((d) => d.name !== 'Generic'),
      new InstanceFileDetector({
        name: 'Extra',
        rootType: 'generic', // RootType 補完用の既存値 (テスト上の簡略化)
        instanceFile: 'extra.json',
        parse: () => ({ mcVersion: '1.20.4', loader: 'Vanilla' })
      }),
      new GenericDetector()
    ];

    const detected = await detectEnvironment(
      sourceOf({ 'extra.json': '{}', 'mods/a.jar': 'x' }),
      customChain
    );
    expect(detected.rootType).toBe('generic');
    expect(detected.mcVersion).toBe('1.20.4');
    expect(detected.contentDirs).toEqual({ mods: 'mods' });
  });
});

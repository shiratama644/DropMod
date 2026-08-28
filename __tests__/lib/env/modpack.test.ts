/**
 * Modpack 形式判定 (Phase 12-C / §10.6) test
 *
 * Modrinth と CurseForge はどちらも ZIP で拡張子では区別できない。中身で判定する。
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  detectModpackFormat,
  isModrinthModpack,
  CURSEFORGE_UNSUPPORTED_MESSAGE
} from '@/lib/env/modpack';

async function zipBlob(build: (zip: JSZip) => void): Promise<Blob> {
  const zip = new JSZip();
  build(zip);
  return zip.generateAsync({ type: 'blob' });
}

const MODRINTH_INDEX = JSON.stringify({
  formatVersion: 1,
  game: 'minecraft',
  name: 'Test Pack',
  versionId: '1.0',
  files: [],
  dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.0' }
});

const CURSEFORGE_MANIFEST = JSON.stringify({
  minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] },
  manifestType: 'minecraftModpack',
  manifestVersion: 1,
  name: 'CF Pack',
  version: '1.0',
  files: [{ projectID: 238222, fileID: 4542349, required: true }],
  overrides: 'overrides'
});

describe('detectModpackFormat', () => {
  it('modrinth.index.json があれば **modrinth**', async () => {
    const blob = await zipBlob((z) => {
      z.file('modrinth.index.json', MODRINTH_INDEX);
      z.file('overrides/mods/a.jar', 'a');
    });
    const info = await detectModpackFormat(blob);
    expect(info.format).toBe('modrinth');
    expect(info.evidence).toBe('modrinth.index.json');
  });

  it('manifestType: minecraftModpack なら **curseforge**', async () => {
    const blob = await zipBlob((z) => {
      z.file('manifest.json', CURSEFORGE_MANIFEST);
      z.file('overrides/mods/a.jar', 'a');
    });
    const info = await detectModpackFormat(blob);
    expect(info.format).toBe('curseforge');
    expect(info.evidence).toBe('manifest.json');
  });

  it('**manifestType が無くても** minecraft.modLoaders で curseforge と判定する', async () => {
    const blob = await zipBlob((z) => {
      z.file(
        'manifest.json',
        JSON.stringify({ minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0' }] } })
      );
    });
    expect((await detectModpackFormat(blob)).format).toBe('curseforge');
  });

  it('**両方ある場合は Modrinth を優先**する', async () => {
    const blob = await zipBlob((z) => {
      z.file('modrinth.index.json', MODRINTH_INDEX);
      z.file('manifest.json', CURSEFORGE_MANIFEST);
    });
    expect((await detectModpackFormat(blob)).format).toBe('modrinth');
  });

  it('.minecraft フォルダ ZIP は **unknown** (Modpack ではない)', async () => {
    const blob = await zipBlob((z) => {
      z.file('mods/a.jar', 'a');
      z.file('versions/1.21.1/1.21.1.json', '{}');
    });
    expect((await detectModpackFormat(blob)).format).toBe('unknown');
  });

  it('manifest.json が Modpack 用でなければ unknown', async () => {
    const blob = await zipBlob((z) => {
      z.file('manifest.json', JSON.stringify({ name: 'some other tool', version: 2 }));
    });
    expect((await detectModpackFormat(blob)).format).toBe('unknown');
  });

  it('**manifest.json が壊れていても throw せず unknown**', async () => {
    const blob = await zipBlob((z) => {
      z.file('manifest.json', '{ not json');
    });
    expect((await detectModpackFormat(blob)).format).toBe('unknown');
  });

  it('**ZIP として読めなくても throw せず unknown**', async () => {
    const blob = new Blob(['this is not a zip at all'], { type: 'application/zip' });
    expect((await detectModpackFormat(blob)).format).toBe('unknown');
  });
});

describe('isModrinthModpack', () => {
  it('Modrinth 形式だけ true', async () => {
    const mr = await zipBlob((z) => z.file('modrinth.index.json', MODRINTH_INDEX));
    const cf = await zipBlob((z) => z.file('manifest.json', CURSEFORGE_MANIFEST));
    expect(await isModrinthModpack(mr)).toBe(true);
    expect(await isModrinthModpack(cf)).toBe(false);
  });
});

describe('CURSEFORGE_UNSUPPORTED_MESSAGE', () => {
  it('未対応であることと代替手段を伝える', () => {
    expect(CURSEFORGE_UNSUPPORTED_MESSAGE).toContain('未対応');
    expect(CURSEFORGE_UNSUPPORTED_MESSAGE).toContain('.mrpack');
    expect(CURSEFORGE_UNSUPPORTED_MESSAGE).toContain('Phase 13');
  });
});

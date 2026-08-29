import { ImageResponse } from 'next/og';
import { parseDetailType } from '@/lib/constants/search';
import { fetchModrinthProject } from '@/lib/modrinth/server';
import { formatOgDownloads } from '@/lib/seo/og-copy';
import { projectTypeLabel } from '@/lib/seo/jsonld';

export const runtime = 'nodejs';
export const revalidate = 3600;
export const alt = 'DropMod';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Params {
  params: Promise<{ projectType: string; slug: string }>;
}

export default async function OpenGraphImage({ params }: Params) {
  const { projectType, slug } = await params;
  const type = parseDetailType(projectType);

  let title = slug;
  let downloads = 0;
  let iconSrc: string | null = null;
  let typeLabel = type ? projectTypeLabel(type) : 'Project';

  if (type) {
    try {
      const project = await fetchModrinthProject(slug);
      title = project.title || slug;
      downloads = project.downloads ?? 0;
      iconSrc = project.icon_url ?? null;
      typeLabel = projectTypeLabel(type);
    } catch {
      /* フォールバック描画 */
    }
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #090d14 0%, #0f172a 55%, #064e3b 100%)',
        color: '#f8fafc',
        padding: '56px 64px',
        fontFamily: 'sans-serif'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, color: '#34d399' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #34d399, #059669)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#020617',
            fontWeight: 800,
            fontSize: 28
          }}
        >
          D
        </div>
        DropMod
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 48, flex: 1 }}>
        {iconSrc ? (
          // next/og の ImageResponse は next/image 非対応。外部アイコンは <img> のみ。
          // biome-ignore lint/performance/noImgElement: next/og では img 必須
          <img
            src={iconSrc}
            width={180}
            height={180}
            alt=""
            style={{ borderRadius: 32, background: '#1e293b' }}
          />
        ) : (
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: 32,
              background: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 72,
              color: '#34d399'
            }}
          >
            ▢
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 28, color: '#94a3b8', marginBottom: 12 }}>{typeLabel}</div>
          <div
            style={{
              fontSize: title.length > 28 ? 48 : 64,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.02em'
            }}
          >
            {title}
          </div>
          <div style={{ marginTop: 24, fontSize: 32, color: '#6ee7b7' }}>{formatOgDownloads(downloads)}</div>
        </div>
      </div>
    </div>,
    { ...size }
  );
}

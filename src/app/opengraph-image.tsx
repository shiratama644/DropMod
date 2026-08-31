import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'DropMod - Minecraft Mod Downloader';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #090d14 0%, #064e3b 100%)',
        color: '#f8fafc',
        padding: 72,
        fontFamily: 'sans-serif'
      }}
    >
      <div style={{ fontSize: 28, color: '#34d399', marginBottom: 16 }}>Minecraft Mod Manager</div>
      <div style={{ fontSize: 80, fontWeight: 800, letterSpacing: '-0.04em' }}>DropMod</div>
      <div style={{ marginTop: 24, fontSize: 32, color: '#94a3b8', maxWidth: 900 }}>
        Search Modrinth, manage profiles, export ZIP
      </div>
    </div>,
    { ...size }
  );
}

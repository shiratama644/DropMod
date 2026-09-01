import { logger } from '@/lib/platform/logger';
import { MuiLink as Link } from '@/components/ui/MuiLink';
import { fetchModrinthSearch } from '@/lib/modrinth/server';
import { AnimatedStats } from '@/features/landing';
import { HeroRotator } from '@/features/landing';
import { LandingSearchForm } from '@/features/landing';
import { PopularMarquee } from '@/features/landing';
import { PreviewCard } from '@/features/landing';
import { FeatureGridClient } from '@/features/landing/components/FeatureGridClient';
import type { ModrinthHit } from '@/types';

// MUI Components
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';

// Material Icons
import SearchIcon from '@mui/icons-material/Search';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import ShieldIcon from '@mui/icons-material/Shield';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ExploreIcon from '@mui/icons-material/Explore';
import GitHubIcon from '@mui/icons-material/GitHub';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

export const metadata = {
  title: 'DropMod - Minecraft Mod Downloader',
  description:
    'Modrinth から Mod・リソースパック・シェーダーを検索し、プロファイル単位で構成を管理・ZIP エクスポートできる Web アプリ。'
};

const ROTATOR_WORDS = [
  'Mods',
  'Modpacks',
  'Resource Packs',
  'Shaders',
] as const;

async function fetchLandingHits(sortBy: 'popular' | 'newest', limit: number): Promise<ModrinthHit[]> {
  try {
    const result = await fetchModrinthSearch({ query: '', sortBy, limit, offset: 0, projectType: 'mod' });
    return result.hits;
  } catch (e) {
    logger.warn(`landing ${sortBy} fetch failed, using empty:`, e);
    return [];
  }
}

export default async function LandingPage() {
  const [popularHits, newestHits] = await Promise.all([
    fetchLandingHits('popular', 6),
    fetchLandingHits('newest', 16)
  ]);
  const previewHits = popularHits.slice(0, 6);
  const marqueeHits = newestHits.slice(0, 16);

  return (
    <Box component="main" sx={{ flex: 1, width: '100%', bgcolor: 'background.default' }}>
      
      {/* 1. Hero */}
      <Box component="section" sx={{ position: 'relative', overflow: 'hidden', pt: { xs: 8, sm: 12 }, pb: { xs: 5, sm: 7 } }}>
        <Box sx={{
          position: 'absolute', inset: 0, zIndex: 0, opacity: 0.6,
          background: 'radial-gradient(ellipse at top, rgba(16, 185, 129, 0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(59, 130, 246, 0.10), transparent 50%)',
        }} />
        
        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: { xs: 4, sm: 6 } }}>
          <Box sx={{
            width: { xs: 64, sm: 80 }, height: { xs: 64, sm: 80 }, mx: 'auto',
            borderRadius: '24px', // M3E shape
            background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.3)',
          }}>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }}>D</Typography>
          </Box>

          <Box>
            <Typography variant="h2" component="h1" sx={{ fontWeight: 800, mb: 2, fontSize: { xs: '2rem', sm: '3rem', md: '3.75rem' }, lineHeight: 1.2 }}>
              Minecraft を彩る、<br />
              <HeroRotator words={ROTATOR_WORDS} />
              の玄関口。
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '600px', mx: 'auto', fontWeight: 400, lineHeight: 1.6 }}>
              数万件の Mod・リソースパック・シェーダーをブラウザで探し、プロファイル単位で構成を管理できる、ミニマルな Mod マネージャ。
            </Typography>
          </Box>

          <Box sx={{ maxWidth: 500, mx: 'auto', width: '100%' }}>
            <LandingSearchForm placeholder="例: Sodium, Iris, Fabric API…" />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'center', gap: 2 }}>
            <Button
              component={Link}
              href="/discover/mods"
              variant="contained"
              size="large"
              startIcon={<ExploreIcon />}
              sx={{ borderRadius: '24px', py: 1.5, px: 4, fontWeight: 'bold' }}
            >
              すべての Mod を見る
            </Button>
            <Button
              component={Link}
              href="/profile"
              variant="outlined"
              size="large"
              startIcon={<LibraryBooksIcon />}
              sx={{ borderRadius: '24px', py: 1.5, px: 4, fontWeight: 'bold', bgcolor: 'background.paper' }}
            >
              マイプロファイル
            </Button>
          </Box>
        </Container>
      </Box>

      {/* 2. Preview */}
      {previewHits.length > 0 && (
        <Container component="section" maxWidth="lg" sx={{ py: { xs: 6, sm: 8 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: { xs: 3, sm: 4 } }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>いま人気の Mod</Typography>
              <Typography variant="body2" color="text.secondary">Modrinth のダウンロード数上位から自動更新</Typography>
            </Box>
            <Typography component={Link} href="/discover/mods" variant="body2" color="primary" sx={{ fontWeight: 'bold', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              もっと見る →
            </Typography>
          </Box>
          <FeatureGridClient className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {previewHits.map((hit) => (
              <Box key={hit.project_id} data-reveal-item>
                <PreviewCard hit={hit} />
              </Box>
            ))}
          </FeatureGridClient>
        </Container>
      )}

      {/* 3. Marquee */}
      {marqueeHits.length > 0 && (
        <Box component="section" sx={{ py: { xs: 4, sm: 6 }, bgcolor: 'action.hover' }}>
          <Container maxWidth="lg" sx={{ mb: { xs: 2, sm: 3 } }}>
            <Typography variant="h5" align="center" sx={{ fontWeight: 'bold' }}>続々と追加される新しい Mod</Typography>
            <Typography variant="body2" color="text.secondary" align="center">Modrinth の新着順。ホバーすると流れが止まります。</Typography>
          </Container>
          <PopularMarquee hits={marqueeHits} ariaLabel="新着の Mod" />
        </Box>
      )}

      {/* 4. Features */}
      <Container component="section" maxWidth="lg" sx={{ py: { xs: 8, sm: 12 } }}>
        <Box sx={{ textAlign: 'center', mb: { xs: 6, sm: 8 } }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>必要な機能だけを、シンプルに</Typography>
          <Typography variant="body1" color="text.secondary">Mod 探しから配布 zip 作成まで、面倒な作業をブラウザだけで完結。</Typography>
        </Box>

        <FeatureGridClient className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard icon={<SearchIcon fontSize="large" color="primary" />} title="横断検索" description="人気・更新・カテゴリ・MC バージョン・ローダーで絞り込み。無限スクロールで軽快。" />
          <FeatureCard icon={<LibraryBooksIcon fontSize="large" color="primary" />} title="プロファイル管理" description="複数の Mod セットを名前付きで保存。用途ごとに一瞬で切り替え。" />
          <FeatureCard icon={<ShieldIcon fontSize="large" color="primary" />} title="依存関係チェック" description="必須依存の欠落や競合を検知し、事前に警告。プレイ中の事故を防ぐ。" />
          <FeatureCard icon={<FileDownloadIcon fontSize="large" color="primary" />} title="ワンクリック配布" description="mods フォルダにそのまま置ける ZIP を 1 クリック生成。.mrpack 読込にも対応。" />
        </FeatureGridClient>
      </Container>

      {/* 5. Stats */}
      <Container component="section" maxWidth="lg" sx={{ py: { xs: 8, sm: 12 } }}>
        <Box sx={{ textAlign: 'center', mb: { xs: 6, sm: 8 } }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>数字で見る DropMod</Typography>
        </Box>
        <AnimatedStats />
      </Container>

      {/* 6. Community */}
      <Container component="section" maxWidth="md" sx={{ py: { xs: 8, sm: 12 } }}>
        <Card variant="outlined" sx={{ p: { xs: 4, sm: 6 }, textAlign: 'center', borderRadius: '32px' }}>
          <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 3, borderRadius: '20px', bgcolor: 'text.primary', color: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GitHubIcon fontSize="large" />
          </Box>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>オープンに、みんなで作る</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 500, mx: 'auto' }}>
            DropMod は MIT ライセンスの OSS プロジェクト。Issue / PR / フィードバックはいつでも歓迎です。
          </Typography>
          <Button
            href="https://github.com/shiratama644/DropMod"
            target="_blank"
            variant="contained"
            color="inherit"
            size="large"
            endIcon={<OpenInNewIcon />}
            sx={{ borderRadius: '24px', py: 1.5, px: 4, bgcolor: 'text.primary', color: 'background.paper', '&:hover': { bgcolor: 'text.secondary' } }}
          >
            GitHub で見る
          </Button>
        </Card>
      </Container>

      {/* 7. CTA */}
      <Container component="section" maxWidth="md" sx={{ py: { xs: 10, sm: 16 }, textAlign: 'center' }}>
        <Typography variant="h3" gutterBottom sx={{ fontWeight: 'bold' }}>さあ、次の Mod を探しに行こう。</Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 6, fontWeight: 400 }}>アカウント登録は不要。ブラウザを開けば、すぐに始められます。</Typography>
        <Button
          component={Link}
          href="/discover/mods"
          variant="contained"
          size="large"
          startIcon={<SearchIcon />}
          sx={{ borderRadius: '32px', py: 2, px: 6, fontSize: '1.25rem', fontWeight: 'bold' }}
        >
          Mod を探す
        </Button>
      </Container>

      <LandingFooter />
    </Box>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card data-reveal-item variant="outlined" sx={{ height: '100%', borderRadius: '24px' }}>
      <CardContent sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '16px', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.1, position: 'absolute' }} />
        <Box sx={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          {icon}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{description}</Typography>
      </CardContent>
    </Card>
  );
}

function LandingFooter() {
  return (
    <Box component="footer" sx={{ borderTop: '1px solid var(--mui-palette-divider)', bgcolor: 'background.paper', pt: { xs: 6, sm: 10 }, pb: { xs: 4, sm: 6 } }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '2fr 1fr 1fr 1fr' }, gap: 4 }}>
          {/* Brand */}
          <Box sx={{ gridColumn: { xs: 'span 2', md: 'span 1' } }}>
            <Box component={Link} href="/" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, textDecoration: 'none', color: 'inherit', mb: 2 }}>
              <Box sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>D</Typography>
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>DropMod</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Minecraft Mod プロファイルマネージャ。Modrinth と連携して、面倒な Mod 管理をブラウザで完結。
            </Typography>
          </Box>

          <FooterColumn title="サイト">
            <FooterLink href="/">ホーム</FooterLink>
            <FooterLink href="/discover/mods">Mod を探す</FooterLink>
            <FooterLink href="/profile">マイプロファイル</FooterLink>
            <FooterLink href="/settings">設定</FooterLink>
          </FooterColumn>

          <FooterColumn title="カテゴリ">
            <FooterLink href="/discover/mods">Mods</FooterLink>
            <FooterLink href="/discover/modpacks">Modpacks</FooterLink>
            <FooterLink href="/discover/resourcepacks">Resource Packs</FooterLink>
            <FooterLink href="/discover/shaders">Shaders</FooterLink>
          </FooterColumn>

          <FooterColumn title="外部リンク">
            <FooterExtLink href="https://modrinth.com">Modrinth</FooterExtLink>
            <FooterExtLink href="https://www.minecraft.net">Minecraft 公式</FooterExtLink>
            <FooterExtLink href="https://github.com/shiratama644/DropMod">GitHub</FooterExtLink>
          </FooterColumn>
        </Box>

        <Box sx={{ mt: 8, pt: 4, borderTop: '1px solid var(--mui-palette-divider)', display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">© 2026 DropMod. MIT License. Not affiliated with Mojang, Microsoft, or Modrinth.</Typography>
          <Typography variant="caption" color="text.secondary">Minecraft is a trademark of Mojang Synergies AB.</Typography>
        </Box>
      </Container>
    </Box>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" gutterBottom sx={{ fontWeight: 'bold', display: 'block' }}>{title}</Typography>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {children}
      </Box>
    </Box>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Typography component={Link} href={href} variant="body2" color="text.secondary" sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
        {children}
      </Typography>
    </li>
  );
}

function FooterExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Typography component="a" href={href} target="_blank" rel="noopener noreferrer" variant="body2" color="text.secondary" sx={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 0.5, '&:hover': { color: 'primary.main' } }}>
        {children}
        <OpenInNewIcon sx={{ fontSize: 14 }} />
      </Typography>
    </li>
  );
}

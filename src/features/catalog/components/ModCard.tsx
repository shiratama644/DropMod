'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { MuiLink as Link } from '@/components/ui/MuiLink';
import Image from 'next/image';
import type { ModrinthHit, Profile } from '@/types';
import { modalPathFromProject, type SearchLayout } from '@/lib/constants/search';
import { categoryLabel, primaryCategoryId } from '../constants/categories';
import { shouldUnoptimizeImage } from '@/lib/utils/image';
import { useIsMobile } from '@/hooks/useMediaQuery';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Skeleton from "@mui/material/Skeleton";
import CircularProgress from "@mui/material/CircularProgress";
import DownloadIcon from '@mui/icons-material/Download';
import UpdateIcon from '@mui/icons-material/Update';
import CategoryIcon from '@mui/icons-material/Category';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExtensionIcon from '@mui/icons-material/Extension';

interface ModCardProps {
  hit: ModrinthHit;
  profile: Profile;
  onToggleMod: (id: string, e?: React.MouseEvent, silent?: boolean) => unknown;
  layout?: SearchLayout;
}

function formatDownloads(num: number): string {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const ModCard: React.FC<ModCardProps> = ({ hit, profile, onToggleMod, layout = '3' }) => {
  const isMobile = useIsMobile();
  const actualLayout = isMobile ? '1' : layout;

  const isAdded = profile.mods.some((m) => m.projectId === hit.project_id) || 
                  (profile.resourcepacks || []).some((m) => m.projectId === hit.project_id) ||
                  (profile.shaderpacks || []).some((m) => m.projectId === hit.project_id);
                  
  const [isPending, setIsPending] = useState(false);
  const detailPath = modalPathFromProject(hit.project_type, hit.slug);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;
    setIsPending(true);
    try {
      await onToggleMod(hit.project_id, e);
    } finally {
      setIsPending(false);
    }
  };

  const hasIcon = Boolean(hit.icon_url);
  const unoptimized = hasIcon && hit.icon_url ? shouldUnoptimizeImage(hit.icon_url) : false;

  return (
    <Card 
      component={Link} 
      href={detailPath} 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        textDecoration: 'none', 
        height: '100%', 
        transition: 'all 0.2s', 
        '&:hover': { transform: 'translateY(-4px)', boxShadow: 6, borderColor: 'primary.main' },
        borderRadius: 4,
        border: '1px solid var(--mui-palette-divider)',
        bgcolor: 'background.paper'
      }}
    >
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', flex: 1, gap: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Box sx={{ width: 48, height: 48, borderRadius: 2, overflow: 'hidden', flexShrink: 0, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {hasIcon && hit.icon_url ? (
              <Image src={hit.icon_url} alt="" width={48} height={48} className="object-cover" unoptimized={unoptimized} />
            ) : (
              <ExtensionIcon color="action" />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', lineHeight: 1.2, mb: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {hit.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              by {hit.author}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {hit.categories && hit.categories.length > 0 && (
                <Chip size="small" label={categoryLabel(hit.categories[0])} sx={{ borderRadius: 1, fontSize: '0.65rem', height: 20 }} />
              )}
            </Box>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1, fontSize: '0.8rem' }}>
          {hit.description}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 'auto', pt: 1, borderTop: '1px solid var(--mui-palette-divider)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            <DownloadIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption">{formatDownloads(hit.downloads)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            <UpdateIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption">{formatDate(hit.date_modified)}</Typography>
          </Box>
        </Box>
      </Box>
      <Box sx={{ p: 1, borderTop: '1px solid var(--mui-palette-divider)', bgcolor: isAdded ? 'success.main' : 'transparent', color: isAdded ? 'success.contrastText' : 'inherit', transition: 'background-color 0.2s' }}>
        <Button 
          fullWidth 
          variant={isAdded ? 'text' : 'contained'} 
          color={isAdded ? 'inherit' : 'primary'}
          onClick={handleToggle} 
          disabled={isPending}
          startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : (isAdded ? <DeleteIcon /> : <AddIcon />)}
          sx={{ borderRadius: 3, fontWeight: 'bold', py: 1, color: isAdded ? 'inherit' : undefined }}
        >
          {isPending ? '処理中' : (isAdded ? '削除' : '追加')}
        </Button>
      </Box>
    </Card>
  );
};

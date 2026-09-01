'use client';

// -----------------------------------------------------------------------------
// Header (モバイル専用) - M3E 移行版
//
// - モバイル (< md): ロゴ + テーマ切替 + 各種ボタン + プロファイル切替
// - PC (md 以上): 非表示。ナビ・プロファイル・アクションは DesktopSidebar に集約
// -----------------------------------------------------------------------------

import type React from 'react';
import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Badge from '@mui/material/Badge';
import type { Profile, TabName } from '@/types';
import { SyncButton } from '@/features/sync';
import { useFolderLinked } from '@/features/sync';
import { CustomDropdown } from '../ui/CustomDropdown';
import { useTheme } from '@mui/material/styles';
import { useColorScheme } from '@mui/material/styles';

// Material Icons
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import ShieldIcon from '@mui/icons-material/Shield';
import DownloadIcon from '@mui/icons-material/Download';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import AddIcon from '@mui/icons-material/Add';

interface HeaderProps {
  theme?: string; // M3E-3: We no longer need manually passed theme. We use useColorScheme
  onToggleTheme?: () => void;
  profiles: Profile[];
  currentProfileId: string;
  onSwitchProfile: (id: string) => void;
  onOpenNewProfileModal: () => void;
  onRunDependencyCheck: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSwitchTab: (tab: TabName) => void;
  hasDepWarning: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  profiles = [],
  currentProfileId,
  onSwitchProfile,
  onOpenNewProfileModal,
  onRunDependencyCheck,
  onDownloadZip,
  onImportZip,
  onSwitchTab,
  hasDepWarning,
}) => {
  const folderLinked = useFolderLinked();
  const muiTheme = useTheme();
  const { mode, setMode } = useColorScheme();

  const handleToggleTheme = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const profileOptions = useMemo(() => {
    const safeProfiles = Array.isArray(profiles) ? profiles : [];
    return safeProfiles.map((p) => ({ label: p.name || '名称未設定', value: p.id }));
  }, [profiles]);

  const handleFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (typeof onImportZip === 'function') {
        onImportZip(e);
      }
    },
    [onImportZip]
  );

  return (
    <AppBar 
      position="sticky" 
      elevation={0}
      sx={{ 
        display: { xs: 'block', md: 'none' },
        bgcolor: 'background.paper',
        borderBottom: '1px solid var(--mui-palette-divider)',
        color: 'text.primary',
      }}
    >
      <Box sx={{ px: 2, py: 1.5 }}>
        {/* Top Row: Logo & Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Box
            component={Link}
            href="/"
            onClick={() => onSwitchTab('home')}
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, textDecoration: 'none', color: 'inherit' }}
          >
            <Box sx={{ width: 36, height: 36, borderRadius: '12px', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>D</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', lineHeight: 1 }}>DropMod</Typography>
              <Typography variant="caption" color="text.secondary">Profile Manager</Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <IconButton onClick={handleToggleTheme} color="primary" size="small">
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>

            {/* Mobile Actions (<sm) */}
            <Box sx={{ display: { xs: 'flex', sm: 'none' }, gap: 0.5 }}>
              <IconButton onClick={onRunDependencyCheck} size="small" sx={{ color: 'warning.main', bgcolor: 'warning.main', opacity: 0.8, '&:hover': { opacity: 1 } }}>
                <Badge color="error" variant="dot" invisible={!hasDepWarning}>
                  <ShieldIcon fontSize="small" sx={{ color: muiTheme.palette.warning.dark }} />
                </Badge>
              </IconButton>

              {folderLinked ? (
                <Box sx={{ transform: 'scale(0.8)', transformOrigin: 'center' }}>
                  <SyncButton variant="icon" label="同期" />
                </Box>
              ) : (
                <IconButton onClick={onDownloadZip} size="small" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              )}

              <IconButton component="label" size="small" sx={{ bgcolor: 'action.selected' }}>
                <FileUploadIcon fontSize="small" color="primary" />
                <input type="file" accept=".zip,.mrpack,application/zip" hidden onChange={handleFileImport} />
              </IconButton>
            </Box>
          </Box>
        </Box>

        {/* Bottom Row: Profile Dropdown & Tablet Actions */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', bgcolor: 'action.hover', borderRadius: '12px', p: 0.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <CustomDropdown
                options={profileOptions}
                selectedValue={currentProfileId}
                onChange={onSwitchProfile}
                label="プロファイル"
              />
            </Box>
            <IconButton onClick={onOpenNewProfileModal} size="small" color="primary">
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Tablet Actions (>=sm && <md) */}
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
            <Button
              variant="outlined"
              color="warning"
              size="small"
              onClick={onRunDependencyCheck}
              startIcon={
                <Badge color="error" variant="dot" invisible={!hasDepWarning}>
                  <ShieldIcon />
                </Badge>
              }
              sx={{ borderRadius: '12px' }}
            >
              依存チェック
            </Button>

            {folderLinked ? (
              <SyncButton variant="primary" label="フォルダへ同期" />
            ) : (
              <Button
                variant="contained"
                size="small"
                onClick={onDownloadZip}
                startIcon={<DownloadIcon />}
                sx={{ borderRadius: '12px' }}
              >
                ZIP保存
              </Button>
            )}

            <Button
              component="label"
              variant="outlined"
              size="small"
              startIcon={<FileUploadIcon />}
              sx={{ borderRadius: '12px' }}
            >
              ZIP読込
              <input type="file" accept=".zip,.mrpack,application/zip" hidden onChange={handleFileImport} />
            </Button>
          </Box>
        </Box>
      </Box>
    </AppBar>
  );
};

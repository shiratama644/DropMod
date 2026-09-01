'use client';
import type React from 'react';
import Link from 'next/link';
import Paper from '@mui/material/Paper';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import MenuIcon from '@mui/icons-material/Menu';
import { useUiState } from './uiState';
import type { TabName } from '@/types';
import { useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import SettingsIcon from '@mui/icons-material/Settings';

interface Props {
  activeTab: TabName;
  onSwitchTab: (tab: TabName) => void;
  // TODO: future M3E-4 implementation
  modCount?: number;
  hasDepWarning?: boolean;
  theme?: string;
  onToggleTheme?: () => void;
  onDownloadZip?: () => void;
  onImportZip?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const BottomNav: React.FC<Props> = ({
  activeTab,
  onSwitchTab,
}) => {
  const openModalCount = useUiState((s) => s.openModalCount);
  const isHidden = openModalCount > 0;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleTabClick = (tab: TabName) => {
    if (activeTab === tab) onSwitchTab(tab);
  };

  return (
    <>
      <Paper
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: { xs: 'block', md: 'none' },
          zIndex: 60,
          transform: isHidden ? 'translateY(100%)' : 'translateY(0)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          pb: 'env(safe-area-inset-bottom)',
          borderTop: '1px solid var(--mui-palette-divider)',
        }}
        elevation={0}
      >
        <BottomNavigation showLabels value={activeTab === 'settings' ? 'menu' : activeTab}>
          <BottomNavigationAction
            component={Link}
            href="/"
            onClick={() => handleTabClick('home')}
            label="ホーム"
            value="home"
            icon={<HomeIcon />}
          />
          <BottomNavigationAction
            component={Link}
            href="/discover/mods"
            onClick={() => handleTabClick('mods')}
            label="探す"
            value="mods"
            icon={<SearchIcon />}
          />
          <BottomNavigationAction
            component={Link}
            href="/profile"
            onClick={() => handleTabClick('profile')}
            label="プロファイル"
            value="profile"
            icon={<PersonIcon />}
          />
          <BottomNavigationAction
            onClick={() => setIsMenuOpen(true)}
            label="メニュー"
            value="menu"
            icon={<MenuIcon />}
          />
        </BottomNavigation>
      </Paper>

      <BottomSheet
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        ariaLabel="メニュー"
        zIndexClass="z-[70]"
      >
        <Box sx={{ pt: 2 }}>
          <List>
            <ListItem disablePadding>
              <ListItemButton component={Link} href="/settings" onClick={() => setIsMenuOpen(false)}>
                <ListItemIcon><SettingsIcon /></ListItemIcon>
                <ListItemText primary="設定" />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </BottomSheet>
    </>
  );
};

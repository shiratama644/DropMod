'use client';
import type React from 'react';
import Link from 'next/link';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';

import type { TabName, Profile } from '@/types';
import { usePathname } from 'next/navigation';

interface Props {
  activeTab: TabName;
  onSwitchTab: (tab: TabName) => void;
  // TODO: feature implementation
  modCount?: number;
  hasDepWarning?: boolean;
  theme?: string;
  onToggleTheme?: () => void;
  profiles?: Profile[];
  currentProfileId?: string;
  onSwitchProfile?: (id: string) => void;
  onOpenNewProfileModal?: () => void;
  onRunDependencyCheck?: () => void;
  onDownloadZip?: () => void;
  onImportZip?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const DesktopSidebar: React.FC<Props> = ({
  activeTab,
  onSwitchTab,
}) => {
  const _pathname = usePathname();

  const handleTabClick = (tab: TabName) => {
    if (activeTab === tab) {
      onSwitchTab(tab);
    }
  };

  const navItems = [
    { name: 'home' as TabName, path: '/', label: 'ホーム', icon: <HomeIcon /> },
    { name: 'mods' as TabName, path: '/discover/mods', label: 'Mod を探す', icon: <SearchIcon /> },
    { name: 'profile' as TabName, path: '/profile', label: 'マイプロファイル', icon: <PersonIcon /> },
    { name: 'settings' as TabName, path: '/settings', label: '設定', icon: <SettingsIcon /> },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', md: 'block' },
        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 256, borderWidth: 0, borderRight: '1px solid var(--mui-palette-divider)', backgroundColor: 'var(--mui-palette-background-paper)' },
      }}
      open
    >
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.contrastText' }}>
          {/* Logo placeholder */}
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>D</Typography>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 'bold', letterSpacing: 1 }}>DropMod</Typography>
      </Box>

      <List sx={{ px: 2, flex: 1 }}>
        {navItems.map((item) => {
          const isActive = activeTab === item.name;
          return (
            <ListItem key={item.name} disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                component={Link}
                href={item.path}
                onClick={() => handleTabClick(item.name)}
                sx={{
                  borderRadius: '16px', // M3E shape
                  bgcolor: isActive ? 'primary.main' : 'transparent',
                  color: isActive ? 'primary.contrastText' : 'text.primary',
                  '&:hover': {
                    bgcolor: isActive ? 'primary.dark' : 'action.hover',
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.label} 
                  sx={{ '& .MuiListItemText-primary': { fontWeight: isActive ? 700 : 500 } }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Drawer>
  );
};

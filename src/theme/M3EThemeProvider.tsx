'use client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useThemeStore } from '@/components/layout/themeStore';
import { createDynamicM3ETheme } from './createDynamicM3ETheme';
import { useMemo, useEffect, useState } from 'react';
import m3eTheme from './m3eTheme'; // fallback static theme

export default function M3EThemeProvider({ children }: { children: React.ReactNode }) {
  const keyColor = useThemeStore((state) => state.keyColor);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = useMemo(() => {
    // Hydration mismatch を防ぐため、SSR 時はデフォルトの静的テーマを返す。
    // クライアントでマウントされた後に、Zustand から復元した色で動的テーマを生成する。
    if (!mounted) return m3eTheme;
    return createDynamicM3ETheme(keyColor);
  }, [keyColor, mounted]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}

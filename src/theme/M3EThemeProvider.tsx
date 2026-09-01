'use client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import m3eTheme from './m3eTheme';

export default function M3EThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={m3eTheme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}

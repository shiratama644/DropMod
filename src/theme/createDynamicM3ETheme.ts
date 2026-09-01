'use client';
import { createTheme, type Theme } from '@mui/material/styles';
import { argbFromHex, themeFromSourceColor, hexFromArgb } from '@material/material-color-utilities';

/**
 * ユーザー指定のキーカラーから、Material 3 Expressive 用の動的テーマを生成する。
 * @material/material-color-utilities を用いて正しい Tonal Palette を計算する。
 */
export function createDynamicM3ETheme(keyColorHex: string): Theme {
  // 1. 指定された Hex カラーから M3 の完全なテーマ (Tonal Palettes 含む) を生成
  const m3Theme = themeFromSourceColor(argbFromHex(keyColorHex));
  
  // 2. Light / Dark のパレットから必要な色を Hex で取り出す
  const pLight = m3Theme.schemes.light;
  const pDark = m3Theme.schemes.dark;

  return createTheme({
    cssVariables: {
      colorSchemeSelector: 'class', // InitColorSchemeScript に追従
    },
    colorSchemes: {
      light: {
        palette: {
          primary: {
            main: hexFromArgb(pLight.primary),
            contrastText: hexFromArgb(pLight.onPrimary),
          },
          secondary: {
            main: hexFromArgb(pLight.secondary),
            contrastText: hexFromArgb(pLight.onSecondary),
          },
          error: {
            main: hexFromArgb(pLight.error),
            contrastText: hexFromArgb(pLight.onError),
          },
          background: {
            default: hexFromArgb(pLight.background),
            paper: hexFromArgb(pLight.surface),
          },
          text: {
            primary: hexFromArgb(pLight.onSurface),
            secondary: hexFromArgb(pLight.onSurfaceVariant),
          },
          divider: hexFromArgb(pLight.outlineVariant),
        },
      },
      dark: {
        palette: {
          primary: {
            main: hexFromArgb(pDark.primary),
            contrastText: hexFromArgb(pDark.onPrimary),
          },
          secondary: {
            main: hexFromArgb(pDark.secondary),
            contrastText: hexFromArgb(pDark.onSecondary),
          },
          error: {
            main: hexFromArgb(pDark.error),
            contrastText: hexFromArgb(pDark.onError),
          },
          background: {
            default: hexFromArgb(pDark.background),
            paper: hexFromArgb(pDark.surface),
          },
          text: {
            primary: hexFromArgb(pDark.onSurface),
            secondary: hexFromArgb(pDark.onSurfaceVariant),
          },
          divider: hexFromArgb(pDark.outlineVariant),
        },
      },
    },
    typography: {
      fontFamily: 'var(--font-roboto-flex), "Inter", sans-serif',
      h1: { fontWeight: 800 },
      h2: { fontWeight: 700 },
      h3: { fontWeight: 700 },
      button: {
        textTransform: 'none', // M3E では uppercase にしない
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 24, // M3E の大胆なシェイプ
    },
    components: {
      MuiButtonBase: {
        defaultProps: {
          disableRipple: false,
        },
        styleOverrides: {
          root: {
            transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)', // M3E Spring の代用
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: '20px',
            padding: '10px 24px',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: '24px',
            boxShadow: 'none', // 影ではなくSurfaceの階層で表現
            border: '1px solid var(--mui-palette-divider)',
          },
        },
      },
    },
  });
}

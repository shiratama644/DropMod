'use client';
import { createTheme } from '@mui/material/styles';

const m3eTheme = createTheme({
  cssVariables: true, // required for Next.js App Router InitColorSchemeScript
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#059669', // Emerald 600, boosting chroma for M3E
        },
        secondary: {
          main: '#3b82f6', // Blue 500
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#34d399', // Emerald 400
        },
        secondary: {
          main: '#60a5fa', // Blue 400
        },
        background: {
          default: '#0f172a', // Slate 900
          paper: '#1e293b',   // Slate 800
        },
      },
    },
  },
  typography: {
    fontFamily: 'var(--font-roboto-flex), "Inter", sans-serif',
    h1: {
      fontWeight: 800,
    },
    h2: {
      fontWeight: 700,
    },
    h3: {
      fontWeight: 700,
    },
  },
  shape: {
    borderRadius: 16, // M3E prefers bolder, larger radii
  },
});

export default m3eTheme;

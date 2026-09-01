'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  /** ユーザーが選択したキーカラー (Hex 形式)。デフォルトは Emerald-600 */
  keyColor: string;
  setKeyColor: (color: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      keyColor: '#059669', // Default: Emerald 600
      setKeyColor: (color) => set({ keyColor: color }),
    }),
    {
      name: 'dropmod-theme-storage',
    }
  )
);

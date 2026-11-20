import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'oled' | 'dark' | 'light';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceSubtle: string;
  card: string;
  cardActive: string;
  border: string;
  borderHighlight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentGlow: string;
  accentSubtle: string;
  touchpadSurface: string;
  touchpadBorder: string;
  touchpadBorderActive: string;
  touchpadGlow: string;
  keyBackground: string;
  keySpecial: string;
  keyPressed: string;
  keyBorder: string;
  keyText: string;
  keyTextSpecial: string;
  keyboardChassis: string;
  keyboardToolbar: string;
  keyboardToolbarBorder: string;
  modifierActiveBg: string;
  modifierActiveText: string;
  bottomNavBg: string;
  bottomNavBorder: string;
  success: string;
  warning: string;
  error: string;
}

export const OLED_THEME: ThemeColors = {
  background: '#000000',
  surface: '#080808',
  surfaceSubtle: '#121212',
  card: '#0d0d0d',
  cardActive: '#1a1a1a',
  border: '#1f1f1f',
  borderHighlight: '#06b6d4',
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  accent: '#06b6d4',
  accentGlow: 'rgba(6, 182, 212, 0.25)',
  accentSubtle: 'rgba(6, 182, 212, 0.12)',
  touchpadSurface: '#050505',
  touchpadBorder: '#1c1c1c',
  touchpadBorderActive: '#06b6d4',
  touchpadGlow: 'rgba(6, 182, 212, 0.18)',
  keyBackground: '#121212',
  keySpecial: '#1e1e1e',
  keyPressed: '#27272a',
  keyBorder: '#222222',
  keyText: '#f4f4f5',
  keyTextSpecial: '#e4e4e7',
  keyboardChassis: '#050505',
  keyboardToolbar: '#0a0a0a',
  keyboardToolbarBorder: '#1a1a1a',
  modifierActiveBg: '#06b6d4',
  modifierActiveText: '#000000',
  bottomNavBg: '#000000',
  bottomNavBorder: '#18181b',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444'
};

export const DARK_THEME: ThemeColors = {
  background: '#0b0f19',
  surface: '#111827',
  surfaceSubtle: '#1f2937',
  card: '#161e2e',
  cardActive: '#222f46',
  border: '#1f2937',
  borderHighlight: '#38bdf8',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#38bdf8',
  accentGlow: 'rgba(56, 189, 248, 0.25)',
  accentSubtle: 'rgba(56, 189, 248, 0.12)',
  touchpadSurface: '#111827',
  touchpadBorder: '#1f2937',
  touchpadBorderActive: '#38bdf8',
  touchpadGlow: 'rgba(56, 189, 248, 0.18)',
  keyBackground: '#161e2e',
  keySpecial: '#222938',
  keyPressed: '#334155',
  keyBorder: '#283548',
  keyText: '#f8fafc',
  keyTextSpecial: '#e2e8f0',
  keyboardChassis: '#121826',
  keyboardToolbar: '#1a2234',
  keyboardToolbarBorder: '#233047',
  modifierActiveBg: '#38bdf8',
  modifierActiveText: '#0f172a',
  bottomNavBg: '#111827',
  bottomNavBorder: '#1f2937',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444'
};

export const LIGHT_THEME: ThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9',
  card: '#ffffff',
  cardActive: '#f1f5f9',
  border: '#e2e8f0',
  borderHighlight: '#06b6d4',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  accent: '#06b6d4',
  accentGlow: 'rgba(6, 182, 212, 0.2)',
  accentSubtle: 'rgba(6, 182, 212, 0.1)',
  touchpadSurface: '#ffffff',
  touchpadBorder: '#e2e8f0',
  touchpadBorderActive: '#06b6d4',
  touchpadGlow: 'rgba(6, 182, 212, 0.18)',
  keyBackground: '#ffffff',
  keySpecial: '#f1f5f9',
  keyPressed: '#e2e8f0',
  keyBorder: '#e2e8f0',
  keyText: '#0f172a',
  keyTextSpecial: '#334155',
  keyboardChassis: '#f1f5f9',
  keyboardToolbar: '#ffffff',
  keyboardToolbarBorder: '#e2e8f0',
  modifierActiveBg: '#06b6d4',
  modifierActiveText: '#ffffff',
  bottomNavBg: '#ffffff',
  bottomNavBorder: '#e2e8f0',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444'
};

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const THEME_STORAGE_KEY = '@pocketinput_theme_mode';

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  colors: LIGHT_THEME,
  setMode: () => {},
  toggleTheme: () => {},
  isDark: false
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(saved => {
      if (saved === 'oled' || saved === 'dark' || saved === 'light') {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, newMode).catch(console.warn);
  };

  const toggleTheme = () => {
    const nextMode: ThemeMode = mode === 'light' ? 'oled' : 'light';
    setMode(nextMode);
  };

  const colors = mode === 'oled' ? OLED_THEME : mode === 'dark' ? DARK_THEME : LIGHT_THEME;
  const isDark = mode !== 'light';

  return (
    <ThemeContext.Provider value={{ mode, colors, setMode, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

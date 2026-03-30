// Design tokens — single source of truth for all colors, typography, and layout constants.
// All components import from here instead of hardcoding values.

export const colors = {
  // Brand
  primary: '#ffe600',         // yellow — buttons, nav pill, active states
  dark: '#1a1a2e',            // dark navy — capture bg, primary text

  // Backgrounds
  bgLight: '#fafafa',         // learn page background
  bgCard: '#fff',             // card surfaces, example cards
  bgSection: '#f5f5f5',       // settings section backgrounds
  bgInputDark: 'rgba(255,255,255,0.08)',  // capture page input background

  // Text
  textPrimary: '#1a1a2e',
  textSecondary: '#5f6368',
  textMuted: '#888',
  textLight: '#bbb',
  textOnDark: '#fff',
  textOnDarkMuted: 'rgba(255,255,255,0.5)',
  textOnDarkFaint: 'rgba(255,255,255,0.3)',

  // Borders
  border: '#e8e8e8',
  borderDark: 'rgba(0,0,0,0.1)',
  borderLight: 'rgba(255,255,255,0.15)',

  // Semantic
  pitchAccent: '#ff3366',     // pitch accent dots and lines
  success: '#d1fae5',
  successText: '#166534',
  danger: '#fee2e2',
  dangerText: '#991b1b',
  error: '#E24B4A',
  link: '#1a73e8',

  // Frequency tags
  tagCommon: '#e8f5e9',
  tagCommonText: '#2e7d32',
  tagUncommon: '#fff3e0',
  tagUncommonText: '#e65100',
  tagRare: '#fce4ec',
  tagRareText: '#880e4f',
};

// JLPT level badge colors — used in DefineTab, HistoryPage, JlptBadge
export const jlptColors = {
  N5: '#4ade80',
  N4: '#a3e635',
  N3: '#f59e0b',
  N2: '#f472b6',
  N1: '#ef4444',
};

export const typography = {
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  serifFamily: "'Noto Serif JP', serif",
};

export const layout = {
  maxWidth: '430px',
  navHeight: '68px',
};

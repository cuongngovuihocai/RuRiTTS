import { ThemeMode } from '../types';

export interface ThemeConfig {
  id: ThemeMode;
  name: string;
  badge: string;
  isLight: boolean;
  // CSS Classes
  canvas: string;
  card: string;
  cardInner: string;
  cardSubtle: string;
  border: string;
  borderHighlight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentText: string;
  accentBorder: string;
  inputBg: string;
  inputText: string;
  inputBorder: string;
  // Raw Hex colors for canvas and CSS vars
  hex: {
    canvas: string;
    card: string;
    cardInner: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
  };
}

export const THEME_CONFIGS: Record<ThemeMode, ThemeConfig> = {
  'dark-stone': {
    id: 'dark-stone',
    name: 'Tối Trầm (Warm Stone)',
    badge: '🌑 Tối Đá Trầm',
    isLight: false,
    canvas: 'bg-[#0C0A09] text-[#F5F5F4]',
    card: 'bg-[#1C1917] border-[#44403C] text-[#F5F5F4]',
    cardInner: 'bg-[#292524] border-[#44403C] text-[#F5F5F4]',
    cardSubtle: 'bg-[#211E1B]',
    border: 'border-[#44403C]',
    borderHighlight: 'border-[#F59E0B]',
    textPrimary: 'text-[#F5F5F4]',
    textSecondary: 'text-[#A8A29E]',
    textMuted: 'text-[#78716C]',
    accent: 'bg-[#F59E0B]',
    accentHover: 'hover:bg-[#D97706]',
    accentText: 'text-[#0C0A09] font-bold',
    accentBorder: 'border-[#F59E0B]',
    inputBg: 'bg-[#292524]',
    inputText: 'text-[#F5F5F4]',
    inputBorder: 'border-[#44403C] focus:border-[#F59E0B]',
    hex: {
      canvas: '#0C0A09',
      card: '#1C1917',
      cardInner: '#292524',
      border: '#44403C',
      textPrimary: '#F5F5F4',
      textSecondary: '#A8A29E',
      accent: '#F59E0B',
    },
  },

  'cream-paper': {
    id: 'cream-paper',
    name: 'Giấy Sách Dịu Mắt (Cream Paper Light)',
    badge: '☀️ Giấy Sáng Sách In',
    isLight: true,
    canvas: 'bg-[#F7F4EA] text-[#1F2937]',
    card: 'bg-[#FFFFFF] border-[#DDD5C5] text-[#1F2937] shadow-lg shadow-amber-950/5',
    cardInner: 'bg-[#F2ECE0] border-[#D5CABE] text-[#1F2937]',
    cardSubtle: 'bg-[#FAF6EE]',
    border: 'border-[#DDD5C5]',
    borderHighlight: 'border-[#B45309]',
    textPrimary: 'text-[#1C1917]',
    textSecondary: 'text-[#57534E]',
    textMuted: 'text-[#78716C]',
    accent: 'bg-[#B45309]',
    accentHover: 'hover:bg-[#92400E]',
    accentText: 'text-white font-bold',
    accentBorder: 'border-[#B45309]',
    inputBg: 'bg-[#FAF7F0]',
    inputText: 'text-[#1C1917]',
    inputBorder: 'border-[#D5CABE] focus:border-[#B45309]',
    hex: {
      canvas: '#F7F4EA',
      card: '#FFFFFF',
      cardInner: '#F2ECE0',
      border: '#DDD5C5',
      textPrimary: '#1C1917',
      textSecondary: '#57534E',
      accent: '#B45309',
    },
  },

  'emerald': {
    id: 'emerald',
    name: 'Lục Bảo (Emerald Nature)',
    badge: '🟢 Lục Bảo Đêm',
    isLight: false,
    canvas: 'bg-[#04140F] text-[#ECFDF5]',
    card: 'bg-[#082019] border-[#134E3A] text-[#ECFDF5]',
    cardInner: 'bg-[#0D2D24] border-[#165E46] text-[#ECFDF5]',
    cardSubtle: 'bg-[#0A261E]',
    border: 'border-[#134E3A]',
    borderHighlight: 'border-[#10B981]',
    textPrimary: 'text-[#ECFDF5]',
    textSecondary: 'text-[#6EE7B7]',
    textMuted: 'text-[#34D399]/70',
    accent: 'bg-[#10B981]',
    accentHover: 'hover:bg-[#059669]',
    accentText: 'text-[#022c22] font-black',
    accentBorder: 'border-[#10B981]',
    inputBg: 'bg-[#0D2D24]',
    inputText: 'text-[#ECFDF5]',
    inputBorder: 'border-[#165E46] focus:border-[#10B981]',
    hex: {
      canvas: '#04140F',
      card: '#082019',
      cardInner: '#0D2D24',
      border: '#134E3A',
      textPrimary: '#ECFDF5',
      textSecondary: '#6EE7B7',
      accent: '#10B981',
    },
  },

  'navy': {
    id: 'navy',
    name: 'Biển Đêm (Deep Ocean Navy)',
    badge: '🔵 Biển Đêm Navy',
    isLight: false,
    canvas: 'bg-[#050C1A] text-[#F0FDF4]',
    card: 'bg-[#0B172E] border-[#1E3A8A]/70 text-[#E0E7FF]',
    cardInner: 'bg-[#132244] border-[#254A9E] text-[#E0E7FF]',
    cardSubtle: 'bg-[#0E1E3D]',
    border: 'border-[#1E3A8A]',
    borderHighlight: 'border-[#38BDF8]',
    textPrimary: 'text-[#F8FAFC]',
    textSecondary: 'text-[#93C5FD]',
    textMuted: 'text-[#60A5FA]',
    accent: 'bg-[#38BDF8]',
    accentHover: 'hover:bg-[#0EA5E9]',
    accentText: 'text-[#031525] font-black',
    accentBorder: 'border-[#38BDF8]',
    inputBg: 'bg-[#132244]',
    inputText: 'text-[#F8FAFC]',
    inputBorder: 'border-[#254A9E] focus:border-[#38BDF8]',
    hex: {
      canvas: '#050C1A',
      card: '#0B172E',
      cardInner: '#132244',
      border: '#1E3A8A',
      textPrimary: '#F8FAFC',
      textSecondary: '#93C5FD',
      accent: '#38BDF8',
    },
  },
};

export const HIGHLIGHT_PRESETS = [
  { id: '#f59e0b', name: 'Vàng hổ phách', hex: '#f59e0b', ringClass: 'ring-amber-500' },
  { id: '#facc15', name: 'Vàng dạ quang', hex: '#facc15', ringClass: 'ring-yellow-400' },
  { id: '#10b981', name: 'Xanh lục bảo', hex: '#10b981', ringClass: 'ring-emerald-500' },
  { id: '#06b6d4', name: 'Xanh băng lơ', hex: '#06b6d4', ringClass: 'ring-cyan-500' },
  { id: '#a855f7', name: 'Tím thạch anh', hex: '#a855f7', ringClass: 'ring-purple-500' },
  { id: '#f43f5e', name: 'Hồng dạ quang', hex: '#f43f5e', ringClass: 'ring-rose-500' },
  { id: '#ffffff', name: 'Trắng tương phản', hex: '#ffffff', ringClass: 'ring-white' },
];

export function getThemeConfig(theme: ThemeMode): ThemeConfig {
  return THEME_CONFIGS[theme] || THEME_CONFIGS['dark-stone'];
}

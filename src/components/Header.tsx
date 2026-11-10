import React from 'react';
import {
  Volume2,
  BookA,
  BookOpen,
  Keyboard,
  Settings,
  FolderDown,
} from 'lucide-react';
import { ThemeMode, VoiceSettings } from '../types';
import { playSoundCue } from '../services/audioSynthesizer';
import { getThemeConfig } from '../utils/themeStyles';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  voiceSettings: VoiceSettings;
  setVoiceSettings: React.Dispatch<React.SetStateAction<VoiceSettings>>;
  isOffline?: boolean;
  setIsOffline?: (offline: boolean) => void;
  onOpenVoiceSettings: () => void;
  onOpenLibrary: () => void;
  onOpenDictionary: () => void;
  onOpenShortcuts: () => void;
  onOpenExporter: () => void;
  activeBookTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  setTheme,
  voiceSettings,
  setVoiceSettings,
  onOpenVoiceSettings,
  onOpenLibrary,
  onOpenDictionary,
  onOpenShortcuts,
  onOpenExporter,
  activeBookTitle,
}) => {
  const handleThemeChange = (newTheme: ThemeMode) => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    setTheme(newTheme);
  };

  const themeConfig = getThemeConfig(theme);
  const secondaryBtnClass = `flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${themeConfig.cardInner} ${themeConfig.border} transition-all active:scale-95 hover:opacity-90`;

  return (
    <header
      id="app-header"
      role="banner"
      aria-label="Thanh điều hướng chính"
      className={`border-b transition-colors px-4 py-2.5 sm:px-6 sticky top-0 z-30 backdrop-blur-md shadow-md flex flex-col gap-2.5 ${themeConfig.border} ${themeConfig.card}`}
    >
      {/* Row 1: Top Bar - Brand, Handwriting Slogan & Ham Chơi Education Logo */}
      <div className="w-full flex items-center justify-between gap-3">
        {/* Brand & Handwriting Slogan */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            id="app-logo-badge"
            className="flex items-center justify-center w-[50px] h-[50px] rounded-2xl overflow-hidden shadow-lg border border-amber-500/40 flex-shrink-0 bg-stone-900"
            aria-hidden="true"
          >
            <img
              src="pwa-192x192.png"
              alt="Logo RÙ RÌ TTS"
              className="w-[50px] h-[50px] object-cover rounded-2xl"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            <h1 className="flex items-baseline gap-1.5 select-none leading-none">
              <span
                style={{ fontFamily: "'Coiny', cursive, sans-serif" }}
                className={`text-2xl sm:text-3xl tracking-wide ${themeConfig.isLight ? 'text-amber-900' : 'text-current'}`}
              >
                RÙ RÌ
              </span>
              <sup
                style={{ fontFamily: "'Story Script', cursive" }}
                className={`text-base sm:text-lg font-bold tracking-normal relative -top-2 ml-0.5 ${
                  themeConfig.isLight ? 'text-amber-700' : 'text-amber-400'
                }`}
              >
                TTS
              </sup>
            </h1>
            <span
              style={{ fontFamily: "'Grape Nuts', cursive", marginTop: '-6px' }}
              className={`text-lg sm:text-xl font-semibold tracking-wide select-none leading-tight ${
                themeConfig.isLight ? 'text-amber-800' : 'text-amber-400/95'
              }`}
            >
              Đọc bằng Tai
            </span>
            {activeBookTitle && (
              <p className={`text-[11px] ${themeConfig.textSecondary} font-medium line-clamp-1 max-w-[180px] sm:max-w-xs mt-0.5`}>
                Đang đọc: {activeBookTitle}
              </p>
            )}
          </div>
        </div>

        {/* Right Corner: Ham Chơi Education Logo (Theme Responsive) */}
        <div className="flex items-center justify-end flex-shrink-0">
          <img
            key={themeConfig.isLight ? 'hamchoi-light' : 'hamchoi-dark'}
            src={themeConfig.isLight ? 'hamchoi-logo-light.png' : 'hamchoi-logo.png'}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = themeConfig.isLight
                ? 'https://lh3.googleusercontent.com/d/1yOLi510GeFZT7mihMrnhZRKXtel1C6-z'
                : 'https://lh3.googleusercontent.com/d/1q6B38HJxp8PEO5qmufm3HrJ0gBv8a2Z8';
            }}
            alt="Ham Chơi Education"
            className="h-9 sm:h-11 w-auto max-w-[130px] sm:max-w-[170px] object-contain drop-shadow-sm select-none"
            title="Ham Chơi Education"
            loading="eager"
          />
        </div>
      </div>

      {/* Row 2: Bottom Bar - Action Controls & Accessibility Toolbar (Centered) */}
      <div className={`w-full pt-2 border-t ${themeConfig.border} flex items-center justify-center flex-wrap gap-2 sm:gap-2.5`}>
        {/* In-App PWA Install Button */}
        <PWAInstallButton theme={theme} />

        {/* Voice & Tone Settings */}
        <button
          id="btn-open-voice-settings"
          type="button"
          onClick={() => {
            if (voiceSettings.enableSoundCues) playSoundCue('click');
            onOpenVoiceSettings();
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${themeConfig.cardInner} ${themeConfig.border} transition-all active:scale-95 hover:opacity-90 hover:border-amber-400/50`}
          aria-label="Cài đặt giọng đọc, giao diện"
          title="Tùy chỉnh giọng đọc & giao diện"
        >
          <Settings className="w-4 h-4 text-amber-400 stroke-[2.5]" />
          <span>Giọng đọc & Giao diện</span>
        </button>

        {/* Saved Library Button */}
        <button
          id="btn-open-library"
          type="button"
          onClick={() => {
            if (voiceSettings.enableSoundCues) playSoundCue('click');
            onOpenLibrary();
          }}
          className={secondaryBtnClass}
          aria-label="Mở thư viện sách nói đã lưu"
          title="Thư viện sách đã lưu"
        >
          <BookOpen className="w-4 h-4 opacity-80" />
          <span>Thư viện</span>
        </button>

        {/* Pronunciation Dictionary */}
        <button
          id="btn-open-dictionary"
          type="button"
          onClick={() => {
            if (voiceSettings.enableSoundCues) playSoundCue('click');
            onOpenDictionary();
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${themeConfig.cardInner} ${themeConfig.border} transition-all active:scale-95 hover:opacity-90`}
          aria-label="Từ điển phát âm viết tắt"
          title="Từ điển phát âm & viết tắt"
        >
          <BookA className="w-4 h-4" />
          <span className="hidden sm:inline">Từ điển</span>
        </button>

        {/* Export Audiobook */}
        <button
          id="btn-open-exporter"
          type="button"
          onClick={() => {
            if (voiceSettings.enableSoundCues) playSoundCue('click');
            onOpenExporter();
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${themeConfig.cardInner} ${themeConfig.borderHighlight} transition-all active:scale-95`}
          aria-label="Xuất file âm thanh sách nói"
          title="Xuất file âm thanh (MP3/WAV)"
        >
          <FolderDown className="w-4 h-4" />
          <span>Tạo AudioBook</span>
        </button>

        {/* Keyboard Shortcuts Help */}
        <button
          id="btn-open-shortcuts"
          type="button"
          onClick={() => {
            if (voiceSettings.enableSoundCues) playSoundCue('click');
            onOpenShortcuts();
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${themeConfig.cardInner} ${themeConfig.border} transition-all active:scale-95 hover:opacity-90`}
          aria-label="Xem danh sách phím tắt (Nhấn phím H hoặc ?)"
          title="Bảng phím tắt trợ năng (Phím H)"
        >
          <Keyboard className="w-4 h-4" />
          <span className="hidden sm:inline">Phím tắt</span>
        </button>
      </div>
    </header>
  );
};

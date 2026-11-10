import React, { useState } from 'react';
import { Download, Share, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ThemeMode } from '../types';
import { getThemeConfig } from '../utils/themeStyles';
import { playSoundCue } from '../services/audioSynthesizer';

interface PWAInstallButtonProps {
  theme: ThemeMode;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ theme }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const themeConfig = getThemeConfig(theme);

  // If already running inside standalone PWA mode, suppress button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="btn-install-pwa"
        type="button"
        onClick={() => {
          playSoundCue('click');
          install();
        }}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-md transition-all active:scale-95 animate-pulse hover:animate-none`}
        aria-label="Cài đặt ứng dụng RÙ RÌ TTS vào máy"
        title="Cài đặt ứng dụng về máy dùng như App di động"
      >
        <Download className="w-4 h-4 stroke-[2.5]" />
        <span className="hidden sm:inline">Cài đặt App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          id="btn-install-pwa-ios"
          type="button"
          onClick={() => {
            playSoundCue('click');
            setShowIOSGuide(true);
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${themeConfig.cardInner} ${themeConfig.border} transition-all active:scale-95 hover:opacity-90`}
          aria-label="Cài đặt trên iPhone/iPad"
          title="Thêm RÙ RÌ TTS vào màn hình chính"
        >
          <Smartphone className="w-4 h-4" />
          <span className="hidden sm:inline">Cài đặt App</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          >
            <div className={`w-full max-w-sm rounded-2xl ${themeConfig.card} ${themeConfig.border} border-2 p-6 shadow-2xl space-y-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg ${themeConfig.accent} ${themeConfig.accentText} flex items-center justify-center font-bold`}>
                    <Download className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <h3 id="ios-install-title" className={`text-base font-bold ${themeConfig.textPrimary}`}>
                    Cài đặt RÙ RÌ trên iOS
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className={`p-1.5 rounded-lg ${themeConfig.cardInner} text-stone-400 hover:text-white`}
                  aria-label="Đóng hướng dẫn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className={`text-xs ${themeConfig.textSecondary} space-y-3 leading-relaxed`}>
                <p>Để cài đặt ứng dụng sách nói <strong>RÙ RÌ TTS</strong> chạy toàn màn hình và offline:</p>
                <div className={`p-3 rounded-xl ${themeConfig.cardInner} border ${themeConfig.border} space-y-2`}>
                  <p className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">1</span>
                    <span>Bấm nút <strong>Chia sẻ (Share <Share className="w-3.5 h-3.5 inline mx-0.5" />)</strong> ở thanh dưới Safari.</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">2</span>
                    <span>Cuộn xuống chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} transition-all`}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Gauge,
  Timer,
  RotateCcw,
  Sparkles,
  Download,
  Loader2,
  Volume1,
} from 'lucide-react';
import { PlaybackState, VietnameseVoice, VoiceSettings, ThemeMode } from '../types';
import { playSoundCue, speakAnnouncement } from '../services/audioSynthesizer';
import { getThemeConfig } from '../utils/themeStyles';

export interface FallbackNoticeInfo {
  isFallback: boolean;
  fallbackVoiceName: string;
  fallbackReason?: string;
}

interface AudioPlayerBarProps {
  theme: ThemeMode;
  playbackState: PlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onNextSentence: () => void;
  onPrevSentence: () => void;
  currentSentenceText: string;
  sentenceIndex: number;
  totalSentences: number;
  chapterTitle: string;
  voiceSettings: VoiceSettings;
  setVoiceSettings: React.Dispatch<React.SetStateAction<VoiceSettings>>;
  activeVoiceName?: string;
  activeFallbackNotice?: FallbackNoticeInfo | null;
  onOpenVoiceSettings: () => void;
  onDownloadCurrentAudio: () => void;
  sleepTimerMinutes: number;
  setSleepTimerMinutes: (min: number) => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  theme,
  playbackState,
  onPlay,
  onPause,
  onNextSentence,
  onPrevSentence,
  currentSentenceText,
  sentenceIndex,
  totalSentences,
  chapterTitle,
  voiceSettings,
  setVoiceSettings,
  activeVoiceName = 'Giọng đọc chuẩn',
  activeFallbackNotice,
  onOpenVoiceSettings,
  onDownloadCurrentAudio,
  sleepTimerMinutes,
  setSleepTimerMinutes,
}) => {
  const themeConfig = getThemeConfig(theme);
  const hlColor = voiceSettings.highlightColor || themeConfig.hex.accent || '#f59e0b';
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const prevVolumeRef = useRef(voiceSettings.volume);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speedMenuRef = useRef<HTMLDivElement | null>(null);
  const sleepMenuRef = useRef<HTMLDivElement | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target as Node)) {
        setShowSleepMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Waveform canvas animation while playing
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isPlaying = playbackState === 'playing';

      ctx.lineWidth = 2;
      ctx.strokeStyle = isPlaying ? hlColor : themeConfig.hex.border;
      ctx.beginPath();

      const width = canvas.width;
      const height = canvas.height;
      const mid = height / 2;
      const points = 24;
      const step = width / points;

      for (let i = 0; i <= points; i++) {
        const x = i * step;
        const amp = isPlaying
          ? Math.sin(phase + i * 0.4) * (mid * 0.7) * (Math.sin(phase * 0.5 + i * 0.2) * 0.5 + 0.5)
          : Math.sin(i * 0.2) * 2;
        const y = mid + amp;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      if (isPlaying) {
        phase += 0.15;
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [playbackState, hlColor, themeConfig.hex.border]);

  // Speed Direct Select
  const handleSpeedSelect = (speed: number) => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    setVoiceSettings((prev) => ({ ...prev, rate: speed }));
    setShowSpeedMenu(false);

    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement(`Tốc độ đọc: ${speed} lần`, voiceSettings);
    }
  };

  const toggleMute = () => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    if (isMuted) {
      setVoiceSettings((prev) => ({ ...prev, volume: prevVolumeRef.current || 1.0 }));
      setIsMuted(false);
    } else {
      prevVolumeRef.current = voiceSettings.volume;
      setVoiceSettings((prev) => ({ ...prev, volume: 0 }));
      setIsMuted(true);
    }
  };

  const handleSleepTimerSelect = (mins: number) => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    setSleepTimerMinutes(mins);
    setShowSleepMenu(false);

    if (voiceSettings.enableSpokenGuide) {
      const msg =
        mins === 0
          ? 'Đã tắt hẹn giờ tắt'
          : mins === -1
          ? 'Hẹn giờ tắt sau khi đọc hết chương'
          : `Hẹn giờ tắt sau ${mins} phút`;
      speakAnnouncement(msg, voiceSettings);
    }
  };

  return (
    <aside
      id="audio-player-dock"
      role="region"
      aria-label="Bộ điều khiển âm thanh sách nói"
      className={`fixed bottom-0 inset-x-0 z-40 ${themeConfig.card} border-t-2 ${themeConfig.border} shadow-2xl backdrop-blur-xl transition-all`}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 sm:py-3.5">
        {/* Player Controls Grid */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Speed Popover Controller */}
          <div className="flex items-center gap-2">
            {/* Speed Controller Popover */}
            <div className="relative" ref={speedMenuRef}>
              <button
                id="btn-player-speed"
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-black border transition-all active:scale-95 ${
                  showSpeedMenu
                    ? `${themeConfig.accent} ${themeConfig.accentText} ${themeConfig.borderHighlight} shadow-md`
                    : `${themeConfig.cardInner} ${themeConfig.border}`
                }`}
                style={!showSpeedMenu ? { color: hlColor } : undefined}
                aria-label={`Tốc độ đọc hiện tại: ${voiceSettings.rate}x. Nhấn để mở danh sách chọn tốc độ.`}
                title="Chọn tốc độ đọc (0.75x - 2.0x)"
              >
                <Gauge className="w-4 h-4" />
                <span>{voiceSettings.rate}x</span>
              </button>

              {/* Speed Popover Dropdown */}
              {showSpeedMenu && (
                <div
                  className={`absolute bottom-full left-0 mb-2 w-44 p-2 rounded-2xl ${themeConfig.card} ${themeConfig.border} border shadow-2xl space-y-1 z-50 animate-in fade-in slide-in-from-bottom-2`}
                >
                  <div className={`px-2 py-1 text-[11px] font-bold ${themeConfig.textSecondary} uppercase tracking-wider flex items-center justify-between`}>
                    <span>Tốc độ đọc</span>
                    {voiceSettings.rate !== 1.0 && (
                      <button
                        type="button"
                        onClick={() => handleSpeedSelect(1.0)}
                        className="text-[10px] font-bold hover:underline"
                        style={{ color: hlColor }}
                      >
                        Về 1.0x
                      </button>
                    )}
                  </div>
                  {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => handleSpeedSelect(rate)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                        voiceSettings.rate === rate
                          ? `${themeConfig.accent} ${themeConfig.accentText} font-black`
                          : `${themeConfig.textPrimary} hover:opacity-80`
                      }`}
                    >
                      <span>{rate}x</span>
                      {rate === 1.0 && (
                        <span className="text-[10px] opacity-75 font-normal">Chuẩn</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center: Main Playback Transport Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Prev Sentence */}
            <button
              id="btn-player-prev-sentence"
              type="button"
              onClick={() => {
                if (voiceSettings.enableSoundCues) playSoundCue('click');
                onPrevSentence();
              }}
              disabled={sentenceIndex === 0}
              className={`p-2.5 sm:p-3 rounded-2xl ${themeConfig.cardInner} ${themeConfig.border} disabled:opacity-30 active:scale-90 transition-all hover:opacity-90`}
              aria-label="Lùi lại 1 câu (Phím Mũi Tên Trái)"
              title="Câu trước (←)"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            {/* Big Tactile Play / Pause Button */}
            <button
              id="btn-player-play-pause"
              type="button"
              onClick={() => {
                if (playbackState === 'playing') {
                  if (voiceSettings.enableSoundCues) playSoundCue('pause');
                  onPause();
                  if (voiceSettings.enableSpokenGuide) speakAnnouncement('Đã tạm dừng', voiceSettings);
                } else {
                  if (voiceSettings.enableSoundCues) playSoundCue('play');
                  onPlay();
                  if (voiceSettings.enableSpokenGuide) speakAnnouncement('Đang phát giọng đọc', voiceSettings);
                }
              }}
              disabled={playbackState === 'loading' || playbackState === 'synthesizing'}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} flex items-center justify-center shadow-xl active:scale-95 transition-all`}
              aria-label={
                playbackState === 'playing'
                  ? 'Tạm dừng đọc (Nhấn phím Phím Cách Space)'
                  : 'Bắt đầu phát giọng đọc (Nhấn phím Phím Cách Space)'
              }
              title="Phát / Tạm dừng (Space)"
            >
              {playbackState === 'loading' || playbackState === 'synthesizing' ? (
                <Loader2 className="w-7 h-7 animate-spin stroke-[2.5]" />
              ) : playbackState === 'playing' ? (
                <Pause className="w-7 h-7 fill-current stroke-[2.5]" />
              ) : (
                <Play className="w-7 h-7 fill-current stroke-[2.5] ml-1" />
              )}
            </button>

            {/* Next Sentence */}
            <button
              id="btn-player-next-sentence"
              type="button"
              onClick={() => {
                if (voiceSettings.enableSoundCues) playSoundCue('click');
                onNextSentence();
              }}
              disabled={sentenceIndex >= totalSentences - 1}
              className={`p-2.5 sm:p-3 rounded-2xl ${themeConfig.cardInner} ${themeConfig.border} disabled:opacity-30 active:scale-90 transition-all hover:opacity-90`}
              aria-label="Chuyển sang câu kế tiếp (Phím Mũi Tên Phải)"
              title="Câu kế tiếp (→)"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>

          {/* Right: Waveform & Utilities */}
          <div className="flex items-center gap-2">
            {/* Live Waveform Canvas */}
            <div
              className={`hidden md:block w-24 h-8 rounded-lg ${themeConfig.cardInner} ${themeConfig.border} border overflow-hidden`}
              aria-hidden="true"
            >
              <canvas ref={canvasRef} width={96} height={32} className="w-full h-full" />
            </div>

            {/* Sleep Timer Menu */}
            <div className="relative" ref={sleepMenuRef}>
              <button
                id="btn-player-sleep-timer"
                type="button"
                onClick={() => setShowSleepMenu(!showSleepMenu)}
                className={`p-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${
                  sleepTimerMinutes !== 0
                    ? `${themeConfig.accent} ${themeConfig.accentText} ${themeConfig.borderHighlight}`
                    : `${themeConfig.cardInner} ${themeConfig.border}`
                }`}
                title="Hẹn giờ tắt tự động"
                aria-label={`Hẹn giờ tắt: ${
                  sleepTimerMinutes === 0
                    ? 'Tắt'
                    : sleepTimerMinutes === -1
                    ? 'Hết chương'
                    : `${sleepTimerMinutes} phút`
                }`}
              >
                <Timer className="w-4 h-4" />
                {sleepTimerMinutes !== 0 && (
                  <span className="text-[10px] font-black">{sleepTimerMinutes === -1 ? 'Hết chap' : `${sleepTimerMinutes}m`}</span>
                )}
              </button>

              {/* Sleep Timer Dropdown */}
              {showSleepMenu && (
                <div className={`absolute bottom-full right-0 mb-2 w-48 p-2 rounded-2xl ${themeConfig.card} ${themeConfig.border} border shadow-2xl space-y-1 z-50 animate-in fade-in slide-in-from-bottom-2`}>
                  <div className={`px-2 py-1 text-[11px] font-bold ${themeConfig.textSecondary} uppercase tracking-wider flex items-center gap-1.5`}>
                    <Timer className="w-3.5 h-3.5" />
                    <span>Hẹn giờ tắt sách nói</span>
                  </div>
                  {[0, 15, 30, 45, 60, -1].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => handleSleepTimerSelect(min)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        sleepTimerMinutes === min
                          ? `${themeConfig.accent} ${themeConfig.accentText} font-black`
                          : `${themeConfig.textPrimary} hover:opacity-80`
                      }`}
                    >
                      {min === 0
                        ? 'Tắt hẹn giờ'
                        : min === -1
                        ? 'Đọc hết chương này'
                        : `${min} phút`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume / Mute Button */}
            <button
              id="btn-player-mute"
              type="button"
              onClick={toggleMute}
              className={`p-2 rounded-xl ${themeConfig.cardInner} ${themeConfig.border} active:scale-95 transition-all`}
              aria-label={isMuted ? 'Bật lại âm thanh' : 'Tắt tiếng'}
              title="Tắt/Bật âm lượng"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Download Chapter Audio */}
            <button
              id="btn-download-chapter-audio"
              type="button"
              onClick={() => {
                if (voiceSettings.enableSoundCues) playSoundCue('click');
                onDownloadCurrentAudio();
              }}
              className={`p-2 rounded-xl ${themeConfig.cardInner} ${themeConfig.borderHighlight} active:scale-95 transition-all`}
              style={{ color: hlColor }}
              title="Lưu file âm thanh chương hiện tại (.wav)"
              aria-label="Tải file âm thanh chương hiện tại"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

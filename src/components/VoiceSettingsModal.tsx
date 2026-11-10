import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Volume2,
  Sliders,
  Sparkles,
  Gauge,
  Music,
  Check,
  Play,
  Square,
  Loader2,
  RotateCcw,
  Bot,
  Laptop,
  Flame,
  Globe,
  Radio,
  Star,
  Compass,
  Mars,
  Venus,
} from 'lucide-react';
import { EmotionStyle, VietnameseVoice, VoiceSettings, ThemeMode } from '../types';
import {
  decodeAudioBase64,
  getEmotionAcoustics,
  getVoiceSamplePreviewText,
  pcmToAudioBuffer,
  playSoundCue,
  speakAnnouncement,
} from '../services/audioSynthesizer';
import {
  generateEdgeSpeech,
  generateGoogleTranslateSpeech,
  isStaticHosting,
} from '../services/geminiService';
import { getThemeConfig, HIGHLIGHT_PRESETS, THEME_CONFIGS } from '../utils/themeStyles';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  voices: VietnameseVoice[];
  voiceSettings: VoiceSettings;
  setVoiceSettings: React.Dispatch<React.SetStateAction<VoiceSettings>>;
  isOffline: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const EMOTION_PRESETS: { id: EmotionStyle; name: string; desc: string; icon: string }[] = [
  {
    id: 'natural',
    name: 'Tự nhiên & Chuẩn mực',
    desc: 'Phát âm chuẩn xác, rõ ràng, phù hợp mọi loại văn bản',
    icon: '✨',
  },
  {
    id: 'expressive',
    name: 'Truyền cảm xúc sâu lắng',
    desc: 'Biểu cảm tinh tế, giàu cảm xúc, nhấn nhá nhịp điệu',
    icon: '💖',
  },
  {
    id: 'storytelling',
    name: 'Trầm ấm kể chuyện',
    desc: 'Âm điệu du dương, dẫn dắt câu chuyện lôi cuốn',
    icon: '📖',
  },
  {
    id: 'dramatic',
    name: 'Kịch tính & Hồi hộp',
    desc: 'Nhấn mạnh sự căng thẳng, diễn cảm các phân đoạn cao trào',
    icon: '⚡',
  },
  {
    id: 'calm',
    name: 'Thanh thản & Dịu nhẹ',
    desc: 'Tiết tấu chậm rãi, thư thái, phù hợp sách thiền & tâm lý học',
    icon: '🍃',
  },
  {
    id: 'whisper',
    name: 'Thì thầm đêm khuya',
    desc: 'Âm lượng nhỏ nhẹ, ấm áp, thích hợp nghe trước khi đi ngủ',
    icon: '🌙',
  },
  {
    id: 'cheerful',
    name: 'Vui tươi & Phấn chấn',
    desc: 'Giọng điệu hồ hởi, tràn đầy năng lượng tích cực',
    icon: '🎉',
  },
];

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  voices,
  voiceSettings,
  setVoiceSettings,
  isOffline,
  theme,
  setTheme,
}) => {
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const themeConfig = getThemeConfig(theme as ThemeMode);
  const activeHighlight = voiceSettings.highlightColor || '#f59e0b';

  // Stop audio when modal closes or unmounts
  const stopCurrentPreview = () => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {}
      activeSourceRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPreviewingVoiceId(null);
    setLoadingVoiceId(null);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCurrentPreview();
    }
    return () => {
      stopCurrentPreview();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentVoice = voices.find((v) => v.id === voiceSettings.voiceId) || voices[0];

  const handleVoiceSelect = (voice: VietnameseVoice) => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    setVoiceSettings((prev) => ({
      ...prev,
      voiceId: voice.id,
      engine: voice.engine,
    }));
    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement(`Đã chọn: ${voice.name}`, voiceSettings);
    }
  };

  const handleEmotionSelect = (emotion: EmotionStyle) => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    setVoiceSettings((prev) => ({ ...prev, emotion }));
    if (voiceSettings.enableSpokenGuide) {
      const selected = EMOTION_PRESETS.find((e) => e.id === emotion);
      speakAnnouncement(`Phong cách cảm xúc: ${selected?.name || emotion}`, voiceSettings);
    }
  };

  // Preview voice sample for any specific voice card
  const handlePlayVoicePreview = async (targetVoice: VietnameseVoice, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // If already playing this voice, stop it
    if (previewingVoiceId === targetVoice.id) {
      stopCurrentPreview();
      return;
    }

    stopCurrentPreview();
    setLoadingVoiceId(targetVoice.id);
    if (voiceSettings.enableSoundCues) playSoundCue('click');

    const sampleText = getVoiceSamplePreviewText(targetVoice);
    const emotionAcoustics = getEmotionAcoustics(voiceSettings.emotion);
    const effectiveRate = Math.max(0.5, Math.min(3.0, voiceSettings.rate * emotionAcoustics.rateMultiplier));
    const effectivePitch = Math.max(0.5, Math.min(1.5, voiceSettings.pitch * emotionAcoustics.pitchMultiplier));
    const effectiveVolume = Math.max(0, Math.min(1.0, voiceSettings.volume * emotionAcoustics.volumeMultiplier));

    const playWithNative = () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(sampleText);
        utterance.lang = 'vi-VN';
        utterance.rate = effectiveRate;
        utterance.pitch = effectivePitch;
        utterance.volume = effectiveVolume;

        if (targetVoice.nativeVoice) {
          utterance.voice = targetVoice.nativeVoice;
        } else {
          const allNative = window.speechSynthesis.getVoices();
          const vi = allNative.find(
            (v) =>
              v.lang.toLowerCase().includes('vi') ||
              v.name.toLowerCase().includes('viet') ||
              (targetVoice.gender === 'male' && v.name.toLowerCase().includes('male'))
          );
          if (vi) utterance.voice = vi;
        }

        setLoadingVoiceId(null);
        setPreviewingVoiceId(targetVoice.id);

        utterance.onend = () => setPreviewingVoiceId(null);
        utterance.onerror = () => setPreviewingVoiceId(null);
        window.speechSynthesis.speak(utterance);
      } else {
        setLoadingVoiceId(null);
      }
    };

    try {
      if (!isStaticHosting() && targetVoice.engine === 'edge' && !isOffline) {
        try {
          const res = await generateEdgeSpeech(
            sampleText,
            targetVoice.id,
            effectiveRate,
            effectivePitch,
            effectiveVolume
          );
          let buffer = await decodeAudioBase64(res.audioBase64);

          if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContextClass();
          }
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
          }

          const source = audioContextRef.current.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContextRef.current.destination);
          activeSourceRef.current = source;
          setLoadingVoiceId(null);
          setPreviewingVoiceId(targetVoice.id);

          source.onended = () => {
            setPreviewingVoiceId(null);
            activeSourceRef.current = null;
          };
          source.start();
        } catch {
          playWithNative();
        }
      } else if (!isStaticHosting() && targetVoice.engine === 'google-translate' && !isOffline) {
        try {
          const res = await generateGoogleTranslateSpeech(sampleText, targetVoice.id);
          const buffer = await decodeAudioBase64(res.audioBase64);

          if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContextClass();
          }
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
          }

          const ctx = audioContextRef.current;
          const source = ctx.createBufferSource();
          source.buffer = buffer;

          const gainNode = ctx.createGain();
          gainNode.gain.value = effectiveVolume;

          source.playbackRate.value = effectiveRate;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
          activeSourceRef.current = source;
          setLoadingVoiceId(null);
          setPreviewingVoiceId(targetVoice.id);

          source.onended = () => {
            setPreviewingVoiceId(null);
            activeSourceRef.current = null;
          };
          source.start();
        } catch {
          playWithNative();
        }
      } else {
        playWithNative();
      }
    } catch (err) {
      console.warn('Preview fallback:', err);
      playWithNative();
    }
  };

  // Grouping voices into cards: Microsoft Edge (4 voices) & Google TTS & Device Voices
  const edgeVoices = voices.filter((v) => v.engine === 'edge');
  const googleVoices = voices.filter((v) => v.engine === 'google-translate');
  const nativeVoices = voices.filter((v) => v.engine === 'native');

  // Helper renderer for a single voice item: Tên giọng đọc, Biểu tượng Giới tính, Nút Nghe thử ở cùng 1 hàng
  const renderVoiceItem = (v: VietnameseVoice) => {
    const isSelected = voiceSettings.voiceId === v.id;
    const isPlayingThis = previewingVoiceId === v.id;
    const isLoadingThis = loadingVoiceId === v.id;

    return (
      <div
        key={v.id}
        onClick={() => handleVoiceSelect(v)}
        className={`px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 group relative ${
          isSelected
            ? 'border-amber-400 bg-amber-400/15 ring-1 ring-amber-400/50 font-bold shadow-sm'
            : `${themeConfig.cardInner} ${themeConfig.border} hover:border-amber-400/50 ${themeConfig.textPrimary}`
        }`}
      >
        {/* Tên giọng đọc + Biểu tượng Giới tính (ở cùng 1 hàng bên trái) */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-bold truncate">{v.name}</span>
          {v.gender && v.gender !== 'neutral' && (
            <span
              title={v.gender === 'female' ? 'Giọng Nữ' : 'Giọng Nam'}
              aria-label={v.gender === 'female' ? 'Giọng Nữ' : 'Giọng Nam'}
              className={`inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 transition-transform ${
                v.gender === 'female'
                  ? isSelected
                    ? 'bg-rose-500/25 text-rose-300 border border-rose-400/50'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : isSelected
                    ? 'bg-sky-500/25 text-sky-300 border border-sky-400/50'
                    : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
              }`}
            >
              {v.gender === 'female' ? (
                <Venus className="w-3.5 h-3.5 stroke-[2.8]" aria-hidden="true" />
              ) : (
                <Mars className="w-3.5 h-3.5 stroke-[2.8]" aria-hidden="true" />
              )}
            </span>
          )}
        </div>

        {/* Nút Nghe thử (ở cùng 1 hàng bên phải) */}
        <button
          type="button"
          onClick={(e) => handlePlayVoicePreview(v, e)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 flex-shrink-0 ${
            isPlayingThis
              ? 'bg-rose-500 text-white animate-pulse'
              : isSelected
              ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300 font-bold'
              : `${themeConfig.card} ${themeConfig.border} border text-current hover:border-amber-400`
          }`}
          aria-label={`Nghe thử ${v.name}`}
        >
          {isLoadingThis ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang tải...</span>
            </>
          ) : isPlayingThis ? (
            <>
              <Square className="w-3 h-3 fill-current" />
              <span>Dừng</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span>Nghe thử</span>
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className={`${themeConfig.card} border-2 ${themeConfig.border} rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ${themeConfig.textPrimary}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${themeConfig.border} ${themeConfig.cardInner}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${themeConfig.accent} ${themeConfig.accentText} flex items-center justify-center font-black shadow-md`}>
              <Sliders className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 id="voice-settings-title" className="text-lg sm:text-xl font-black" style={{ color: themeConfig.hex.accent }}>
                Chọn Giọng Đọc & Giao Diện
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl ${themeConfig.cardInner} hover:opacity-85 ${themeConfig.textSecondary} hover:${themeConfig.textPrimary} border ${themeConfig.border} transition-all`}
            aria-label="Đóng bảng tùy chỉnh"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section 1: Voice Picker */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider block`}>
                1. Chọn giọng đọc tiếng Việt
              </label>
              <span className="text-xs font-bold" style={{ color: themeConfig.hex.accent }}>
                Đang dùng: {currentVoice?.name}
              </span>
            </div>

            {/* Thẻ 1: Microsoft Edge */}
            {!isOffline && edgeVoices.length > 0 && (
              <div className={`space-y-3 p-4 rounded-2xl ${themeConfig.cardSubtle} border ${themeConfig.border}`}>
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-amber-400">
                  <Radio className="w-4 h-4 text-amber-400" />
                  <span>Microsoft Edge</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {edgeVoices.map(renderVoiceItem)}
                </div>
              </div>
            )}

            {/* Hàng 2 thẻ: Google TTS và Giọng Đọc Thiết Bị (Offline) trên cùng 1 hàng */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Thẻ Google TTS */}
              {!isOffline && googleVoices.length > 0 && (
                <div className={`space-y-3 p-4 rounded-2xl ${themeConfig.cardSubtle} border ${themeConfig.border} flex flex-col justify-between`}>
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-amber-400">
                    <Globe className="w-4 h-4 text-amber-400" />
                    <span>Google TTS</span>
                  </div>
                  <div className="space-y-2">
                    {googleVoices.map(renderVoiceItem)}
                  </div>
                </div>
              )}

              {/* Thẻ Giọng Đọc Thiết Bị (Offline) */}
              {nativeVoices.length > 0 && (
                <div className={`space-y-3 p-4 rounded-2xl ${themeConfig.cardSubtle} border ${themeConfig.border} flex flex-col justify-between`}>
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-400">
                    <Laptop className="w-4 h-4 text-emerald-400" />
                    <span>Giọng Đọc Thiết Bị (Offline)</span>
                  </div>
                  <div className="space-y-2">
                    {nativeVoices.map(renderVoiceItem)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Fine Tuning Controls */}
          <div className={`space-y-4 pt-2 border-t ${themeConfig.border}`}>
            <label className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider block`}>
              2. Điều chỉnh Tốc độ, Âm điệu & Âm lượng
            </label>

            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${themeConfig.cardInner} p-4 rounded-2xl border ${themeConfig.border}`}>
              {/* Speed */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className={themeConfig.textPrimary}>Tốc độ đọc:</span>
                  <span style={{ color: themeConfig.hex.accent }}>{voiceSettings.rate}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={voiceSettings.rate}
                  onChange={(e) =>
                    setVoiceSettings((prev) => ({ ...prev, rate: parseFloat(e.target.value) }))
                  }
                  className="w-full cursor-pointer"
                  style={{ accentColor: themeConfig.hex.accent }}
                />
              </div>

              {/* Pitch */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className={themeConfig.textPrimary}>Độ cao trầm (Pitch):</span>
                  <span style={{ color: themeConfig.hex.accent }}>{Math.round(voiceSettings.pitch * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={voiceSettings.pitch}
                  onChange={(e) =>
                    setVoiceSettings((prev) => ({ ...prev, pitch: parseFloat(e.target.value) }))
                  }
                  className="w-full cursor-pointer"
                  style={{ accentColor: themeConfig.hex.accent }}
                />
              </div>

              {/* Volume */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className={themeConfig.textPrimary}>Âm lượng:</span>
                  <span style={{ color: themeConfig.hex.accent }}>{Math.round(voiceSettings.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={voiceSettings.volume}
                  onChange={(e) =>
                    setVoiceSettings((prev) => ({ ...prev, volume: parseFloat(e.target.value) }))
                  }
                  className="w-full cursor-pointer"
                  style={{ accentColor: themeConfig.hex.accent }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Accessibility Switches */}
          <div className={`space-y-3 pt-2 border-t ${themeConfig.border}`}>
            <label className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider block`}>
              3. Âm thanh Trợ Năng
            </label>

            <div className="space-y-2">
              <label className={`flex items-center justify-between p-3 rounded-xl ${themeConfig.cardInner} border ${themeConfig.border} cursor-pointer`}>
                <div>
                  <div className={`text-xs sm:text-sm font-bold ${themeConfig.textPrimary}`}>
                    Âm thanh phản hồi khi bấm nút (Sound Cues)
                  </div>
                  <div className={`text-[11px] ${themeConfig.textSecondary}`}>
                    Phát tiếng chuông và bíp ngắn để người dùng nhận biết thao tác
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={voiceSettings.enableSoundCues}
                  onChange={(e) =>
                    setVoiceSettings((prev) => ({ ...prev, enableSoundCues: e.target.checked }))
                  }
                  className="w-5 h-5 rounded cursor-pointer"
                  style={{ accentColor: themeConfig.hex.accent }}
                />
              </label>

              <label className={`flex items-center justify-between p-3 rounded-xl ${themeConfig.cardInner} border ${themeConfig.border} cursor-pointer`}>
                <div>
                  <div className={`text-xs sm:text-sm font-bold ${themeConfig.textPrimary}`}>
                    Tự động cuộn theo câu đang đọc (Auto Scroll)
                  </div>
                  <div className={`text-[11px] ${themeConfig.textSecondary}`}>
                    Giữ câu đang phát luôn nằm ở vị trí trung tâm màn hình
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={voiceSettings.autoScroll}
                  onChange={(e) =>
                    setVoiceSettings((prev) => ({ ...prev, autoScroll: e.target.checked }))
                  }
                  className="w-5 h-5 cursor-pointer rounded"
                  style={{ accentColor: themeConfig.hex.accent }}
                />
              </label>
            </div>
          </div>

          {/* Section 4: Theme & Sentence Highlight Customization */}
          <div className={`space-y-4 pt-4 border-t ${themeConfig.border}`}>
            <label className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider block`}>
              4. Chọn Màu sắc Giao diện & Highlight Câu đọc
            </label>

            {/* 5.1 Theme Mode Selection Grid */}
            <div className="space-y-2">
              <span className={`text-xs font-bold ${themeConfig.textPrimary} block`}>
                A. Giao diện & Độ tương phản (Theme):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.values(THEME_CONFIGS).map((cfg) => {
                  const isSelected = theme === cfg.id;
                  return (
                    <button
                      key={cfg.id}
                      type="button"
                      onClick={() => {
                        if (voiceSettings.enableSoundCues) playSoundCue('click');
                        setTheme(cfg.id);
                        if (voiceSettings.enableSpokenGuide) {
                          speakAnnouncement(`Đã đổi giao diện: ${cfg.name}`, voiceSettings);
                        }
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? `border-2 border-amber-400 ring-2 ring-amber-400/30 ${cfg.card}`
                          : `${themeConfig.cardInner} ${themeConfig.border} hover:opacity-90`
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-full border border-white/20 flex-shrink-0 shadow"
                        style={{ backgroundColor: cfg.hex.canvas }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-bold truncate">
                          {cfg.name}
                        </div>
                        <div className="text-[11px] opacity-75 truncate">{cfg.badge}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5.2 Sentence Highlight Color Picker */}
            <div className="space-y-2 pt-2">
              <span className={`text-xs font-bold ${themeConfig.textPrimary} block`}>
                B. Màu sắc làm nổi bật câu đang đọc (Highlight):
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                {HIGHLIGHT_PRESETS.map((preset) => {
                  const isSelected = activeHighlight === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        if (voiceSettings.enableSoundCues) playSoundCue('click');
                        setVoiceSettings((prev) => ({ ...prev, highlightColor: preset.hex }));
                        if (voiceSettings.enableSpokenGuide) {
                          speakAnnouncement(`Đã chọn màu nổi bật: ${preset.name}`, voiceSettings);
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                        isSelected
                          ? 'ring-2 ring-amber-400 font-bold border-white'
                          : `${themeConfig.cardInner} ${themeConfig.border} opacity-80 hover:opacity-100`
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full shadow-inner border border-black/20"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span className="text-xs">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5.3 Live Sentence Reading Preview Card */}
            <div className={`p-4 rounded-2xl border ${themeConfig.border} ${themeConfig.cardInner} space-y-2`}>
              <span className={`text-[11px] font-bold ${themeConfig.textSecondary} uppercase tracking-wider block`}>
                Xem trước câu đang phát trong giao diện hiện tại:
              </span>
              <p className={`text-base leading-relaxed ${themeConfig.textPrimary}`}>
                <span>Hôm nay trời thu thanh mát. </span>
                <span
                  style={{
                    backgroundColor: `${activeHighlight}26`,
                    borderBottom: `3px solid ${activeHighlight}`,
                    boxShadow: `0 0 14px ${activeHighlight}33`,
                    borderRadius: '6px',
                    padding: '2px 4px',
                    fontWeight: 600,
                  }}
                  className="inline rounded px-1 text-current"
                >
                  Đây là câu văn mẫu đang được RÙ RÌ TTS phát âm.
                </span>
                <span> Âm thanh đọc rõ ràng và chuẩn mực.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`flex items-center justify-end p-4 border-t ${themeConfig.border} ${themeConfig.cardInner}`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-md transition-all active:scale-95`}
          >
            Lưu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

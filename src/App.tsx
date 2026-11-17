/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Book,
  Chapter,
  CustomDictionaryEntry,
  FontSize,
  PlaybackState,
  ThemeMode,
  VietnameseVoice,
  VoiceSettings,
} from './types';
import {
  DEFAULT_DICTIONARY,
  getAllBooks,
  getDictionary,
  getSetting,
  initDB,
  saveBook,
  saveDictionary,
  saveSetting,
  deleteBook as dbDeleteBook,
} from './services/db';
import {
  buildChaptersFromText,
  cleanVietnameseTextOffline,
  splitIntoSentences,
} from './services/textCleaner';
import {
  getAvailableVietnameseVoices,
  getEmotionAcoustics,
  playBase64Audio,
  playSoundCue,
  speakAnnouncement,
  stopSharedMediaPlayback,
  unlockAudioForIOS,
} from './services/audioSynthesizer';
import {
  checkBackendHealth,
  generateEdgeSpeech,
  generateGoogleTranslateSpeech,
  hasBackendSupport,
  isStaticHosting,
} from './services/geminiService';

import { Header } from './components/Header';
import { InputTabs } from './components/InputTabs';
import { ReaderView } from './components/ReaderView';
import { AudioPlayerBar, FallbackNoticeInfo } from './components/AudioPlayerBar';
import { VoiceSettingsModal } from './components/VoiceSettingsModal';
import { AudiobookExporterModal } from './components/AudiobookExporterModal';
import { LibraryModal } from './components/LibraryModal';
import { DictionaryModal } from './components/DictionaryModal';
import { ShortcutsHelpModal } from './components/ShortcutsHelpModal';
import { TextEditorModal } from './components/TextEditorModal';
import { getThemeConfig } from './utils/themeStyles';

const DEFAULT_SETTINGS: VoiceSettings = {
  engine: 'edge',
  voiceId: 'vi-VN-MaiLinh-Southern',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  emotion: 'natural',
  enableSoundCues: true,
  enableSpokenGuide: false,
  autoScroll: true,
  highlightColor: '#f59e0b',
};

export default function App() {
  // Appearance & Accessibility State
  const [theme, setTheme] = useState<ThemeMode>('dark-stone');
  const fontSize: FontSize = 'normal';
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  // Voice & Audio Configuration
  const [voices, setVoices] = useState<VietnameseVoice[]>([]);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [dictionary, setDictionary] = useState<CustomDictionaryEntry[]>(DEFAULT_DICTIONARY);

  // Active Book & Content State
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [savedBooks, setSavedBooks] = useState<Book[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);

  // Playback Control State
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number>(0);
  const [isAiCleaning, setIsAiCleaning] = useState(false);

  // Modals Visibility
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  const [isExporterOpen, setIsExporterOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false);

  // Audio Playback References
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playbackSessionIdRef = useRef(0);
  const audioBufferCacheRef = useRef<Map<string, {
    audioBase64: string;
    mimeType: string;
    isFallback: boolean;
    fallbackVoiceName?: string;
    fallbackReason?: string;
  }>>(new Map());
  const isPlayingRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  const sleepTimerIntervalRef = useRef<any>(null);

  // Clear audio buffer cache when voice settings or active book changes
  useEffect(() => {
    audioBufferCacheRef.current.clear();
  }, [voiceSettings.voiceId, voiceSettings.engine, voiceSettings.rate, voiceSettings.pitch, voiceSettings.emotion, activeBook?.id]);

  // Active voice fallback indicator state
  const [activeFallbackNotice, setActiveFallbackNotice] = useState<FallbackNoticeInfo | null>(null);

  // Helper to fetch audio payload for a sentence with seamless fallback and fast timeout
  const fetchSentenceAudioBuffer = useCallback(
    async (text: string, vSettings: VoiceSettings): Promise<{
      audioBase64: string;
      mimeType: string;
      isFallback: boolean;
      fallbackVoiceName?: string;
      fallbackReason?: string;
    } | null> => {
      const emotionAcoustics = getEmotionAcoustics(vSettings.emotion);
      const effectiveRate = Math.max(0.5, Math.min(3.0, vSettings.rate * emotionAcoustics.rateMultiplier));
      const effectivePitch = Math.max(0.5, Math.min(1.5, vSettings.pitch * emotionAcoustics.pitchMultiplier));
      const effectiveVolume = Math.max(0, Math.min(1.0, vSettings.volume * emotionAcoustics.volumeMultiplier));

      async function withTimeout<T>(promise: Promise<T>, timeoutMs = 18000): Promise<T | null> {
        let timer: any;
        const timeoutPromise = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        });
        try {
          const res = await Promise.race([promise, timeoutPromise]);
          clearTimeout(timer);
          return res;
        } catch {
          clearTimeout(timer);
          return null;
        }
      }

      if (!hasBackendSupport()) {
        return null;
      }

      if (vSettings.engine === 'edge' && !isOffline) {
        try {
          const res = await withTimeout(
            generateEdgeSpeech(
              text,
              vSettings.voiceId,
              effectiveRate,
              effectivePitch,
              effectiveVolume
            ),
            18000
          );
          if (res?.audioBase64) {
            return {
              audioBase64: res.audioBase64,
              mimeType: res.mimeType || 'audio/mp3',
              isFallback: !!res.isFallback,
              fallbackVoiceName: res.fallbackVoiceName,
              fallbackReason: res.fallbackReason,
            };
          }
          throw new Error('Edge TTS timeout or empty response');
        } catch (edgeErr) {
          console.warn('Edge TTS request failed/timed out, falling back to Google Translate TTS:', edgeErr);
          try {
            const fallbackRes = await withTimeout(
              generateGoogleTranslateSpeech(text, vSettings.voiceId),
              12000
            );
            if (fallbackRes?.audioBase64) {
              return {
                audioBase64: fallbackRes.audioBase64,
                mimeType: fallbackRes.mimeType || 'audio/mp3',
                isFallback: true,
                fallbackVoiceName: 'Google Dịch TTS (Dự phòng)',
                fallbackReason: 'Không kết nối được giọng Edge TTS, tạm chuyển sang Google Dịch',
              };
            }
            return null;
          } catch {
            return null;
          }
        }
      } else if (vSettings.engine === 'google-translate' && !isOffline) {
        try {
          const res = await withTimeout(
            generateGoogleTranslateSpeech(text, vSettings.voiceId),
            12000
          );
          if (res?.audioBase64) {
            return {
              audioBase64: res.audioBase64,
              mimeType: res.mimeType || 'audio/mp3',
              isFallback: false,
            };
          }
          return null;
        } catch {
          return null;
        }
      }
      return null;
    },
    [isOffline]
  );

  // Sequential lookahead prefetcher for upcoming sentences (buffers up to 3 sentences ahead smoothly without network congestion)
  const activePrefetchKeysRef = useRef<Set<string>>(new Set());
  const prefetchUpcoming = useCallback(
    async (chapIdx: number, startSentIdx: number, bookOverride?: Book) => {
      const currentBook = bookOverride || activeBook;
      if (!currentBook || isOffline || voiceSettings.engine === 'native') return;

      const chapter = currentBook.chapters[chapIdx];
      if (!chapter) return;

      // Prefetch up to 3 sentences ahead sequentially
      for (let offset = 0; offset < 3; offset++) {
        if (!isPlayingRef.current) break;
        const targetIdx = startSentIdx + offset;
        const targetSent = chapter.sentences[targetIdx];
        if (!targetSent) break;

        const cacheKey = `${voiceSettings.engine}_${voiceSettings.voiceId}_${chapIdx}_${targetIdx}`;
        if (audioBufferCacheRef.current.has(cacheKey) || activePrefetchKeysRef.current.has(cacheKey)) {
          continue;
        }

        activePrefetchKeysRef.current.add(cacheKey);
        const textToRead = targetSent.cleanText || targetSent.text;

        try {
          const buffer = await fetchSentenceAudioBuffer(textToRead, voiceSettings);
          if (buffer) {
            if (audioBufferCacheRef.current.size > 80) {
              const firstKey = audioBufferCacheRef.current.keys().next().value;
              if (firstKey) audioBufferCacheRef.current.delete(firstKey);
            }
            audioBufferCacheRef.current.set(cacheKey, buffer);
          }
        } catch {
        } finally {
          activePrefetchKeysRef.current.delete(cacheKey);
        }
      }
    },
    [activeBook, isOffline, voiceSettings, fetchSentenceAudioBuffer]
  );

  // Keep isPlayingRef in sync
  useEffect(() => {
    isPlayingRef.current = playbackState === 'playing';
  }, [playbackState]);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Screen Wake Lock API (Keep screen active while reading)
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch {
      // Benign if unsupported
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  // 1. Initial Load: IndexedDB, Voices, Settings
  useEffect(() => {
    const initApp = async () => {
      await initDB();
      const loadedBooks = await getAllBooks();
      setSavedBooks(loadedBooks);

      const loadedDict = await getDictionary();
      setDictionary(loadedDict);

      const savedTheme = await getSetting<string>('theme', 'dark-stone');
      const validThemes: ThemeMode[] = ['dark-stone', 'cream-paper', 'emerald', 'navy'];
      if (validThemes.includes(savedTheme as ThemeMode)) {
        setTheme(savedTheme as ThemeMode);
      } else {
        setTheme('dark-stone');
      }

      const savedVoiceSettings = await getSetting<VoiceSettings>('voiceSettings', DEFAULT_SETTINGS);
      const isDeprecatedId =
        savedVoiceSettings?.voiceId === 'google_translate_vi_south_female' ||
        savedVoiceSettings?.voiceId === 'google_translate_vi_south_male' ||
        savedVoiceSettings?.voiceId === 'vi-VN-QuocBao-Southern';

      if (
        !savedVoiceSettings.voiceId ||
        savedVoiceSettings.engine === ('gemini' as any) ||
        savedVoiceSettings.voiceId.includes('gemini') ||
        isDeprecatedId
      ) {
        setVoiceSettings(DEFAULT_SETTINGS);
      } else {
        setVoiceSettings(savedVoiceSettings);
      }

      const detectedVoices = await getAvailableVietnameseVoices();
      setVoices(detectedVoices);

      // Pick default voice if not set or invalid, or when no backend is configured on static hosting
      const backendReady = hasBackendSupport();
      if (backendReady && isStaticHosting()) {
        // Warm up external Vercel backend silently in background
        checkBackendHealth().catch(() => {});
      }

      const shouldPickDefault =
        !savedVoiceSettings.voiceId ||
        savedVoiceSettings.voiceId === 'native_default_vi' ||
        isDeprecatedId ||
        (!backendReady && savedVoiceSettings.engine !== 'native');

      if (shouldPickDefault) {
        const defaultVoice = !backendReady
          ? detectedVoices.find((v) => v.engine === 'native') || detectedVoices[0]
          : detectedVoices.find((v) => v.id === DEFAULT_SETTINGS.voiceId) || detectedVoices[0];

        if (defaultVoice) {
          setVoiceSettings((prev) => ({
            ...prev,
            voiceId: defaultVoice.id,
            engine: defaultVoice.engine,
          }));
        }
      }
    };

    initApp();
  }, []);

  // Save Settings on change & apply theme to document
  useEffect(() => {
    saveSetting('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    const themeConfig = getThemeConfig(theme);
    document.body.style.backgroundColor = themeConfig.hex.canvas;
    document.body.style.color = themeConfig.hex.textPrimary;
    document.documentElement.style.backgroundColor = themeConfig.hex.canvas;
    document.documentElement.style.color = themeConfig.hex.textPrimary;
    document.documentElement.style.setProperty('--canvas-bg', themeConfig.hex.canvas);
    document.documentElement.style.setProperty('--text-primary', themeConfig.hex.textPrimary);
    document.documentElement.style.setProperty('--text-secondary', themeConfig.hex.textSecondary);
    document.documentElement.style.setProperty('--border-color', themeConfig.hex.border);
    document.documentElement.style.setProperty('--focus-ring', themeConfig.hex.accent);
  }, [theme]);

  useEffect(() => {
    saveSetting('voiceSettings', voiceSettings);
  }, [voiceSettings]);

  // Sleep Timer Countdown Logic
  useEffect(() => {
    if (sleepTimerIntervalRef.current) {
      clearInterval(sleepTimerIntervalRef.current);
      sleepTimerIntervalRef.current = null;
    }

    if (sleepTimerMinutes > 0 && playbackState === 'playing') {
      let secondsRemaining = sleepTimerMinutes * 60;
      sleepTimerIntervalRef.current = setInterval(() => {
        secondsRemaining -= 1;
        if (secondsRemaining <= 0) {
          stopAudioPlayback();
          setSleepTimerMinutes(0);
          if (voiceSettings.enableSpokenGuide) {
            speakAnnouncement('Đã đến giờ hẹn tắt sách nói.', voiceSettings);
          }
          clearInterval(sleepTimerIntervalRef.current);
        }
      }, 1000);
    }

    return () => {
      if (sleepTimerIntervalRef.current) {
        clearInterval(sleepTimerIntervalRef.current);
      }
    };
  }, [sleepTimerMinutes, playbackState]);

  // 2. Play Current Sentence Logic
  const stopAudioPlayback = useCallback(() => {
    playbackSessionIdRef.current++;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    stopSharedMediaPlayback();
    setPlaybackState('paused');
    releaseWakeLock();
  }, []);

  const playSentence = useCallback(
    async (chapIdx: number, sentIdx: number, targetBook?: Book) => {
      // Unlock iOS Safari media session synchronously inside user tap BEFORE any await
      unlockAudioForIOS();

      const currentBook = targetBook || activeBook;
      if (!currentBook) return;

      const sessionId = ++playbackSessionIdRef.current;

      const chapter = currentBook.chapters[chapIdx];
      if (!chapter || !chapter.sentences[sentIdx]) {
        // End of chapter
        if (chapIdx < currentBook.chapters.length - 1) {
          setCurrentChapterIndex(chapIdx + 1);
          setCurrentSentenceIndex(0);
          if (sleepTimerMinutes === -1) {
            // Sleep timer 'end-of-chapter' reached
            stopAudioPlayback();
            setSleepTimerMinutes(0);
            return;
          }
          playSentence(chapIdx + 1, 0, currentBook);
        } else {
          // Finished entire book
          setPlaybackState('idle');
          if (voiceSettings.enableSoundCues) playSoundCue('success');
          if (voiceSettings.enableSpokenGuide) {
            speakAnnouncement('Đã đọc xong toàn bộ tác phẩm.', voiceSettings);
          }
          releaseWakeLock();
        }
        return;
      }

      const sentenceObj = chapter.sentences[sentIdx];
      const textToRead = sentenceObj.text?.trim() || sentenceObj.cleanText || '';

      setCurrentChapterIndex(chapIdx);
      setCurrentSentenceIndex(sentIdx);
      requestWakeLock();

      // Cancel ongoing synthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      stopSharedMediaPlayback();

      // Compute dynamic acoustic modifiers based on EmotionStyle
      const emotionAcoustics = getEmotionAcoustics(voiceSettings.emotion);
      const effectiveRate = Math.max(0.5, Math.min(3.0, voiceSettings.rate * emotionAcoustics.rateMultiplier));
      const effectivePitch = Math.max(0.5, Math.min(1.5, voiceSettings.pitch * emotionAcoustics.pitchMultiplier));
      const effectiveVolume = Math.max(0, Math.min(1.0, voiceSettings.volume * emotionAcoustics.volumeMultiplier));

      // Trigger background prefetching for the next 3 sentences immediately
      prefetchUpcoming(chapIdx, sentIdx + 1, currentBook);

      // Route 1, 2: Online Neural Audio (Edge, Google Translate)
      if (voiceSettings.engine !== 'native' && !isOffline) {
        try {
          const cacheKey = `${voiceSettings.engine}_${voiceSettings.voiceId}_${chapIdx}_${sentIdx}`;
          let cached = audioBufferCacheRef.current.get(cacheKey) || null;

          if (!cached) {
            setPlaybackState('synthesizing');
            const res = await fetchSentenceAudioBuffer(textToRead, voiceSettings);
            if (sessionId !== playbackSessionIdRef.current) return;
            if (res) {
              cached = res;
              if (audioBufferCacheRef.current.size > 60) {
                const firstKey = audioBufferCacheRef.current.keys().next().value;
                if (firstKey) audioBufferCacheRef.current.delete(firstKey);
              }
              audioBufferCacheRef.current.set(cacheKey, res);
            }
          }

          if (sessionId !== playbackSessionIdRef.current) return;

          if (!cached || !cached.audioBase64) {
            throw new Error('Failed to obtain audio payload');
          }

          if (cached.isFallback) {
            setActiveFallbackNotice({
              isFallback: true,
              fallbackVoiceName: cached.fallbackVoiceName || 'Google Dịch TTS (Dự phòng)',
              fallbackReason: cached.fallbackReason || 'Dịch vụ AI bận, tạm dùng giọng Google Dịch',
            });
          } else {
            setActiveFallbackNotice(null);
          }

          // Edge TTS already embeds rate/pitch in SSML unless it fell back to Google Translate
          const mediaRate =
            voiceSettings.engine === 'edge' && !cached.isFallback ? 1.0 : effectiveRate;

          await playBase64Audio(cached.audioBase64, {
            rate: mediaRate,
            volume: effectiveVolume,
            mimeType: cached.mimeType,
            onStart: () => {
              if (sessionId === playbackSessionIdRef.current) {
                setPlaybackState('playing');
              }
            },
            onEnded: () => {
              if (sessionId === playbackSessionIdRef.current && isPlayingRef.current) {
                playSentence(chapIdx, sentIdx + 1, currentBook);
              }
            },
            onError: () => {
              if (sessionId === playbackSessionIdRef.current && isPlayingRef.current) {
                speakNativeSentence(textToRead, chapIdx, sentIdx, effectiveRate, effectivePitch, effectiveVolume, currentBook);
              }
            },
          });
        } catch (error) {
          if (sessionId !== playbackSessionIdRef.current) return;
          console.warn('Audio synthesis fallback to native Web Speech:', error);
          setPlaybackState('playing');
          setActiveFallbackNotice({
            isFallback: true,
            fallbackVoiceName: 'Giọng thiết bị (Offline)',
            fallbackReason: 'Không thể kết nối dịch vụ trực tuyến, sử dụng giọng đọc có sẵn trên máy',
          });
          speakNativeSentence(textToRead, chapIdx, sentIdx, effectiveRate, effectivePitch, effectiveVolume, currentBook);
        }
      } else {
        // Route 4: Native Device Web Speech Synthesis (100% Offline)
        setPlaybackState('playing');
        setActiveFallbackNotice(null);
        speakNativeSentence(textToRead, chapIdx, sentIdx, effectiveRate, effectivePitch, effectiveVolume, currentBook);
      }
    },
    [activeBook, voiceSettings, isOffline, sleepTimerMinutes, stopAudioPlayback, prefetchUpcoming, fetchSentenceAudioBuffer]
  );

  const speakNativeSentence = (
    text: string,
    chapIdx: number,
    sentIdx: number,
    rate?: number,
    pitch?: number,
    volume?: number,
    targetBook?: Book
  ) => {
    if (!('speechSynthesis' in window)) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = rate ?? voiceSettings.rate;
    utterance.pitch = pitch ?? voiceSettings.pitch;
    utterance.volume = volume ?? voiceSettings.volume;

    const chosenVoice = voices.find((v) => v.id === voiceSettings.voiceId);
    const targetGender = chosenVoice?.gender || 'female';

    if (chosenVoice?.nativeVoice) {
      utterance.voice = chosenVoice.nativeVoice;
    } else {
      const allNativeVoices = window.speechSynthesis.getVoices();
      const viVoices = allNativeVoices.filter(
        (v) =>
          v.lang.toLowerCase().includes('vi') ||
          v.name.toLowerCase().includes('viet') ||
          v.lang.toLowerCase().includes('vn')
      );

      // Prioritize native voice that matches target gender
      const matchedByGender = viVoices.find((v) => {
        const n = v.name.toLowerCase();
        const isFemale =
          n.includes('mai') ||
          n.includes('linh') ||
          n.includes('nu') ||
          n.includes('female') ||
          n.includes('hoaimy') ||
          n.includes('ngoc') ||
          n.includes('lan');
        const isMale =
          n.includes('nam') ||
          n.includes('an') ||
          n.includes('male') ||
          n.includes('minh') ||
          n.includes('duc');
        return targetGender === 'female' ? isFemale : isMale;
      });

      if (matchedByGender) {
        utterance.voice = matchedByGender;
      } else if (viVoices.length > 0) {
        utterance.voice = viVoices[0];
        // If target was female but only male voice is present, elevate pitch to reduce jarring contrast
        if (targetGender === 'female') {
          utterance.pitch = Math.min(1.4, (pitch ?? voiceSettings.pitch) * 1.2);
        }
      }
    }

    currentUtteranceRef.current = utterance;

    utterance.onend = () => {
      if (isPlayingRef.current) {
        playSentence(chapIdx, sentIdx + 1, targetBook);
      }
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      if (isPlayingRef.current) {
        setTimeout(() => playSentence(chapIdx, sentIdx + 1, targetBook), 50);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  // Auto Save Reading Position (IndexedDB) whenever sentence/chapter changes
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (!activeBook) return;

    const timer = setTimeout(() => {
      setActiveBook((prevBook) => {
        if (!prevBook) return null;
        if (
          prevBook.currentChapterIndex === currentChapterIndex &&
          prevBook.currentSentenceIndex === currentSentenceIndex
        ) {
          return prevBook;
        }
        const updated: Book = {
          ...prevBook,
          currentChapterIndex,
          currentSentenceIndex,
          updatedAt: Date.now(),
        };
        saveBook(updated).catch(() => {});
        saveSetting('lastReadBookId', updated.id).catch(() => {});
        return updated;
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [currentChapterIndex, currentSentenceIndex, activeBook?.id]);

  // Resume playback directly for a book
  const handleResumeBook = useCallback((book: Book) => {
    unlockAudioForIOS();
    setActiveBook(book);
    const chap = book.currentChapterIndex || 0;
    const sent = book.currentSentenceIndex || 0;
    setCurrentChapterIndex(chap);
    setCurrentSentenceIndex(sent);
    if (voiceSettings.enableSoundCues) playSoundCue('play');
    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement(`Tiếp tục nghe tác phẩm ${book.title} từ câu ${sent + 1}, chương ${chap + 1}.`, voiceSettings);
    }
    playSentence(chap, sent, book);
  }, [voiceSettings, playSentence]);

  // 3. Load Book Content from Text / File / Camera (Checks for matching book with saved progress)
  const handleLoadContent = async (title: string, rawText: string) => {
    unlockAudioForIOS();
    const cleaned = cleanVietnameseTextOffline(rawText, dictionary);
    const chapters = buildChaptersFromText(cleaned);
    const wordCount = cleaned.trim().split(/\s+/).length;
    const targetTitle = title.trim() || 'Sách nói mới';

    // Find existing book matching title or original text
    const existingBook = savedBooks.find(
      (b) => b.title.toLowerCase() === targetTitle.toLowerCase() || b.originalText === rawText
    );

    let bookToPlay: Book;
    let startChap = 0;
    let startSent = 0;

    if (existingBook && (existingBook.currentChapterIndex > 0 || existingBook.currentSentenceIndex > 0)) {
      startChap = existingBook.currentChapterIndex;
      startSent = existingBook.currentSentenceIndex;
      bookToPlay = {
        ...existingBook,
        chapters,
        cleanedText: cleaned,
        updatedAt: Date.now(),
      };
    } else {
      bookToPlay = {
        id: existingBook ? existingBook.id : `book_${Date.now()}`,
        title: targetTitle,
        originalText: rawText,
        cleanedText: cleaned,
        chapters,
        createdAt: existingBook ? existingBook.createdAt : Date.now(),
        updatedAt: Date.now(),
        currentChapterIndex: 0,
        currentSentenceIndex: 0,
        bookmarks: existingBook ? existingBook.bookmarks : [],
        wordCount,
      };
    }

    await saveBook(bookToPlay);
    setActiveBook(bookToPlay);
    setCurrentChapterIndex(startChap);
    setCurrentSentenceIndex(startSent);

    const updatedList = await getAllBooks();
    setSavedBooks(updatedList);

    if (voiceSettings.enableSoundCues) playSoundCue('chapter');
    if (voiceSettings.enableSpokenGuide) {
      const resumeInfo = (startChap > 0 || startSent > 0)
        ? ` Tiếp tục từ chương ${startChap + 1}, câu ${startSent + 1}.`
        : '';
      speakAnnouncement(`Đã nạp xong tác phẩm ${targetTitle}.${resumeInfo} Đang phát giọng đọc.`, voiceSettings);
    }

    // Auto-start reading from current or saved position
    playSentence(startChap, startSent, bookToPlay);
  };

  // 4. Bookmark Sentence
  const handleToggleBookmark = async (chapIdx: number, sentIdx: number) => {
    if (!activeBook) return;

    const chapter = activeBook.chapters[chapIdx];
    const sentence = chapter?.sentences[sentIdx];
    if (!sentence) return;

    const exists = activeBook.bookmarks.some(
      (b) => b.chapterIndex === chapIdx && b.sentenceIndex === sentIdx
    );

    let updatedBookmarks = [...activeBook.bookmarks];
    if (exists) {
      updatedBookmarks = updatedBookmarks.filter(
        (b) => !(b.chapterIndex === chapIdx && b.sentenceIndex === sentIdx)
      );
    } else {
      updatedBookmarks.push({
        id: `bm_${Date.now()}`,
        chapterIndex: chapIdx,
        sentenceIndex: sentIdx,
        sentenceText: sentence.text,
        createdAt: Date.now(),
      });
    }

    const updatedBook = {
      ...activeBook,
      bookmarks: updatedBookmarks,
      updatedAt: Date.now(),
    };

    setActiveBook(updatedBook);
    await saveBook(updatedBook);
  };

  // 5. Deep Clean (Offline Rule Engine or Gemini AI)
  const handleDeepAiClean = async () => {
    if (!activeBook) return;

    setIsAiCleaning(true);
    if (voiceSettings.enableSoundCues) playSoundCue('clean');

    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement('Đang chuẩn hóa chính tả, số liệu và từ viết tắt. Vui lòng đợi.', voiceSettings);
    }

    try {
      const currentChap = activeBook.chapters[currentChapterIndex];
      // Offline deep rule cleaner (numbers to words, dates, acronyms, diacritics, custom dictionary)
      const cleaned = cleanVietnameseTextOffline(currentChap.content, dictionary);

      const newSentences = splitIntoSentences(cleaned);
      const updatedChapters = [...activeBook.chapters];
      updatedChapters[currentChapterIndex] = {
        ...currentChap,
        content: cleaned,
        sentences: newSentences,
      };

      const updatedBook: Book = {
        ...activeBook,
        chapters: updatedChapters,
        updatedAt: Date.now(),
      };

      setActiveBook(updatedBook);
      await saveBook(updatedBook);

      if (voiceSettings.enableSoundCues) playSoundCue('success');
      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement('Đã hoàn thành chuẩn hóa văn bản và số liệu cho chương.', voiceSettings);
      }
    } catch (e: any) {
      alert(e?.message || 'Lỗi chuẩn hóa văn bản.');
    } finally {
      setIsAiCleaning(false);
    }
  };

  // 5b. Manual Spelling & Content Editing (Full Chapter & Bulk Find/Replace)
  const handleOpenTextEditor = useCallback(() => {
    if (!activeBook) return;
    if (playbackState === 'playing' || playbackState === 'synthesizing') {
      stopAudioPlayback();
    }
    setIsTextEditorOpen(true);
  }, [activeBook, playbackState, stopAudioPlayback]);

  const persistEditedBook = useCallback(async (updatedBook: Book) => {
    setActiveBook(updatedBook);
    await saveBook(updatedBook);
    const updatedList = await getAllBooks();
    setSavedBooks(updatedList);
  }, []);

  const handleSaveChapterEdit = useCallback(
    async (chapIdx: number, newContent: string, playAfterSave = false) => {
      if (!activeBook) return;
      stopAudioPlayback();
      audioBufferCacheRef.current.clear();

      const targetChap = activeBook.chapters[chapIdx];
      if (!targetChap) return;

      const trimmedContent = newContent.trim();
      const newSentences = splitIntoSentences(trimmedContent);
      const updatedChapters = [...activeBook.chapters];
      updatedChapters[chapIdx] = {
        ...targetChap,
        content: trimmedContent,
        sentences: newSentences,
      };

      const cleanedFullText = updatedChapters.map((c) => c.content).join('\n\n');
      const totalWords = cleanedFullText.trim()
        ? cleanedFullText.trim().split(/\s+/).length
        : 0;

      const nextSentIdx = playAfterSave
        ? 0
        : Math.min(currentSentenceIndex, Math.max(0, newSentences.length - 1));

      const updatedBook: Book = {
        ...activeBook,
        chapters: updatedChapters,
        cleanedText: cleanedFullText,
        wordCount: totalWords,
        currentSentenceIndex:
          chapIdx === currentChapterIndex ? nextSentIdx : activeBook.currentSentenceIndex,
        updatedAt: Date.now(),
      };

      if (chapIdx === currentChapterIndex) {
        setCurrentSentenceIndex(nextSentIdx);
      }

      await persistEditedBook(updatedBook);

      if (playAfterSave && newSentences.length > 0) {
        playSentence(chapIdx, 0, updatedBook);
      }
    },
    [activeBook, currentChapterIndex, currentSentenceIndex, stopAudioPlayback, persistEditedBook, playSentence]
  );

  const handleReplaceInBook = useCallback(
    async (
      findText: string,
      replaceText: string,
      caseSensitive: boolean,
      scope: 'chapter' | 'book'
    ): Promise<number> => {
      if (!activeBook || !findText) return 0;
      stopAudioPlayback();
      audioBufferCacheRef.current.clear();

      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
      let totalMatches = 0;

      const updatedChapters = activeBook.chapters.map((chap, idx) => {
        if (scope === 'chapter' && idx !== currentChapterIndex) {
          return chap;
        }

        const contentMatches = chap.content.match(regex);
        if (!contentMatches || contentMatches.length === 0) {
          // Still check sentences just in case
          let sentMatched = false;
          const nextSentences = chap.sentences.map((s) => {
            const m = s.text.match(regex);
            if (m && m.length > 0) {
              sentMatched = true;
              totalMatches += m.length;
              const replaced = s.text.replace(regex, replaceText).trim();
              return { ...s, text: replaced || s.text, cleanText: replaced || s.cleanText };
            }
            return s;
          });
          return sentMatched ? { ...chap, sentences: nextSentences } : chap;
        }

        totalMatches += contentMatches.length;
        const nextContent = chap.content.replace(regex, replaceText);
        const nextSentences = chap.sentences
          .map((s) => {
            const updatedText = s.text.replace(regex, replaceText).trim();
            return {
              ...s,
              text: updatedText,
              cleanText: updatedText,
            };
          })
          .filter((s) => s.text.length > 0)
          .map((s, sIdx) => ({ ...s, index: sIdx }));

        return {
          ...chap,
          content: nextContent,
          sentences: nextSentences,
        };
      });

      if (totalMatches === 0) return 0;

      const cleanedFullText = updatedChapters.map((c) => c.content).join('\n\n');
      const totalWords = cleanedFullText.trim()
        ? cleanedFullText.trim().split(/\s+/).length
        : 0;

      const activeChapLen = updatedChapters[currentChapterIndex]?.sentences.length || 1;
      const safeSentIdx = Math.min(currentSentenceIndex, Math.max(0, activeChapLen - 1));
      if (safeSentIdx !== currentSentenceIndex) {
        setCurrentSentenceIndex(safeSentIdx);
      }

      const updatedBook: Book = {
        ...activeBook,
        chapters: updatedChapters,
        cleanedText: cleanedFullText,
        wordCount: totalWords,
        currentSentenceIndex: safeSentIdx,
        updatedAt: Date.now(),
      };

      await persistEditedBook(updatedBook);
      return totalMatches;
    },
    [activeBook, currentChapterIndex, currentSentenceIndex, stopAudioPlayback, persistEditedBook]
  );

  // 6. Delete Book from Library
  const handleDeleteBook = async (id: string) => {
    await dbDeleteBook(id);
    const updated = await getAllBooks();
    setSavedBooks(updated);
    if (activeBook?.id === id) {
      stopAudioPlayback();
      setActiveBook(null);
    }
  };

  // 7. Global Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in textarea or input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (playbackState === 'playing') {
            if (voiceSettings.enableSoundCues) playSoundCue('pause');
            stopAudioPlayback();
          } else {
            if (voiceSettings.enableSoundCues) playSoundCue('play');
            playSentence(currentChapterIndex, currentSentenceIndex);
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (currentSentenceIndex > 0) {
            if (voiceSettings.enableSoundCues) playSoundCue('click');
            playSentence(currentChapterIndex, currentSentenceIndex - 1);
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (
            activeBook &&
            currentSentenceIndex <
              activeBook.chapters[currentChapterIndex].sentences.length - 1
          ) {
            if (voiceSettings.enableSoundCues) playSoundCue('click');
            playSentence(currentChapterIndex, currentSentenceIndex + 1);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          setVoiceSettings((prev) => {
            const nextRate = Math.min(2.5, +(prev.rate + 0.25).toFixed(2));
            if (prev.enableSoundCues) playSoundCue('click');
            if (prev.enableSpokenGuide) {
              speakAnnouncement(`Tốc độ ${nextRate}x`, prev);
            }
            return { ...prev, rate: nextRate };
          });
          break;

        case 'ArrowDown':
          e.preventDefault();
          setVoiceSettings((prev) => {
            const nextRate = Math.max(0.5, +(prev.rate - 0.25).toFixed(2));
            if (prev.enableSoundCues) playSoundCue('click');
            if (prev.enableSpokenGuide) {
              speakAnnouncement(`Tốc độ ${nextRate}x`, prev);
            }
            return { ...prev, rate: nextRate };
          });
          break;

        case 'b':
        case 'B':
          e.preventDefault();
          handleToggleBookmark(currentChapterIndex, currentSentenceIndex);
          break;

        case 'v':
        case 'V':
          e.preventDefault();
          setIsVoiceSettingsOpen((prev) => !prev);
          break;

        case 'h':
        case 'H':
        case '?':
          e.preventDefault();
          setIsShortcutsOpen((prev) => !prev);
          break;

        case 'Escape':
          setIsVoiceSettingsOpen(false);
          setIsExporterOpen(false);
          setIsLibraryOpen(false);
          setIsDictionaryOpen(false);
          setIsShortcutsOpen(false);
          setIsTextEditorOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    playbackState,
    activeBook,
    currentChapterIndex,
    currentSentenceIndex,
    voiceSettings,
    playSentence,
    stopAudioPlayback,
  ]);

  // Dynamic Theme Colors for High-Contrast Accessibility
  const getThemeContainerClass = () => {
    return getThemeConfig(theme).canvas;
  };

  const activeChapter = activeBook?.chapters[currentChapterIndex] || activeBook?.chapters[0];
  const currentSentenceText = activeChapter?.sentences[currentSentenceIndex]?.text || '';
  const currentVoiceObj = voices.find((v) => v.id === voiceSettings.voiceId);

  const lastReadBook = savedBooks.find(
    (b) => b.currentChapterIndex > 0 || b.currentSentenceIndex > 0
  ) || savedBooks[0] || null;

  return (
    <div
      id="app-root-wrapper"
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${getThemeContainerClass()}`}
    >
      {/* Accessible Skip Link */}
      <a
        href="#main-content-region"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-stone-950 focus:font-black focus:rounded-lg"
      >
        Chuyển nhanh đến nội dung chính
      </a>

      {/* Primary Accessible Header */}
      <Header
        theme={theme}
        setTheme={setTheme}
        voiceSettings={voiceSettings}
        setVoiceSettings={setVoiceSettings}
        isOffline={isOffline}
        setIsOffline={setIsOffline}
        onOpenVoiceSettings={() => setIsVoiceSettingsOpen(true)}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onOpenDictionary={() => setIsDictionaryOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenExporter={() => {
          if (!activeBook) {
            alert('Vui lòng mở hoặc nhập một cuốn sách trước khi xuất AudioBook.');
            return;
          }
          setIsExporterOpen(true);
        }}
        activeBookTitle={activeBook?.title}
      />

      {/* Main View Area */}
      <div id="main-content-region" className="flex-1 flex flex-col">
        {!activeBook ? (
          <InputTabs
            theme={theme}
            onLoadContent={handleLoadContent}
            dictionary={dictionary}
            voiceSettings={voiceSettings}
            isOffline={isOffline}
            lastReadBook={lastReadBook}
            onResumeBook={handleResumeBook}
          />
        ) : (
          <ReaderView
            book={activeBook}
            currentChapterIndex={currentChapterIndex}
            currentSentenceIndex={currentSentenceIndex}
            playbackState={playbackState}
            fontSize={fontSize}
            theme={theme}
            voiceSettings={voiceSettings}
            isAiCleaning={isAiCleaning}
            activeFallbackNotice={activeFallbackNotice}
            onSelectChapter={(idx) => {
              stopAudioPlayback();
              setCurrentChapterIndex(idx);
              setCurrentSentenceIndex(0);
            }}
            onSelectSentence={(sentIdx) => {
              playSentence(currentChapterIndex, sentIdx);
            }}
            onToggleBookmark={handleToggleBookmark}
            onDeepAiClean={handleDeepAiClean}
            onBackToInput={() => {
              stopAudioPlayback();
              setActiveBook(null);
            }}
            onOpenExporter={() => setIsExporterOpen(true)}
            onOpenTextEditor={handleOpenTextEditor}
          />
        )}
      </div>

      {/* Sticky Bottom Audio Player Dock (Active when a book is loaded) */}
      {activeBook && (
        <AudioPlayerBar
          theme={theme}
          playbackState={playbackState}
          onPlay={() => playSentence(currentChapterIndex, currentSentenceIndex)}
          onPause={stopAudioPlayback}
          onNextSentence={() => {
            if (
              currentSentenceIndex <
              (activeChapter?.sentences.length || 1) - 1
            ) {
              playSentence(currentChapterIndex, currentSentenceIndex + 1);
            }
          }}
          onPrevSentence={() => {
            if (currentSentenceIndex > 0) {
              playSentence(currentChapterIndex, currentSentenceIndex - 1);
            }
          }}
          currentSentenceText={currentSentenceText}
          sentenceIndex={currentSentenceIndex}
          totalSentences={activeChapter?.sentences.length || 1}
          chapterTitle={activeChapter?.title || 'Chương 1'}
          voiceSettings={voiceSettings}
          setVoiceSettings={setVoiceSettings}
          activeVoiceName={currentVoiceObj?.name || 'Giọng chuẩn'}
          activeFallbackNotice={activeFallbackNotice}
          onOpenVoiceSettings={() => setIsVoiceSettingsOpen(true)}
          onDownloadCurrentAudio={() => setIsExporterOpen(true)}
          sleepTimerMinutes={sleepTimerMinutes}
          setSleepTimerMinutes={setSleepTimerMinutes}
        />
      )}

      {/* Modals */}
      <VoiceSettingsModal
        isOpen={isVoiceSettingsOpen}
        onClose={() => setIsVoiceSettingsOpen(false)}
        voices={voices}
        voiceSettings={voiceSettings}
        setVoiceSettings={setVoiceSettings}
        isOffline={isOffline}
        theme={theme}
        setTheme={setTheme}
      />

      {activeBook && (
        <AudiobookExporterModal
          isOpen={isExporterOpen}
          onClose={() => setIsExporterOpen(false)}
          book={activeBook}
          voices={voices}
          voiceSettings={voiceSettings}
          isOffline={isOffline}
          theme={theme}
        />
      )}

      <LibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        books={savedBooks}
        onSelectBook={(book) => {
          stopAudioPlayback();
          setActiveBook(book);
          setCurrentChapterIndex(book.currentChapterIndex || 0);
          setCurrentSentenceIndex(book.currentSentenceIndex || 0);
        }}
        onDeleteBook={handleDeleteBook}
        voiceSettings={voiceSettings}
        theme={theme}
      />

      <DictionaryModal
        isOpen={isDictionaryOpen}
        onClose={() => setIsDictionaryOpen(false)}
        dictionary={dictionary}
        onSaveDictionary={async (newDict) => {
          setDictionary(newDict);
          await saveDictionary(newDict);
        }}
        voiceSettings={voiceSettings}
        theme={theme}
      />

      <ShortcutsHelpModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        voiceSettings={voiceSettings}
        theme={theme}
      />

      {activeBook && (
        <TextEditorModal
          isOpen={isTextEditorOpen}
          onClose={() => setIsTextEditorOpen(false)}
          book={activeBook}
          currentChapterIndex={currentChapterIndex}
          voiceSettings={voiceSettings}
          theme={theme}
          onSaveChapter={handleSaveChapterEdit}
          onReplaceInBook={handleReplaceInBook}
        />
      )}
    </div>
  );
}

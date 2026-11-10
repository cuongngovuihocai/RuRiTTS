export type VoiceEngine = 'edge' | 'google-translate' | 'native';

export interface VietnameseVoice {
  id: string;
  name: string;
  lang: string;
  gender: 'female' | 'male' | 'neutral';
  region?: 'Bắc' | 'Nam' | 'Trung' | 'Toàn quốc' | 'Edge Neural' | 'Google TTS' | 'AI Neural';
  engine: VoiceEngine;
  isOfflineSupported: boolean;
  nativeVoice?: SpeechSynthesisVoice;
  description?: string;
  isRecommended?: boolean;
}

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'loading' | 'synthesizing';

export type ThemeMode =
  | 'dark-stone'   // Tối Trầm (Warm Stone)
  | 'cream-paper'  // Giấy Sách Dịu Mắt (Cream Paper Light)
  | 'emerald'      // Lục Bảo (Emerald on Dark)
  | 'navy';        // Biển Đêm (Deep Blue Navy)

export type FontSize = 'normal';

export interface SentenceItem {
  id: string;
  index: number;
  text: string;
  cleanText: string;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  sentences: SentenceItem[];
  audioBlob?: Blob;
  audioUrl?: string;
  duration?: number;
}

export interface Bookmark {
  id: string;
  chapterIndex: number;
  sentenceIndex: number;
  sentenceText: string;
  note?: string;
  createdAt: number;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  originalText: string;
  cleanedText: string;
  chapters: Chapter[];
  createdAt: number;
  updatedAt: number;
  currentChapterIndex: number;
  currentSentenceIndex: number;
  bookmarks: Bookmark[];
  wordCount: number;
}

export interface CustomDictionaryEntry {
  id: string;
  word: string;
  replaceWith: string;
  caseSensitive?: boolean;
}

export type EmotionStyle =
  | 'natural'
  | 'expressive'
  | 'storytelling'
  | 'dramatic'
  | 'calm'
  | 'cheerful'
  | 'whisper';

export interface VoiceSettings {
  engine: VoiceEngine;
  voiceId: string;
  rate: number; // 0.5 to 3.0
  pitch: number; // 0.5 to 1.5
  volume: number; // 0 to 1
  emotion: EmotionStyle;
  enableSoundCues: boolean; // Âm thanh phản hồi khi thao tác nút
  enableSpokenGuide: boolean; // Giọng đọc trợ năng thông báo hành động
  autoScroll: boolean;
  highlightColor: string;
}

export interface AudiobookExportProgress {
  status: 'idle' | 'generating' | 'zipping' | 'completed' | 'error';
  currentChapter: number;
  totalChapters: number;
  percent: number;
  message: string;
  downloadUrl?: string;
  fileName?: string;
}

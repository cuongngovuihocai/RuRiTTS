import React, { useRef, useEffect } from 'react';
import {
  Book,
  Chapter,
  FontSize,
  PlaybackState,
  ThemeMode,
  VoiceSettings,
} from '../types';
import { FallbackNoticeInfo } from './AudioPlayerBar';
import {
  ChevronLeft,
  ChevronRight,
  Bookmark as BookmarkIcon,
  Sparkles,
  ArrowLeft,
  Share2,
  FolderDown,
  Volume2,
  ListOrdered,
  FileCheck2,
  Loader2,
  Play,
  RotateCcw,
} from 'lucide-react';
import { playSoundCue, speakAnnouncement } from '../services/audioSynthesizer';
import { getThemeConfig } from '../utils/themeStyles';

interface ReaderViewProps {
  book: Book;
  currentChapterIndex: number;
  currentSentenceIndex: number;
  playbackState: PlaybackState;
  fontSize?: FontSize;
  theme: ThemeMode;
  voiceSettings: VoiceSettings;
  isAiCleaning: boolean;
  activeFallbackNotice?: FallbackNoticeInfo | null;
  onSelectChapter: (index: number) => void;
  onSelectSentence: (sentenceIndex: number) => void;
  onToggleBookmark: (chapterIndex: number, sentenceIndex: number) => void;
  onDeepAiClean: () => void;
  onBackToInput: () => void;
  onOpenExporter: () => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  currentChapterIndex,
  currentSentenceIndex,
  playbackState,
  theme,
  voiceSettings,
  isAiCleaning,
  activeFallbackNotice,
  onSelectChapter,
  onSelectSentence,
  onToggleBookmark,
  onDeepAiClean,
  onBackToInput,
  onOpenExporter,
}) => {
  const currentChapter = book.chapters[currentChapterIndex] || book.chapters[0];
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to active sentence when reading
  useEffect(() => {
    if (voiceSettings.autoScroll && activeSentenceRef.current && playbackState === 'playing') {
      activeSentenceRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentSentenceIndex, currentChapterIndex, playbackState, voiceSettings.autoScroll]);

  // Standard Normal Font Size Class
  const getFontSizeClass = () => 'text-lg sm:text-xl leading-relaxed';

  // Check if current sentence is bookmarked
  const isSentenceBookmarked = (chapIdx: number, sentIdx: number) => {
    return book.bookmarks.some(
      (b) => b.chapterIndex === chapIdx && b.sentenceIndex === sentIdx
    );
  };

  const handlePrevChapter = () => {
    if (currentChapterIndex > 0) {
      if (voiceSettings.enableSoundCues) playSoundCue('chapter');
      onSelectChapter(currentChapterIndex - 1);
      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement(`Đã chuyển sang ${book.chapters[currentChapterIndex - 1].title}`, voiceSettings);
      }
    }
  };

  const handleNextChapter = () => {
    if (currentChapterIndex < book.chapters.length - 1) {
      if (voiceSettings.enableSoundCues) playSoundCue('chapter');
      onSelectChapter(currentChapterIndex + 1);
      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement(`Đã chuyển sang ${book.chapters[currentChapterIndex + 1].title}`, voiceSettings);
      }
    }
  };

  const handleSentenceClick = (idx: number) => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    onSelectSentence(idx);
    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement('Bắt đầu đọc từ vị trí này', voiceSettings);
    }
  };

  const themeConfig = getThemeConfig(theme);
  const hlColor = voiceSettings.highlightColor || themeConfig.hex.accent || '#f59e0b';

  return (
    <main
      id="reader-main-view"
      role="main"
      aria-label="Khung đọc sách và văn bản"
      className="w-full max-w-5xl mx-auto px-4 pb-44 pt-4"
    >
      {/* Top Reader Action Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 p-3.5 mb-6 rounded-2xl ${themeConfig.card} ${themeConfig.border} shadow-xl`}>
        <div className="flex items-center gap-2">
          <button
            id="btn-back-to-input"
            type="button"
            onClick={() => {
              if (voiceSettings.enableSoundCues) playSoundCue('click');
              onBackToInput();
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold ${themeConfig.cardInner} ${themeConfig.border} transition-all active:scale-95 hover:opacity-90`}
            aria-label="Quay lại khung nhập sách"
            title="Quay lại nhập tài liệu mới"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Nhập tệp khác</span>
          </button>

          {/* Deep Clean Text */}
          <button
            id="btn-deep-ai-clean"
            type="button"
            onClick={onDeepAiClean}
            disabled={isAiCleaning}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold ${themeConfig.cardInner} ${themeConfig.borderHighlight} transition-all active:scale-95 disabled:opacity-50`}
            title="Sửa triệt để lỗi scan, chính tả, mở rộng từ viết tắt và chuyển số/ngày/đơn vị sang chữ"
            aria-label="Chuẩn hóa chính tả và số liệu"
          >
            {isAiCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span className="hidden sm:inline">Chuẩn hóa chính tả & số</span>
            <span className="sm:hidden">Sửa chữ & số</span>
          </button>
        </div>

        {/* Chapter Navigation Selector */}
        <div className="flex items-center gap-2">
          <button
            id="btn-prev-chapter-top"
            type="button"
            onClick={handlePrevChapter}
            disabled={currentChapterIndex === 0}
            className={`p-2 rounded-xl ${themeConfig.cardInner} ${themeConfig.border} disabled:opacity-30 active:scale-95 transition-all`}
            aria-label="Chương trước"
            title="Chương trước"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <select
            id="select-chapter-dropdown"
            value={currentChapterIndex}
            onChange={(e) => onSelectChapter(Number(e.target.value))}
            className={`px-3 py-2 rounded-xl ${themeConfig.cardInner} ${themeConfig.border} focus:ring-2 cursor-pointer max-w-[200px] sm:max-w-xs truncate text-xs sm:text-sm font-bold`}
            aria-label="Danh sách các chương sách"
          >
            {book.chapters.map((chap, idx) => (
              <option key={chap.id} value={idx}>
                {chap.title}
              </option>
            ))}
          </select>

          <button
            id="btn-next-chapter-top"
            type="button"
            onClick={handleNextChapter}
            disabled={currentChapterIndex >= book.chapters.length - 1}
            className={`p-2 rounded-xl ${themeConfig.cardInner} ${themeConfig.border} disabled:opacity-30 active:scale-95 transition-all`}
            aria-label="Chương tiếp theo"
            title="Chương kế tiếp"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Export Audiobook Shortcut */}
          <button
            id="btn-export-audiobook-top"
            type="button"
            onClick={onOpenExporter}
            className={`p-2 rounded-xl ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} font-bold active:scale-95 transition-all ml-1 shadow-md`}
            title="Xuất file âm thanh (.MP3 / .WAV / ZIP)"
            aria-label="Xuất file âm thanh MP3 hoặc WAV"
          >
            <FolderDown className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Active Fallback Voice Notice Banner */}
      {activeFallbackNotice?.isFallback && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-6 p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-300 shadow-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2"
        >
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div className="text-xs sm:text-sm space-y-0.5">
            <div className="font-bold text-amber-200">
              Đang sử dụng giọng đọc dự phòng: {activeFallbackNotice.fallbackVoiceName}
            </div>
            <div className="text-amber-300/90 leading-relaxed">
              {activeFallbackNotice.fallbackReason ||
                'Máy chủ AI tạm thời bận hoặc quá giới hạn ngạch. Giọng gốc miền Nam sẽ tự động khôi phục khi dịch vụ sẵn sàng.'}
            </div>
          </div>
        </div>
      )}

      {/* Book & Chapter Header Info */}
      <div className="mb-6 space-y-1">
        <h2 className={`text-2xl sm:text-3xl font-black ${themeConfig.isLight ? 'text-amber-900' : 'text-current'} tracking-tight`}>
          {book.title}
        </h2>
        <div className={`flex items-center gap-3 text-xs sm:text-sm ${themeConfig.textSecondary} font-medium`}>
          <span className={`px-2.5 py-0.5 rounded-full ${themeConfig.cardInner} ${themeConfig.border} font-bold`}>
            {currentChapter?.title || 'Chương 1'}
          </span>
          <span>•</span>
          <span>{book.wordCount} từ</span>
        </div>
      </div>

      {/* Auto Resume Saved Reading Position Quick Alert in Reader View */}
      {(book.currentChapterIndex > 0 || book.currentSentenceIndex > 0) && (
        <div className={`mb-5 p-3.5 sm:p-4 rounded-2xl ${themeConfig.cardInner} ${themeConfig.borderHighlight} border-2 flex flex-wrap items-center justify-between gap-3 shadow-md`}>
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            <span className="text-amber-400 text-base sm:text-lg">📍</span>
            <span className={`${themeConfig.textPrimary} font-medium`}>
              Vị trí đọc dở gần nhất: <strong className="font-extrabold text-amber-400">Chương {book.currentChapterIndex + 1}</strong> — <strong className="font-extrabold text-amber-400">Câu {book.currentSentenceIndex + 1}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-auto-resume-reader"
              type="button"
              onClick={() => {
                if (currentChapterIndex !== book.currentChapterIndex) {
                  onSelectChapter(book.currentChapterIndex);
                }
                onSelectSentence(book.currentSentenceIndex);
              }}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow transition-all active:scale-95 flex items-center gap-1.5`}
              aria-label={`Tiếp tục nghe từ câu ${book.currentSentenceIndex + 1}`}
            >
              <Play className="w-3.5 h-3.5 fill-current stroke-[2.5]" />
              <span>Tiếp tục nghe từ câu {book.currentSentenceIndex + 1}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Text Content Area */}
      <div
        ref={containerRef}
        id="book-sentences-container"
        className={`rounded-3xl p-6 sm:p-10 ${themeConfig.card} border-2 ${themeConfig.border} shadow-2xl space-y-4 select-text`}
      >
        <p className={`${getFontSizeClass()} font-normal font-sans tracking-normal leading-relaxed ${themeConfig.textPrimary}`}>
          {currentChapter?.sentences.map((sentence, idx) => {
            const isActive = idx === currentSentenceIndex;
            const isBookmarked = isSentenceBookmarked(currentChapterIndex, idx);

            return (
              <span
                key={sentence.id}
                ref={isActive ? activeSentenceRef : null}
                id={`sent-node-${idx}`}
                onClick={() => handleSentenceClick(idx)}
                style={
                  isActive
                    ? {
                        backgroundColor: `${hlColor}26`,
                        borderBottom: `3px solid ${hlColor}`,
                        boxShadow: `0 0 16px ${hlColor}33`,
                        borderRadius: '6px',
                        padding: '2px 4px',
                        fontWeight: 600,
                      }
                    : undefined
                }
                className={`inline cursor-pointer rounded px-0.5 py-0.5 mr-1.5 transition-all duration-150 relative ${
                  isActive
                    ? 'text-current'
                    : isBookmarked
                    ? 'border-b-2 border-amber-400 font-semibold'
                    : 'hover:opacity-80'
                }`}
                tabIndex={0}
                role="button"
                aria-label={sentence.text}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSentenceClick(idx);
                  }
                }}
              >
                {/* Bookmark indicator tag */}
                {isBookmarked && (
                  <span
                    className="inline-block mr-1 text-amber-400 align-middle text-sm"
                    aria-label="Đã đánh dấu bookmark"
                  >
                    ★
                  </span>
                )}
                {sentence.text}
              </span>
            );
          })}
        </p>
      </div>

      {/* Bottom Chapter Next/Prev Buttons */}
      <div className="flex items-center justify-between gap-4 mt-8">
        <button
          type="button"
          onClick={handlePrevChapter}
          disabled={currentChapterIndex === 0}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl ${themeConfig.cardInner} ${themeConfig.border} font-bold disabled:opacity-30 active:scale-98 transition-all hover:opacity-90`}
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Chương trước</span>
        </button>

        {/* Quick Bookmark Current Sentence */}
        <button
          id="btn-bookmark-current"
          type="button"
          onClick={() => {
            if (voiceSettings.enableSoundCues) playSoundCue('bookmark');
            onToggleBookmark(currentChapterIndex, currentSentenceIndex);
            if (voiceSettings.enableSpokenGuide) {
              const bookmarked = isSentenceBookmarked(currentChapterIndex, currentSentenceIndex);
              speakAnnouncement(
                bookmarked ? 'Đã gỡ đánh dấu câu này.' : 'Đã đánh dấu bookmark câu này.',
                voiceSettings
              );
            }
          }}
          className={`px-4 py-3 rounded-xl ${themeConfig.cardInner} ${themeConfig.borderHighlight} font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow`}
          title="Đánh dấu câu đang đọc"
          aria-label="Đánh dấu câu đang đọc"
        >
          <BookmarkIcon className="w-5 h-5 fill-amber-400/20 text-amber-400" />
          <span className="hidden sm:inline">Đánh dấu câu</span>
        </button>

        <button
          type="button"
          onClick={handleNextChapter}
          disabled={currentChapterIndex >= book.chapters.length - 1}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl ${themeConfig.cardInner} ${themeConfig.border} font-bold disabled:opacity-30 active:scale-98 transition-all hover:opacity-90`}
        >
          <span>Chương tiếp theo</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </main>
  );
};

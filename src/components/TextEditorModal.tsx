import React, { useState, useEffect } from 'react';
import {
  X,
  PencilLine,
  Save,
  Play,
  RotateCcw,
  Search,
  Replace,
  CheckCircle2,
} from 'lucide-react';
import { Book, ThemeMode, VoiceSettings } from '../types';
import { getThemeConfig } from '../utils/themeStyles';
import { playSoundCue } from '../services/audioSynthesizer';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  currentChapterIndex: number;
  voiceSettings: VoiceSettings;
  theme: ThemeMode;
  onSaveChapter: (
    chapterIndex: number,
    newContent: string,
    playAfterSave?: boolean
  ) => Promise<void>;
  onReplaceInBook: (
    findText: string,
    replaceText: string,
    caseSensitive: boolean,
    scope: 'chapter' | 'book'
  ) => Promise<number>;
}

export const TextEditorModal: React.FC<TextEditorModalProps> = ({
  isOpen,
  onClose,
  book,
  currentChapterIndex,
  voiceSettings,
  theme,
  onSaveChapter,
  onReplaceInBook,
}) => {
  const themeConfig = getThemeConfig(theme);
  const chapter = book.chapters[currentChapterIndex] || book.chapters[0];
  const sentences = chapter?.sentences || [];

  const [chapterDraft, setChapterDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Find & Replace states
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceScope, setReplaceScope] = useState<'chapter' | 'book'>('chapter');

  useEffect(() => {
    if (!isOpen || !chapter) return;
    setChapterDraft(chapter.content || sentences.map((s) => s.text).join('\n\n'));
    setFeedbackMsg(null);
  }, [isOpen, currentChapterIndex]);

  // Sync chapter draft when chapter content changes via Find & Replace
  useEffect(() => {
    if (!isOpen || !chapter) return;
    setChapterDraft(chapter.content || sentences.map((s) => s.text).join('\n\n'));
  }, [chapter?.content]);

  if (!isOpen || !chapter) return null;

  const originalChapterText = chapter.content || sentences.map((s) => s.text).join('\n\n');
  const isChapterDirty = chapterDraft.trim() !== originalChapterText.trim();

  const handleCommitChapter = async (playAfterSave = false) => {
    if (isSaving || !chapterDraft.trim()) return;
    setIsSaving(true);
    setFeedbackMsg(null);
    try {
      await onSaveChapter(currentChapterIndex, chapterDraft, playAfterSave);
      if (voiceSettings.enableSoundCues) playSoundCue('success');
      if (playAfterSave) {
        onClose();
      } else {
        setFeedbackMsg(`Đã lưu toàn bộ nội dung chương "${chapter.title}".`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkReplace = async () => {
    if (!findQuery) return;
    setIsSaving(true);
    setFeedbackMsg(null);
    try {
      const count = await onReplaceInBook(findQuery, replaceQuery, caseSensitive, replaceScope);
      if (count > 0) {
        if (voiceSettings.enableSoundCues) playSoundCue('success');
        setFeedbackMsg(
          `Đã thay thế ${count} vị trí "${findQuery}" → "${replaceQuery}" (${
            replaceScope === 'book' ? 'cả cuốn sách' : 'chương hiện tại'
          }).`
        );
      } else {
        setFeedbackMsg(
          `Không tìm thấy từ "${findQuery}" trong ${
            replaceScope === 'book' ? 'cả cuốn sách' : 'chương hiện tại'
          }.`
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="text-editor-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className={`${themeConfig.card} border-2 ${themeConfig.border} rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ${themeConfig.textPrimary}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 sm:p-5 border-b ${themeConfig.border} ${themeConfig.cardInner}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${themeConfig.accent} ${themeConfig.accentText} flex items-center justify-center font-black`}>
              <PencilLine className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2
                id="text-editor-modal-title"
                className="text-base sm:text-xl font-black"
                style={{ color: themeConfig.hex.accent }}
              >
                Sửa chính tả &amp; Thay thế nội dung
              </h2>
              <p className={`text-xs ${themeConfig.textSecondary} truncate max-w-[230px] sm:max-w-md`}>
                {chapter.title} · Sửa trực tiếp nội dung chương hoặc thay thế hàng loạt
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl ${themeConfig.card} ${themeConfig.border} border ${themeConfig.textSecondary} hover:${themeConfig.textPrimary} transition-all`}
            aria-label="Đóng khung sửa chính tả"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {feedbackMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {/* Find & Replace Tool */}
          <div className={`p-3.5 rounded-2xl ${themeConfig.cardInner} border ${themeConfig.border} space-y-3`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span
                className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: themeConfig.hex.accent }}
              >
                <Replace className="w-4 h-4" />
                Tìm &amp; Thay thế hàng loạt
              </span>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setReplaceScope('chapter')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    replaceScope === 'chapter'
                      ? `${themeConfig.accent} ${themeConfig.accentText}`
                      : `${themeConfig.card} ${themeConfig.textSecondary} border ${themeConfig.border}`
                  }`}
                >
                  Chương này
                </button>
                <button
                  type="button"
                  onClick={() => setReplaceScope('book')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    replaceScope === 'book'
                      ? `${themeConfig.accent} ${themeConfig.accentText}`
                      : `${themeConfig.card} ${themeConfig.textSecondary} border ${themeConfig.border}`
                  }`}
                >
                  Cả cuốn sách ({book.chapters.length} chương)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="relative">
                <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${themeConfig.textSecondary}`} />
                <input
                  type="text"
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  placeholder="Từ bị sai (vd: ko, Hoang...)"
                  className={`w-full pl-8 pr-3 py-2 rounded-xl ${themeConfig.card} border ${themeConfig.border} text-xs sm:text-sm ${themeConfig.textPrimary} focus:outline-none`}
                />
              </div>
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Thay bằng từ đúng (vd: không, Hoàng...)"
                className={`w-full px-3 py-2 rounded-xl ${themeConfig.card} border ${themeConfig.border} text-xs sm:text-sm ${themeConfig.textPrimary} focus:outline-none`}
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className={`flex items-center gap-2 text-xs ${themeConfig.textSecondary} cursor-pointer select-none`}>
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                <span>Phân biệt chữ HOA / thường</span>
              </label>

              <button
                type="button"
                onClick={handleBulkReplace}
                disabled={!findQuery || isSaving}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black ${themeConfig.accent} ${themeConfig.accentText} disabled:opacity-40 active:scale-95 transition-all`}
              >
                Thay thế tất cả
              </button>
            </div>
          </div>

          {/* Full Chapter Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="chapter-edit-textarea"
                className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider`}
              >
                Nội dung chương: {chapter.title}
              </label>
              {isChapterDirty && (
                <button
                  type="button"
                  onClick={() => setChapterDraft(originalChapterText)}
                  className={`flex items-center gap-1 text-xs font-bold ${themeConfig.textSecondary} hover:${themeConfig.textPrimary}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khôi phục bản gốc</span>
                </button>
              )}
            </div>

            <textarea
              id="chapter-edit-textarea"
              value={chapterDraft}
              onChange={(e) => setChapterDraft(e.target.value)}
              rows={12}
              placeholder="Chỉnh sửa nội dung toàn bộ chương tại đây..."
              className={`w-full p-4 rounded-2xl ${themeConfig.cardInner} border-2 ${themeConfig.border} text-sm sm:text-base leading-relaxed ${themeConfig.textPrimary} focus:outline-none focus:ring-2 resize-y`}
              style={{ '--tw-ring-color': themeConfig.hex.accent } as React.CSSProperties}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => handleCommitChapter(false)}
              disabled={isSaving || !isChapterDirty || !chapterDraft.trim()}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold ${themeConfig.cardInner} border ${themeConfig.border} hover:opacity-90 disabled:opacity-40 transition-all`}
            >
              <Save className="w-4 h-4" />
              <span>Lưu nội dung chương</span>
            </button>

            <button
              type="button"
              onClick={() => handleCommitChapter(true)}
              disabled={isSaving || !chapterDraft.trim()}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-md active:scale-95 disabled:opacity-40 transition-all`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Lưu &amp; Đọc từ đầu chương</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-t ${themeConfig.border} ${themeConfig.cardInner}`}>
          <span className={`text-[11px] sm:text-xs ${themeConfig.textSecondary}`}>
            Mọi thay đổi được lưu trực tiếp vào sách và áp dụng ngay khi đọc &amp; xuất Audiobook.
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${themeConfig.card} border ${themeConfig.border} ${themeConfig.textPrimary} hover:opacity-90`}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

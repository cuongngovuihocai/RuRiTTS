import React, { useState, useEffect } from 'react';
import {
  X,
  PencilLine,
  ChevronLeft,
  ChevronRight,
  Save,
  Play,
  RotateCcw,
  Search,
  Replace,
  FileText,
  ListChecks,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { Book, ThemeMode, VoiceSettings } from '../types';
import { getThemeConfig } from '../utils/themeStyles';
import { playSoundCue } from '../services/audioSynthesizer';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  currentChapterIndex: number;
  initialSentenceIndex: number;
  initialTab?: 'sentence' | 'chapter';
  voiceSettings: VoiceSettings;
  theme: ThemeMode;
  onSaveSentence: (
    chapterIndex: number,
    sentenceIndex: number,
    newText: string,
    playAfterSave?: boolean
  ) => Promise<void>;
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
  initialSentenceIndex,
  initialTab = 'sentence',
  voiceSettings,
  theme,
  onSaveSentence,
  onSaveChapter,
  onReplaceInBook,
}) => {
  const themeConfig = getThemeConfig(theme);
  const chapter = book.chapters[currentChapterIndex] || book.chapters[0];
  const sentences = chapter?.sentences || [];

  const [activeTab, setActiveTab] = useState<'sentence' | 'chapter'>(initialTab);
  const [selectedSentIdx, setSelectedSentIdx] = useState(initialSentenceIndex);
  const [sentenceDraft, setSentenceDraft] = useState('');
  const [chapterDraft, setChapterDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Find & Replace states
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceScope, setReplaceScope] = useState<'chapter' | 'book'>('chapter');

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    const safeIdx = Math.max(0, Math.min(initialSentenceIndex, Math.max(0, sentences.length - 1)));
    setSelectedSentIdx(safeIdx);
    setSentenceDraft(sentences[safeIdx]?.text || '');
    setChapterDraft(chapter?.content || sentences.map((s) => s.text).join('\n\n'));
    setFeedbackMsg(null);
  }, [isOpen, initialTab, initialSentenceIndex, currentChapterIndex]);

  // Keep drafts synced when navigating or when sentences update (e.g., after Find & Replace or delete)
  useEffect(() => {
    if (!isOpen) return;
    const safeIdx = Math.max(0, Math.min(selectedSentIdx, Math.max(0, sentences.length - 1)));
    if (safeIdx !== selectedSentIdx) {
      setSelectedSentIdx(safeIdx);
    }
    setSentenceDraft(sentences[safeIdx]?.text || '');
  }, [selectedSentIdx, chapter?.id, sentences.length, sentences[selectedSentIdx]?.text]);

  // Sync chapter draft if book updates via Find & Replace or sentence edits
  useEffect(() => {
    if (!isOpen) return;
    setChapterDraft(chapter?.content || sentences.map((s) => s.text).join('\n\n'));
  }, [chapter?.content]);

  if (!isOpen || !chapter) return null;

  const originalSentenceText = sentences[selectedSentIdx]?.text || '';
  const originalChapterText = chapter.content || sentences.map((s) => s.text).join('\n\n');
  const isSentenceDirty = sentenceDraft.trim() !== originalSentenceText.trim();
  const isChapterDirty = chapterDraft.trim() !== originalChapterText.trim();

  const handleSelectSentenceIndex = (idx: number) => {
    if (idx < 0 || idx >= sentences.length) return;
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    setSelectedSentIdx(idx);
    setSentenceDraft(sentences[idx]?.text || '');
    setFeedbackMsg(null);
  };

  const handleCommitSentence = async (playAfterSave = false) => {
    if (isSaving) return;
    setIsSaving(true);
    setFeedbackMsg(null);
    try {
      await onSaveSentence(currentChapterIndex, selectedSentIdx, sentenceDraft, playAfterSave);
      if (voiceSettings.enableSoundCues) playSoundCue('success');
      if (playAfterSave) {
        onClose();
      } else {
        setFeedbackMsg(
          sentenceDraft.trim()
            ? `Đã lưu chỉnh sửa câu ${selectedSentIdx + 1}.`
            : `Đã xóa câu ${selectedSentIdx + 1} khỏi chương.`
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

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
            replaceScope === 'book' ? 'toàn bộ sách' : 'chương hiện tại'
          }).`
        );
      } else {
        setFeedbackMsg(`Không tìm thấy từ "${findQuery}" trong ${replaceScope === 'book' ? 'toàn bộ sách' : 'chương hiện tại'}.`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Upcoming sentences preview (current + next 8 sentences for quick jump)
  const upcomingSentences = sentences.slice(selectedSentIdx, selectedSentIdx + 8);

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
                Chỉnh sửa chính tả & nội dung
              </h2>
              <p className={`text-xs ${themeConfig.textSecondary} truncate max-w-[230px] sm:max-w-md`}>
                {chapter.title} · Sửa ngay câu đang đọc hoặc các câu sắp tới
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl ${themeConfig.card} ${themeConfig.border} border ${themeConfig.textSecondary} hover:${themeConfig.textPrimary} transition-all`}
            aria-label="Đóng khung chỉnh sửa chính tả"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className={`px-4 sm:px-6 pt-3 pb-2 border-b ${themeConfig.border} flex items-center gap-2`}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('sentence');
              setFeedbackMsg(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'sentence'
                ? `${themeConfig.accent} ${themeConfig.accentText} shadow`
                : `${themeConfig.cardInner} ${themeConfig.textSecondary} border ${themeConfig.border}`
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span>Sửa từng câu ({selectedSentIdx + 1}/{Math.max(1, sentences.length)})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('chapter');
              setFeedbackMsg(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'chapter'
                ? `${themeConfig.accent} ${themeConfig.accentText} shadow`
                : `${themeConfig.cardInner} ${themeConfig.textSecondary} border ${themeConfig.border}`
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Sửa cả chương & Thay thế</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Feedback Toast */}
          {feedbackMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {activeTab === 'sentence' ? (
            <div className="space-y-4">
              {/* Sentence Navigator */}
              <div className={`flex items-center justify-between gap-2 p-2.5 rounded-2xl ${themeConfig.cardInner} border ${themeConfig.border}`}>
                <button
                  type="button"
                  onClick={() => handleSelectSentenceIndex(selectedSentIdx - 1)}
                  disabled={selectedSentIdx <= 0}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold ${themeConfig.card} border ${themeConfig.border} disabled:opacity-35 active:scale-95 transition-all`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Câu trước</span>
                </button>

                <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
                  <span>
                    Câu {selectedSentIdx + 1} / {sentences.length}
                  </span>
                  {selectedSentIdx === initialSentenceIndex && (
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase"
                      style={{
                        backgroundColor: `${themeConfig.hex.accent}25`,
                        color: themeConfig.hex.accent,
                      }}
                    >
                      Đang chọn đọc
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectSentenceIndex(selectedSentIdx + 1)}
                  disabled={selectedSentIdx >= sentences.length - 1}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold ${themeConfig.card} border ${themeConfig.border} disabled:opacity-35 active:scale-95 transition-all`}
                >
                  <span>Câu sắp tới</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Previous Sentence Context */}
              {selectedSentIdx > 0 && sentences[selectedSentIdx - 1] && (
                <div className={`px-3.5 py-2 rounded-xl ${themeConfig.cardInner} border ${themeConfig.border} opacity-70 text-xs`}>
                  <span className={`font-bold ${themeConfig.textSecondary} mr-1.5`}>Câu trước:</span>
                  <span>{sentences[selectedSentIdx - 1].text}</span>
                </div>
              )}

              {/* Active Editable Textarea */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="sentence-edit-textarea"
                    className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider`}
                  >
                    Nội dung câu {selectedSentIdx + 1}
                  </label>
                  <div className="flex items-center gap-2">
                    {isSentenceDirty && (
                      <button
                        type="button"
                        onClick={() => setSentenceDraft(originalSentenceText)}
                        className={`flex items-center gap-1 text-xs font-bold ${themeConfig.textSecondary} hover:${themeConfig.textPrimary}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Hoàn tác</span>
                      </button>
                    )}
                    {sentences.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSentenceDraft('')}
                        className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300"
                        title="Xóa trắng để bỏ qua câu rác này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa câu rác</span>
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  id="sentence-edit-textarea"
                  value={sentenceDraft}
                  onChange={(e) => setSentenceDraft(e.target.value)}
                  rows={4}
                  placeholder="Nhập nội dung đúng chính tả cho câu này (hoặc để trống để xóa câu thừa)..."
                  className={`w-full p-4 rounded-2xl ${themeConfig.cardInner} border-2 ${themeConfig.borderHighlight} text-base sm:text-lg leading-relaxed ${themeConfig.textPrimary} focus:outline-none focus:ring-2 resize-y`}
                  style={{ '--tw-ring-color': themeConfig.hex.accent } as React.CSSProperties}
                />

                <p className={`text-[11px] ${themeConfig.textSecondary}`}>
                  Mẹo: Bạn có thể thêm dấu phẩy để giọng đọc ngắt nghỉ tự nhiên hơn, hoặc viết lại phiên âm cho từ tiếng Anh / tên riêng bị đọc ngọng.
                </p>
              </div>

              {/* Action buttons for current sentence */}
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCommitSentence(false)}
                  disabled={isSaving || !isSentenceDirty}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold ${themeConfig.cardInner} border ${themeConfig.border} hover:opacity-90 disabled:opacity-40 transition-all`}
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu câu này</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCommitSentence(true)}
                  disabled={isSaving}
                  className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-md active:scale-95 disabled:opacity-40 transition-all`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isSentenceDirty ? 'Lưu & Nghe thử ngay' : 'Nghe câu này'}</span>
                </button>
              </div>

              {/* Quick Preview of Upcoming Sentences */}
              {upcomingSentences.length > 1 && (
                <div className={`pt-3 border-t ${themeConfig.border} space-y-2`}>
                  <div className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider`}>
                    Các câu sắp đọc tiếp theo (bấm để chọn sửa nhanh):
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {upcomingSentences.slice(1).map((s, offset) => {
                      const targetIdx = selectedSentIdx + 1 + offset;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectSentenceIndex(targetIdx)}
                          className={`w-full text-left p-2.5 rounded-xl ${themeConfig.cardInner} border ${themeConfig.border} hover:opacity-90 transition-all flex items-start gap-2.5 text-xs sm:text-sm`}
                        >
                          <span
                            className="px-1.5 py-0.5 rounded font-black text-[10px] flex-shrink-0 mt-0.5"
                            style={{
                              backgroundColor: `${themeConfig.hex.accent}20`,
                              color: themeConfig.hex.accent,
                            }}
                          >
                            #{targetIdx + 1}
                          </span>
                          <span className="line-clamp-2">{s.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Find & Replace Tool */}
              <div className={`p-3.5 rounded-2xl ${themeConfig.cardInner} border ${themeConfig.border} space-y-3`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: themeConfig.hex.accent }}>
                    <Replace className="w-4 h-4" />
                    Tìm &amp; Sửa hàng loạt từ sai chính tả
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
                  rows={11}
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
          )}
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

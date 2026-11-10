import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  BookA,
  Search,
} from 'lucide-react';
import { CustomDictionaryEntry, VoiceSettings, ThemeMode } from '../types';
import { playSoundCue } from '../services/audioSynthesizer';
import { DEFAULT_DICTIONARY } from '../services/db';
import { cleanVietnameseTextOffline } from '../services/textCleaner';
import { getThemeConfig } from '../utils/themeStyles';

interface DictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  dictionary: CustomDictionaryEntry[];
  onSaveDictionary: (entries: CustomDictionaryEntry[]) => void;
  voiceSettings: VoiceSettings;
  theme?: ThemeMode;
}

export const DictionaryModal: React.FC<DictionaryModalProps> = ({
  isOpen,
  onClose,
  dictionary,
  onSaveDictionary,
  voiceSettings,
  theme = 'dark-stone',
}) => {
  const themeConfig = getThemeConfig(theme as ThemeMode);
  const [entries, setEntries] = useState<CustomDictionaryEntry[]>(dictionary);
  const [newWord, setNewWord] = useState('');
  const [newReplaceWith, setNewReplaceWith] = useState('');
  const [testInput, setTestInput] = useState('BS. Nguyễn Văn An khuyên ko nên lo lắng');
  const [testOutput, setTestOutput] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEntries(dictionary);
    }
  }, [dictionary, isOpen]);

  if (!isOpen) return null;

  const handleAddEntry = () => {
    if (!newWord.trim() || !newReplaceWith.trim()) return;
    if (voiceSettings.enableSoundCues) playSoundCue('click');

    const updated = [
      ...entries,
      {
        id: `dict_${Date.now()}`,
        word: newWord.trim(),
        replaceWith: newReplaceWith.trim(),
      },
    ];

    setEntries(updated);
    onSaveDictionary(updated);
    setNewWord('');
    setNewReplaceWith('');
  };

  const handleDeleteEntry = (id: string) => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    onSaveDictionary(updated);
  };

  const handleResetDefaults = () => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    if (!showResetConfirm) {
      setShowResetConfirm(true);
      setTimeout(() => setShowResetConfirm(false), 3500);
      return;
    }
    setEntries(DEFAULT_DICTIONARY);
    onSaveDictionary(DEFAULT_DICTIONARY);
    setShowResetConfirm(false);
  };

  const runTestPreview = () => {
    const result = cleanVietnameseTextOffline(testInput, entries);
    setTestOutput(result);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dict-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className={`${themeConfig.card} border-2 ${themeConfig.border} rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ${themeConfig.textPrimary}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${themeConfig.border} ${themeConfig.cardInner}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${themeConfig.accent} ${themeConfig.accentText} flex items-center justify-center font-black`}>
              <BookA className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 id="dict-modal-title" className="text-lg sm:text-xl font-black" style={{ color: themeConfig.hex.accent }}>
                Từ điển phát âm & Viết tắt tiếng Việt
              </h2>
              <p className={`text-xs ${themeConfig.textSecondary}`}>
                Tự động thay thế các từ viết tắt, teencode hoặc biệt ngữ trước khi đọc ({entries.length} mục)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl ${themeConfig.card} ${themeConfig.border} border ${themeConfig.textSecondary} hover:${themeConfig.textPrimary} transition-all`}
            aria-label="Đóng từ điển"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Add New Entry Box */}
          <div className={`p-4 rounded-2xl ${themeConfig.cardInner} border ${themeConfig.border} space-y-3`}>
            <label className="text-xs font-bold uppercase tracking-wider block" style={{ color: themeConfig.hex.accent }}>
              Thêm từ viết tắt / quy tắc mới
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Từ viết tắt (VD: AI, IoT, SG)"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                className={`flex-1 px-3 py-2 text-xs sm:text-sm rounded-xl ${themeConfig.inputBg} border ${themeConfig.inputBorder} ${themeConfig.inputText} outline-none`}
              />
              <input
                type="text"
                placeholder="Đọc thành (VD: Trí tuệ nhân tạo, Sài Gòn)"
                value={newReplaceWith}
                onChange={(e) => setNewReplaceWith(e.target.value)}
                className={`flex-1 px-3 py-2 text-xs sm:text-sm rounded-xl ${themeConfig.inputBg} border ${themeConfig.inputBorder} ${themeConfig.inputText} outline-none`}
              />
              <button
                type="button"
                onClick={handleAddEntry}
                disabled={!newWord.trim() || !newReplaceWith.trim()}
                className={`px-4 py-2 rounded-xl ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50`}
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Thêm</span>
              </button>
            </div>
          </div>

          {/* Test Sandbox Box */}
          <div className={`p-4 rounded-2xl ${themeConfig.cardSubtle} border ${themeConfig.border} space-y-2`}>
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider`}>
                Thử nghiệm quy tắc phát âm
              </label>
              <button
                type="button"
                onClick={runTestPreview}
                className="text-xs font-bold hover:underline"
                style={{ color: themeConfig.hex.accent }}
              >
                Chạy thử nghiệm
              </button>
            </div>
            <input
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs rounded-lg ${themeConfig.inputBg} border ${themeConfig.inputBorder} ${themeConfig.inputText} outline-none`}
            />
            {testOutput && (
              <div
                className="text-xs p-2 rounded-lg border"
                style={{
                  backgroundColor: `${themeConfig.hex.accent}15`,
                  borderColor: `${themeConfig.hex.accent}40`,
                  color: themeConfig.hex.accent,
                }}
              >
                <strong>Kết quả đọc:</strong> "{testOutput}"
              </div>
            )}
          </div>

          {/* Existing Rules List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider`}>
                Danh sách từ điển hiện có
              </label>
              <button
                type="button"
                onClick={handleResetDefaults}
                className={`text-xs ${
                  showResetConfirm
                    ? 'text-red-400 font-bold animate-pulse'
                    : `${themeConfig.textSecondary} hover:${themeConfig.textPrimary}`
                } flex items-center gap-1 transition-colors`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{showResetConfirm ? 'Bấm lại để xác nhận khôi phục' : 'Khôi phục mặc định'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl ${themeConfig.cardInner} border ${themeConfig.border} text-xs`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-black" style={{ color: themeConfig.hex.accent }}>"{entry.word}"</span>
                    <span className={`${themeConfig.textSecondary} mx-1.5`}>➔</span>
                    <span className={`${themeConfig.textPrimary} font-medium`}>"{entry.replaceWith}"</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEntry(entry.id);
                    }}
                    className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/15 ml-2 transition-all cursor-pointer"
                    title={`Xóa quy tắc "${entry.word}"`}
                    aria-label={`Xóa quy tắc ${entry.word}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${themeConfig.border} ${themeConfig.cardInner} flex justify-end`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-md transition-all active:scale-95`}
          >
            Lưu & Hoàn tất
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Trash2,
  Play,
  Search,
  Calendar,
  Layers,
  FileText,
  Clock,
  HardDrive,
} from 'lucide-react';
import { Book, VoiceSettings, ThemeMode } from '../types';
import { playSoundCue, speakAnnouncement } from '../services/audioSynthesizer';
import { getThemeConfig } from '../utils/themeStyles';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  onSelectBook: (book: Book) => void;
  onDeleteBook: (id: string) => void;
  voiceSettings: VoiceSettings;
  theme?: ThemeMode;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({
  isOpen,
  onClose,
  books,
  onSelectBook,
  onDeleteBook,
  voiceSettings,
  theme = 'dark-stone',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const themeConfig = getThemeConfig(theme as ThemeMode);

  if (!isOpen) return null;

  const filteredBooks = books.filter((b) =>
    b.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenBook = (book: Book) => {
    if (voiceSettings.enableSoundCues) playSoundCue('play');
    onSelectBook(book);
    onClose();
  };

  const handleConfirmDelete = (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    onDeleteBook(bookId);
    setDeleteConfirmId(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className={`${themeConfig.card} border-2 ${themeConfig.border} rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ${themeConfig.textPrimary}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${themeConfig.border} ${themeConfig.cardInner}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${themeConfig.accent} ${themeConfig.accentText} flex items-center justify-center font-black`}>
              <BookOpen className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 id="library-modal-title" className="text-lg sm:text-xl font-black" style={{ color: themeConfig.hex.accent }}>
                Thư viện Sách nói đã lưu
              </h2>
              <p className={`text-xs ${themeConfig.textSecondary}`}>
                Lưu trữ ngoại tuyến an toàn trên thiết bị ({books.length} tác phẩm)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl ${themeConfig.card} ${themeConfig.border} border ${themeConfig.textSecondary} hover:${themeConfig.textPrimary} transition-all`}
            aria-label="Đóng thư viện"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className={`p-4 border-b ${themeConfig.border} ${themeConfig.cardSubtle}`}>
          <div className="relative">
            <Search className={`w-4 h-4 ${themeConfig.textSecondary} absolute left-3.5 top-1/2 -translate-y-1/2`} />
            <input
              type="text"
              placeholder="Tìm kiếm tác phẩm theo tên..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl ${themeConfig.inputBg} border ${themeConfig.inputBorder} ${themeConfig.inputText} outline-none`}
            />
          </div>
        </div>

        {/* Book List Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {filteredBooks.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <HardDrive className={`w-12 h-12 ${themeConfig.textSecondary} opacity-40 mx-auto stroke-1`} />
              <p className={`${themeConfig.textSecondary} text-sm font-semibold`}>
                {searchQuery ? 'Không tìm thấy sách nào khớp với từ khóa.' : 'Thư viện chưa có tác phẩm nào.'}
              </p>
              <p className={`text-xs ${themeConfig.textSecondary} opacity-70`}>
                Hãy dán văn bản, tải tệp hoặc quét ảnh sách để lưu vào thư viện nghe offline.
              </p>
            </div>
          ) : (
            filteredBooks.map((book) => (
              <div
                key={book.id}
                onClick={() => handleOpenBook(book)}
                className={`p-4 rounded-2xl ${themeConfig.cardInner} hover:opacity-95 border ${themeConfig.border} hover:border-amber-400 cursor-pointer transition-all flex items-center justify-between gap-4 group active:scale-99`}
                role="button"
                tabIndex={0}
                aria-label={`Mở sách ${book.title}, ${book.chapters.length} chương, ${book.wordCount} từ`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-xl ${themeConfig.card} ${themeConfig.border} border flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-105`} style={{ color: themeConfig.hex.accent }}>
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm sm:text-base font-bold ${themeConfig.textPrimary} truncate`}>
                      {book.title}
                    </h3>
                    <div className={`flex items-center gap-3 text-xs ${themeConfig.textSecondary} mt-1 flex-wrap`}>
                      <span className="flex items-center gap-1 font-semibold" style={{ color: themeConfig.hex.accent }}>
                        <Layers className="w-3.5 h-3.5" />
                        {book.chapters.length} chương
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {book.wordCount} từ
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(book.updatedAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    {(book.currentChapterIndex > 0 || book.currentSentenceIndex > 0) && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold">
                        <span>📍 Vị trí dở: Chương {book.currentChapterIndex + 1}, Câu {book.currentSentenceIndex + 1}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {deleteConfirmId === book.id ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleConfirmDelete(e, book.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow"
                        title="Xác nhận xóa cuốn sách này"
                      >
                        Xóa
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(null);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg ${themeConfig.cardInner} ${themeConfig.border} border text-xs font-semibold hover:opacity-80`}
                        title="Hủy xóa"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(book.id);
                      }}
                      className="p-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                      title="Xóa sách này"
                      aria-label={`Xóa sách ${book.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${themeConfig.border} ${themeConfig.cardInner} flex justify-end`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-md transition-all active:scale-95`}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

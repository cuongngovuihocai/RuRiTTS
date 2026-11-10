import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { VoiceSettings, ThemeMode } from '../types';
import { playSoundCue } from '../services/audioSynthesizer';
import { getThemeConfig } from '../utils/themeStyles';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceSettings: VoiceSettings;
  theme?: ThemeMode;
}

const SHORTCUTS = [
  { key: 'Phím Cách (Space)', action: 'Phát / Tạm dừng đọc sách', desc: 'Bật hoặc ngắt giọng đọc ngay tức thì' },
  { key: 'Mũi tên Trái (←)', action: 'Lùi lại 1 câu', desc: 'Nghe lại câu vừa đọc' },
  { key: 'Mũi tên Phải (→)', action: 'Tiến tới 1 câu tiếp theo', desc: 'Bỏ qua câu hiện tại' },
  { key: 'Mũi tên Lên (↑)', action: 'Tăng tốc độ đọc (+0.25x)', desc: 'Đọc nhanh hơn' },
  { key: 'Mũi tên Xuống (↓)', action: 'Giảm tốc độ đọc (-0.25x)', desc: 'Đọc chậm lại' },
  { key: 'Phím B', action: 'Đánh dấu câu (Bookmark)', desc: 'Lưu vị trí câu yêu thích' },
  { key: 'Phím C', action: 'Làm sạch văn bản', desc: 'Xóa ký tự rác và mở rộng từ viết tắt' },
  { key: 'Phím V', action: 'Cài đặt giọng đọc & giao diện', desc: 'Mở danh sách giọng đọc & cài đặt giao diện' },
  { key: 'Phím H hoặc ?', action: 'Mở bảng trợ giúp phím tắt này', desc: 'Hỗ trợ thao tác bằng bàn phím' },
  { key: 'Phím Esc', action: 'Đóng cửa sổ phụ', desc: 'Trở về màn hình chính' },
];

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({
  isOpen,
  onClose,
  voiceSettings,
  theme = 'dark-stone',
}) => {
  const themeConfig = getThemeConfig(theme as ThemeMode);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className={`${themeConfig.card} border-2 ${themeConfig.border} rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ${themeConfig.textPrimary}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${themeConfig.border} ${themeConfig.cardInner}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${themeConfig.accent} ${themeConfig.accentText} flex items-center justify-center font-black`}>
              <Keyboard className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 id="shortcuts-modal-title" className="text-lg sm:text-xl font-black" style={{ color: themeConfig.hex.accent }}>
                Bảng phím tắt trợ năng
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl ${themeConfig.card} ${themeConfig.border} border ${themeConfig.textSecondary} hover:${themeConfig.textPrimary} transition-all`}
            aria-label="Đóng bảng phím tắt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>



        {/* Shortcut Items List */}
        <div className="p-5 overflow-y-auto space-y-2.5 flex-1">
          {SHORTCUTS.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-start justify-between gap-4 p-2.5 rounded-xl ${themeConfig.cardInner} border ${themeConfig.border}`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-bold ${themeConfig.textPrimary}`}>{item.action}</div>
                <div className={`text-xs ${themeConfig.textSecondary} mt-0.5`}>{item.desc}</div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg ${themeConfig.card} border ${themeConfig.border} font-mono text-xs font-bold flex-shrink-0 shadow-inner`}
                style={{ color: themeConfig.hex.accent }}
              >
                {item.key}
              </span>
            </div>
          ))}
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

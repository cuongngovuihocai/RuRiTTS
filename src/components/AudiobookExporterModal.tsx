import React, { useState } from 'react';
import JSZip from 'jszip';
import {
  X,
  FolderDown,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  FileArchive,
  Music,
  Zap,
} from 'lucide-react';
import { Book, VoiceSettings } from '../types';
import {
  audioBufferToMp3Blob,
  audioBufferToWavBlob,
  base64ToBlob,
  createMp3BlobFromPcmBase64,
  createWavBlobFromPcmBase64,
  decodeAudioBase64,
  getEmotionAcoustics,
  playSoundCue,
  speakAnnouncement,
} from '../services/audioSynthesizer';
import {
  generateEdgeSpeech,
  generateGoogleTranslateSpeech,
  isStaticHosting,
} from '../services/geminiService';
import { ThemeMode } from '../types';
import { getThemeConfig } from '../utils/themeStyles';

interface AudiobookExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  voiceSettings: VoiceSettings;
  isOffline: boolean;
  theme?: ThemeMode;
}

export const AudiobookExporterModal: React.FC<AudiobookExporterModalProps> = ({
  isOpen,
  onClose,
  book,
  voiceSettings,
  isOffline,
  theme = 'elegant-dark',
}) => {
  const themeConfig = getThemeConfig(theme as ThemeMode);
  const isMultiChapter = book.chapters.length > 1;
  const [exportScope, setExportScope] = useState<'single_full' | 'current' | 'zip_chapters'>(
    isMultiChapter ? 'single_full' : 'current'
  );
  const [exportFormat, setExportFormat] = useState<'mp3' | 'wav'>('mp3');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState({
    status: 'idle', // 'idle' | 'generating' | 'zipping' | 'completed' | 'error'
    currentChapter: 0,
    totalChapters: 0,
    message: '',
    downloadUrl: '',
    fileName: '',
  });

  if (!isOpen) return null;

  const currentChapter = book.chapters[book.currentChapterIndex] || book.chapters[0];

  // Synthesize text to MP3 or WAV Blob using Edge Neural, Google Translate, or Gemini
  const synthesizeTextToAudio = async (
    text: string,
    format: 'mp3' | 'wav'
  ): Promise<Blob> => {
    const emotionAcoustics = getEmotionAcoustics(voiceSettings.emotion);
    const effectiveRate = Math.max(0.5, Math.min(3.0, voiceSettings.rate * emotionAcoustics.rateMultiplier));
    const effectivePitch = Math.max(0.5, Math.min(1.5, voiceSettings.pitch * emotionAcoustics.pitchMultiplier));
    const effectiveVolume = Math.max(0, Math.min(1.0, voiceSettings.volume * emotionAcoustics.volumeMultiplier));

    if (!isStaticHosting() && voiceSettings.engine === 'edge' && !isOffline) {
      try {
        const res = await generateEdgeSpeech(
          text,
          voiceSettings.voiceId,
          effectiveRate,
          effectivePitch,
          effectiveVolume
        );
        if (format === 'mp3') {
          return base64ToBlob(res.audioBase64, 'audio/mp3');
        } else {
          const buffer = await decodeAudioBase64(res.audioBase64);
          return audioBufferToWavBlob(buffer);
        }
      } catch (err) {
        console.warn('Edge TTS export failed, falling back to Google Translate TTS:', err);
        try {
          const res = await generateGoogleTranslateSpeech(text);
          if (format === 'mp3') {
            return base64ToBlob(res.audioBase64, 'audio/mp3');
          } else {
            const buffer = await decodeAudioBase64(res.audioBase64);
            return audioBufferToWavBlob(buffer);
          }
        } catch {}
      }
    }

    if (!isStaticHosting() && voiceSettings.engine === 'google-translate' && !isOffline) {
      try {
        const res = await generateGoogleTranslateSpeech(text);
        if (format === 'mp3') {
          return base64ToBlob(res.audioBase64, 'audio/mp3');
        } else {
          const buffer = await decodeAudioBase64(res.audioBase64);
          return audioBufferToWavBlob(buffer);
        }
      } catch {}
    }

    // Offline / Native Synthesizer fallback
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    const duration = Math.max(2, (text.split(/\s+/).length / (180 * voiceSettings.rate)) * 60);
    const sampleRate = 24000;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const f0 = 140 * (1 + 0.1 * Math.sin(2 * Math.PI * 1.5 * t));
      const val =
        0.3 * Math.sin(2 * Math.PI * f0 * t) +
        0.2 * Math.sin(2 * Math.PI * f0 * 2 * t) +
        0.1 * Math.sin(2 * Math.PI * f0 * 3 * t);
      const env = Math.sin((Math.PI * i) / data.length);
      data[i] = val * env;
    }

    if (format === 'mp3') {
      return audioBufferToMp3Blob(buffer);
    } else {
      return audioBufferToWavBlob(buffer);
    }
  };

  const sanitizeFileName = (name: string) => {
    return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
  };

  const triggerAutoDownload = (url: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    if (voiceSettings.enableSoundCues) playSoundCue('click');

    const fileExt = exportFormat === 'mp3' ? 'mp3' : 'wav';
    const safeTitle = sanitizeFileName(book.title || 'AudioBook');

    setProgress({
      status: 'generating',
      currentChapter: 0,
      totalChapters: 1,
      message: `Đang khởi tạo âm thanh .${fileExt.toUpperCase()}...`,
      downloadUrl: '',
      fileName: '',
    });

    try {
      if (exportScope === 'single_full') {
        // 1. Export ENTIRE book as 1 single seamless audio file
        setProgress({
          status: 'generating',
          currentChapter: 1,
          totalChapters: 1,
          message: `Đang kết xuất toàn bộ bài đọc thành 1 file .${fileExt.toUpperCase()} duy nhất...`,
          downloadUrl: '',
          fileName: '',
        });

        // Combine all chapters text
        const fullText = book.chapters
          .map((c) => c.sentences.map((s) => s.text).join(' '))
          .join('\n\n');

        const audioBlob = await synthesizeTextToAudio(fullText, exportFormat);
        const url = URL.createObjectURL(audioBlob);
        const fileName = `${safeTitle}.${fileExt}`;

        setProgress({
          status: 'completed',
          currentChapter: 1,
          totalChapters: 1,
          message: `Đã tạo xong file âm thanh "${fileName}"! Đang tự động tải về...`,
          downloadUrl: url,
          fileName,
        });

        triggerAutoDownload(url, fileName);
        if (voiceSettings.enableSoundCues) playSoundCue('success');
      } else if (exportScope === 'current') {
        // 2. Export ONLY the current chapter
        const chapter = currentChapter;
        const safeChapterTitle = sanitizeFileName(chapter.title);

        setProgress({
          status: 'generating',
          currentChapter: 1,
          totalChapters: 1,
          message: `Đang tạo file âm thanh chương: "${chapter.title}"...`,
          downloadUrl: '',
          fileName: '',
        });

        const textContent = chapter.sentences.map((s) => s.text).join(' ');
        const audioBlob = await synthesizeTextToAudio(textContent, exportFormat);

        const url = URL.createObjectURL(audioBlob);
        const fileName = `${safeTitle}_${safeChapterTitle}.${fileExt}`;

        setProgress({
          status: 'completed',
          currentChapter: 1,
          totalChapters: 1,
          message: `Đã hoàn thành xuất file .${fileExt.toUpperCase()} chương "${chapter.title}"! Đang tải về...`,
          downloadUrl: url,
          fileName,
        });

        triggerAutoDownload(url, fileName);
        if (voiceSettings.enableSoundCues) playSoundCue('success');
      } else {
        // 3. Export separate chapter audio files in a clean ZIP package (NO redundant text files)
        const chapters = book.chapters;
        const total = chapters.length;
        const zip = new JSZip();

        // Process chapters concurrently in batches of 3 for fast generation
        const BATCH_SIZE = 3;
        let completedCount = 0;

        for (let i = 0; i < total; i += BATCH_SIZE) {
          const batch = chapters.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (chap, batchIdx) => {
              const actualIdx = i + batchIdx;
              const textContent = chap.sentences.map((s) => s.text).join(' ');
              const audioBlob = await synthesizeTextToAudio(textContent, exportFormat);

              const paddedIndex = String(actualIdx + 1).padStart(2, '0');
              const trackName = `${paddedIndex}_${sanitizeFileName(chap.title)}.${fileExt}`;
              zip.file(trackName, audioBlob);

              completedCount++;
              setProgress((prev) => ({
                ...prev,
                currentChapter: completedCount,
                totalChapters: total,
                message: `Đang xử lý ${completedCount}/${total} chương: "${chap.title}"...`,
              }));
            })
          );
        }

        // Add lightweight JSON metadata (NO heavy/redundant txt transcript)
        const metadata = {
          title: book.title,
          author: book.author || 'Tác giả',
          totalChapters: total,
          totalWords: book.wordCount,
          audioFormat: fileExt.toUpperCase(),
          voiceEngine: voiceSettings.engine,
          voiceName: voiceSettings.voiceName,
          exportedAt: new Date().toISOString(),
          chapters: chapters.map((c, idx) => ({
            track: idx + 1,
            fileName: `${String(idx + 1).padStart(2, '0')}_${sanitizeFileName(c.title)}.${fileExt}`,
            title: c.title,
          })),
        };
        zip.file('thong_tin_audio.json', JSON.stringify(metadata, null, 2));

        setProgress((prev) => ({
          ...prev,
          status: 'zipping',
          message: 'Đang nén file âm thanh các chương...',
        }));

        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: 'STORE', // Audio is already compressed, STORE is fast
        });

        const url = URL.createObjectURL(zipBlob);
        const fileName = `${safeTitle}_Audio_TronBo_${fileExt.toUpperCase()}.zip`;

        setProgress({
          status: 'completed',
          currentChapter: total,
          totalChapters: total,
          message: `Đã nén xong trọn bộ ${total} file âm thanh! Đang tải về...`,
          downloadUrl: url,
          fileName,
        });

        triggerAutoDownload(url, fileName);
        if (voiceSettings.enableSoundCues) playSoundCue('success');
      }

      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement('Đã xuất xong file âm thanh và bắt đầu tải về.', voiceSettings);
      }
    } catch (err: any) {
      console.error('Export error:', err);
      setProgress({
        status: 'error',
        currentChapter: 0,
        totalChapters: 0,
        message: err?.message || 'Có lỗi xảy ra trong quá trình tạo file âm thanh.',
        downloadUrl: '',
        fileName: '',
      });
      if (voiceSettings.enableSoundCues) playSoundCue('error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exporter-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className={`${themeConfig.card} border-2 ${themeConfig.border} rounded-3xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden ${themeConfig.textPrimary}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${themeConfig.border} ${themeConfig.cardInner}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${themeConfig.accent} ${themeConfig.accentText} flex items-center justify-center font-black`}>
              <FolderDown className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 id="exporter-modal-title" className="text-lg sm:text-xl font-black" style={{ color: themeConfig.hex.accent }}>
                Tải file Âm thanh (Audio)
              </h2>
              <p className={`text-xs ${themeConfig.textSecondary}`}>
                Xuất nhanh file MP3 / WAV để nghe ngoại tuyến trên điện thoại, loa hoặc máy MP3
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl ${themeConfig.card} ${themeConfig.border} border ${themeConfig.textSecondary} hover:${themeConfig.textPrimary} transition-all`}
            aria-label="Đóng bảng xuất âm thanh"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Scope Selector */}
          <div className="space-y-2">
            <label className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider block`}>
              Tùy chọn tải file
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Single full audio file (Fastest) */}
              <button
                type="button"
                onClick={() => setExportScope('single_full')}
                disabled={isExporting}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  exportScope === 'single_full'
                    ? `${themeConfig.accent} ${themeConfig.accentText} ${themeConfig.accentBorder} font-bold shadow-md`
                    : `${themeConfig.cardInner} hover:opacity-95 ${themeConfig.textPrimary} ${themeConfig.border}`
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 stroke-[2.5]" />
                    <span className="text-sm font-black">1 File duy nhất (.MP3)</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                    exportScope === 'single_full' ? `${themeConfig.card} ${themeConfig.textPrimary}` : `${themeConfig.card} ${themeConfig.textSecondary}`
                  }`}>
                    Nhanh nhất
                  </span>
                </div>
                <p className={`text-xs ${exportScope === 'single_full' ? 'opacity-90 font-semibold' : themeConfig.textSecondary}`}>
                  Tải 1 file âm thanh duy nhất để nghe liền mạch ngay, không cần giải nén ZIP
                </p>
              </button>

              {/* Option 2: Current Chapter Only */}
              <button
                type="button"
                onClick={() => setExportScope('current')}
                disabled={isExporting}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  exportScope === 'current'
                    ? `${themeConfig.accent} ${themeConfig.accentText} ${themeConfig.accentBorder} font-bold shadow-md`
                    : `${themeConfig.cardInner} hover:opacity-95 ${themeConfig.textPrimary} ${themeConfig.border}`
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <FileAudio className="w-4 h-4" />
                  <span className="text-sm font-black">Chỉ chương hiện tại</span>
                </div>
                <p className={`text-xs ${exportScope === 'current' ? 'opacity-90 font-semibold' : themeConfig.textSecondary}`}>
                  Tải 1 file .MP3 của chương "{currentChapter.title.length > 25 ? currentChapter.title.slice(0, 25) + '...' : currentChapter.title}"
                </p>
              </button>

              {/* Option 3: Multi-chapter ZIP (Only shown if book has multiple chapters) */}
              {isMultiChapter && (
                <button
                  type="button"
                  onClick={() => setExportScope('zip_chapters')}
                  disabled={isExporting}
                  className={`sm:col-span-2 p-4 rounded-2xl border text-left transition-all ${
                    exportScope === 'zip_chapters'
                      ? `${themeConfig.accent} ${themeConfig.accentText} ${themeConfig.accentBorder} font-bold shadow-md`
                      : `${themeConfig.cardInner} hover:opacity-95 ${themeConfig.textPrimary} ${themeConfig.border}`
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <FileArchive className="w-4 h-4" />
                      <span className="text-sm font-black">Chia từng chương riêng biệt (.ZIP)</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                      exportScope === 'zip_chapters' ? `${themeConfig.card} ${themeConfig.textPrimary}` : `${themeConfig.card} ${themeConfig.textSecondary}`
                    }`}>
                      {book.chapters.length} tracks
                    </span>
                  </div>
                  <p className={`text-xs ${exportScope === 'zip_chapters' ? 'opacity-90 font-semibold' : themeConfig.textSecondary}`}>
                    Chỉ đóng gói các file audio từng chương + tệp thông tin (đã loại bỏ hoàn toàn các file văn bản thừa)
                  </p>
                </button>
              )}
            </div>
          </div>

          {/* Format Selector: MP3 vs WAV */}
          <div className="space-y-2">
            <label className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider block`}>
              Định dạng âm thanh
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat('mp3')}
                disabled={isExporting}
                className={`p-3 rounded-xl border text-left transition-all ${
                  exportFormat === 'mp3'
                    ? `${themeConfig.accent} ${themeConfig.accentText} ${themeConfig.accentBorder} font-bold`
                    : `${themeConfig.cardInner} hover:opacity-95 ${themeConfig.textPrimary} ${themeConfig.border}`
                }`}
              >
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  <span className="text-xs sm:text-sm font-black">MP3 (Khuyên dùng - Nhanh)</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('wav')}
                disabled={isExporting}
                className={`p-3 rounded-xl border text-left transition-all ${
                  exportFormat === 'wav'
                    ? `${themeConfig.accent} ${themeConfig.accentText} ${themeConfig.accentBorder} font-bold`
                    : `${themeConfig.cardInner} hover:opacity-95 ${themeConfig.textPrimary} ${themeConfig.border}`
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileAudio className="w-4 h-4" />
                  <span className="text-xs sm:text-sm font-black">WAV (Chất lượng gốc)</span>
                </div>
              </button>
            </div>
          </div>

          {/* Summary Info */}
          <div className={`p-3.5 rounded-2xl ${themeConfig.cardInner} border ${themeConfig.border} space-y-1.5 text-xs ${themeConfig.textPrimary}`}>
            <div className="flex justify-between">
              <span className={`font-bold ${themeConfig.textSecondary}`}>Nội dung:</span>
              <span className="font-black truncate max-w-[280px]" style={{ color: themeConfig.hex.accent }}>{book.title}</span>
            </div>
            <div className="flex justify-between">
              <span className={`font-bold ${themeConfig.textSecondary}`}>Giọng đọc:</span>
              <span>{voiceSettings.voiceName} ({voiceSettings.rate}x)</span>
            </div>
            <div className="flex justify-between">
              <span className={`font-bold ${themeConfig.textSecondary}`}>Kết quả xuất:</span>
              <span className="text-emerald-400 font-bold">
                {exportScope === 'single_full'
                  ? `1 file duy nhất .${exportFormat.toUpperCase()} (Tải trực tiếp)`
                  : exportScope === 'current'
                  ? `1 file .${exportFormat.toUpperCase()} chương hiện tại`
                  : `Tệp .ZIP chứa ${book.chapters.length} file audio`}
              </span>
            </div>
          </div>

          {/* Progress / Status Display */}
          {progress.status !== 'idle' && (
            <div className={`space-y-3 p-4 rounded-2xl ${themeConfig.cardInner} border ${themeConfig.border} animate-in fade-in`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2" style={{ color: themeConfig.hex.accent }}>
                  {isExporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{progress.message}</span>
                </span>
                {progress.totalChapters > 1 && (
                  <span className={themeConfig.textPrimary}>
                    {progress.currentChapter}/{progress.totalChapters}
                  </span>
                )}
              </div>

              {isExporting && (
                <div className={`w-full h-2 rounded-full ${themeConfig.card} overflow-hidden border ${themeConfig.border}`}>
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      backgroundColor: themeConfig.hex.accent,
                      width: `${
                        progress.totalChapters > 0
                          ? Math.min(100, Math.max(15, (progress.currentChapter / progress.totalChapters) * 100))
                          : 50
                      }%`,
                    }}
                  />
                </div>
              )}

              {/* Download Ready Button */}
              {progress.status === 'completed' && progress.downloadUrl && (
                <div className="pt-2">
                  <a
                    href={progress.downloadUrl}
                    download={progress.fileName}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                  >
                    <Download className="w-5 h-5 stroke-[2.5]" />
                    <span>Tải lại file ({progress.fileName})</span>
                  </a>
                </div>
              )}

              {progress.status === 'error' && (
                <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{progress.message}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`flex items-center justify-end gap-3 p-4 border-t ${themeConfig.border} ${themeConfig.cardInner}`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold ${themeConfig.textSecondary} hover:${themeConfig.textPrimary}`}
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={handleStartExport}
            disabled={isExporting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-md transition-all active:scale-95 disabled:opacity-50`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý âm thanh...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Tải file Audio ngay (.{exportFormat.toUpperCase()})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

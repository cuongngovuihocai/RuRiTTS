import React, { useState } from 'react';
import JSZip from 'jszip';
import {
  X,
  FolderDown,
  FileAudio,
  AlertCircle,
  Loader2,
  Download,
  FileArchive,
  Music,
  Zap,
  Lock,
} from 'lucide-react';
import { Book, VietnameseVoice, VoiceSettings, ThemeMode } from '../types';
import {
  concatAudioBuffersToWavBlob,
  concatMp3Base64Chunks,
  decodeAudioBase64,
  getEmotionAcoustics,
  playSoundCue,
  speakAnnouncement,
} from '../services/audioSynthesizer';
import {
  generateEdgeSpeech,
  generateGoogleTranslateSpeech,
  hasBackendSupport,
} from '../services/geminiService';
import { getThemeConfig } from '../utils/themeStyles';

interface AudiobookExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  voices?: VietnameseVoice[];
  voiceSettings: VoiceSettings;
  isOffline: boolean;
  theme?: ThemeMode;
}

function splitTextForTtsExport(rawText: string, maxChars = 450): string[] {
  const clean = rawText.trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const blocks = clean.split(/\n+/);
  const chunks: string[] = [];
  let current = '';

  const flushCurrent = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
  };

  for (const block of blocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    if ((current ? current + ' ' + trimmedBlock : trimmedBlock).length <= maxChars) {
      current = current ? `${current} ${trimmedBlock}` : trimmedBlock;
      continue;
    }

    flushCurrent();
    if (trimmedBlock.length <= maxChars) {
      current = trimmedBlock;
      continue;
    }

    // Split long paragraph by sentence punctuation without regex lookbehind (iOS Safari compatible)
    const sentences = trimmedBlock.match(/[^.?!…]+(?:[.?!…]+["'”»)]*)?/g) || [trimmedBlock];
    for (const sent of sentences) {
      const s = sent.trim();
      if (!s) continue;
      if ((current ? current + ' ' + s : s).length <= maxChars) {
        current = current ? `${current} ${s}` : s;
      } else {
        flushCurrent();
        if (s.length <= maxChars) {
          current = s;
        } else {
          // Hard split by word boundaries
          const words = s.split(/\s+/);
          for (const w of words) {
            if ((current ? current + ' ' + w : w).length <= maxChars) {
              current = current ? `${current} ${w}` : w;
            } else {
              flushCurrent();
              current = w;
            }
          }
        }
      }
    }
  }

  flushCurrent();
  return chunks;
}

export const AudiobookExporterModal: React.FC<AudiobookExporterModalProps> = ({
  isOpen,
  onClose,
  book,
  voices,
  voiceSettings,
  isOffline,
  theme = 'dark-stone',
}) => {
  const themeConfig = getThemeConfig(theme as ThemeMode);
  const isMultiChapter = book.chapters.length > 1;
  const backendReady = hasBackendSupport();
  const isNativeVoiceSelected = voiceSettings.engine === 'native';

  const selectedVoice = voices?.find((v) => v.id === voiceSettings.voiceId);
  const selectedVoiceName =
    selectedVoice?.name ||
    (voiceSettings.engine === 'google-translate'
      ? 'Google Dịch Nữ'
      : voiceSettings.voiceId || 'Giọng đã chọn');
  const selectedEngineLabel =
    voiceSettings.engine === 'edge'
      ? 'Microsoft Edge'
      : voiceSettings.engine === 'google-translate'
      ? 'Google TTS'
      : 'Giọng thiết bị (Offline)';

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

  const synthesizeChunkStrict = async (
    chunkText: string,
    effectiveRate: number,
    effectivePitch: number,
    effectiveVolume: number
  ): Promise<string> => {
    if (voiceSettings.engine === 'native') {
      throw new Error(
        'Giọng đọc thiết bị (Offline) không hỗ trợ xuất ra file MP3/WAV. Vui lòng mở "Giọng đọc & Giao diện" và chọn một giọng Microsoft Edge hoặc Google TTS.'
      );
    }

    if (voiceSettings.engine === 'edge') {
      const retryDelays = [600, 1200, 2200, 3200];
      let lastError: any = null;

      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await generateEdgeSpeech(
            chunkText,
            voiceSettings.voiceId,
            effectiveRate,
            effectivePitch,
            effectiveVolume,
            { strict: true }
          );
          if (res?.audioBase64 && !res.isFallback) {
            return res.audioBase64;
          }
          throw new Error('Phản hồi không hợp lệ hoặc bị chuyển sang giọng dự phòng.');
        } catch (err: any) {
          lastError = err;
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, retryDelays[attempt]));
          }
        }
      }

      throw new Error(
        `Không thể kết nối giọng Microsoft Edge "${selectedVoiceName}" sau 4 lần thử (${lastError?.message || 'Lỗi mạng'}). Đã dừng để đảm bảo file Audiobook không bị lẫn giọng khác.`
      );
    }

    // Strict Google Translate TTS
    const gtDelays = [500, 1100, 1800];
    let lastGtError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await generateGoogleTranslateSpeech(chunkText, voiceSettings.voiceId, { strict: true });
        if (res?.audioBase64 && !res.isFallback) {
          return res.audioBase64;
        }
        throw new Error('Phản hồi Google TTS không hợp lệ.');
      } catch (err: any) {
        lastGtError = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, gtDelays[attempt]));
        }
      }
    }

    throw new Error(
      `Không thể kết nối giọng Google TTS "${selectedVoiceName}" sau 3 lần thử (${lastGtError?.message || 'Lỗi mạng'}). Đã dừng để đảm bảo file Audiobook không bị lẫn giọng khác.`
    );
  };

  const buildAudioBlobFromBase64Chunks = async (
    base64Chunks: string[],
    format: 'mp3' | 'wav'
  ): Promise<Blob> => {
    if (format === 'mp3') {
      return concatMp3Base64Chunks(base64Chunks);
    }
    const buffers: AudioBuffer[] = [];
    for (const b64 of base64Chunks) {
      buffers.push(await decodeAudioBase64(b64));
    }
    return concatAudioBuffersToWavBlob(buffers);
  };

  // Synthesize text to MP3 or WAV Blob in small sequential chunks (<= 450 chars) locked strictly to 1 voice
  const synthesizeTextToAudio = async (
    text: string,
    format: 'mp3' | 'wav',
    onChunkProgress?: (done: number, total: number) => void,
    partialTracker?: { chunks: string[]; total: number }
  ): Promise<Blob> => {
    const emotionAcoustics = getEmotionAcoustics(voiceSettings.emotion);
    const effectiveRate = Math.max(0.5, Math.min(3.0, voiceSettings.rate * emotionAcoustics.rateMultiplier));
    const effectivePitch = Math.max(0.5, Math.min(1.5, voiceSettings.pitch * emotionAcoustics.pitchMultiplier));
    const effectiveVolume = Math.max(0, Math.min(1.0, voiceSettings.volume * emotionAcoustics.volumeMultiplier));

    if (voiceSettings.engine === 'native') {
      throw new Error(
        'Giọng đọc thiết bị (Offline) không hỗ trợ xuất thành file Audio. Hãy chuyển sang giọng Microsoft Edge hoặc Google TTS trong "Giọng đọc & Giao diện".'
      );
    }

    if (!backendReady) {
      throw new Error('Không thể kết nối máy chủ xử lý giọng đọc trực tuyến.');
    }

    if (isOffline) {
      throw new Error('Thiết bị đang ngoại tuyến (Offline). Vui lòng kết nối Internet để xuất file Audio MP3/WAV.');
    }

    const chunks = splitTextForTtsExport(text, 450);
    if (chunks.length === 0) {
      throw new Error('Nội dung văn bản trống, không thể tạo file âm thanh.');
    }

    if (partialTracker) {
      partialTracker.total = chunks.length;
    }

    const base64Chunks: string[] = [];
    const interChunkPauseMs = voiceSettings.engine === 'edge' ? 150 : 30;

    for (let i = 0; i < chunks.length; i++) {
      onChunkProgress?.(i, chunks.length);
      const b64 = await synthesizeChunkStrict(
        chunks[i],
        effectiveRate,
        effectivePitch,
        effectiveVolume
      );
      base64Chunks.push(b64);
      partialTracker?.chunks.push(b64);
      onChunkProgress?.(i + 1, chunks.length);

      // Gentle throttle pause between chunks so Bing Edge WebSocket doesn't rate-limit long exports
      if (i < chunks.length - 1 && interChunkPauseMs > 0) {
        await new Promise((r) => setTimeout(r, interChunkPauseMs));
      }
    }

    return buildAudioBlobFromBase64Chunks(base64Chunks, format);
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
    if (progress.downloadUrl) {
      try {
        URL.revokeObjectURL(progress.downloadUrl);
      } catch {}
    }

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

    // Trackers for partial valid audio recovery if connection drops mid-export
    const singlePartialTracker = { chunks: [] as string[], total: 0 };
    const completedZipTracks: { index: number; title: string; trackName: string; blob: Blob }[] = [];
    const failedChapterPartials: { index: number; title: string; tracker: { chunks: string[]; total: number } }[] = [];

    try {
      if (exportScope === 'single_full') {
        const fullText = book.chapters
          .map((c) => c.sentences.map((s) => s.text).join(' '))
          .join('\n\n');

        const audioBlob = await synthesizeTextToAudio(
          fullText,
          exportFormat,
          (done, total) => {
            setProgress({
              status: 'generating',
              currentChapter: done,
              totalChapters: total,
              message: `Đang kết xuất đoạn ${done}/${total} thành file .${fileExt.toUpperCase()}...`,
              downloadUrl: '',
              fileName: '',
            });
          },
          singlePartialTracker
        );

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
        const chapter = currentChapter;
        const safeChapterTitle = sanitizeFileName(chapter.title);
        const textContent = chapter.sentences.map((s) => s.text).join(' ');

        const audioBlob = await synthesizeTextToAudio(
          textContent,
          exportFormat,
          (done, total) => {
            setProgress({
              status: 'generating',
              currentChapter: done,
              totalChapters: total,
              message: `Đang tạo đoạn ${done}/${total} chương "${chapter.title}"...`,
              downloadUrl: '',
              fileName: '',
            });
          },
          singlePartialTracker
        );

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
        // 3. Export separate chapter audio files in a clean ZIP package:
        // - Google TTS: parallel batching (3 chapters/batch) for fast speed
        // - Microsoft Edge TTS: sequential chapter processing to prevent Bing WebSocket throttling
        const chapters = book.chapters;
        const total = chapters.length;
        const zip = new JSZip();

        if (voiceSettings.engine === 'google-translate') {
          const BATCH_SIZE = 3;
          let completedCount = 0;

          for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = chapters.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(
              batch.map(async (chap, batchIdx) => {
                const actualIdx = i + batchIdx;
                const tracker = { chunks: [] as string[], total: 0 };
                const textContent = chap.sentences.map((s) => s.text).join(' ');
                try {
                  const audioBlob = await synthesizeTextToAudio(textContent, exportFormat, undefined, tracker);
                  const paddedIndex = String(actualIdx + 1).padStart(2, '0');
                  const trackName = `${paddedIndex}_${sanitizeFileName(chap.title)}.${fileExt}`;
                  completedZipTracks.push({ index: actualIdx, title: chap.title, trackName, blob: audioBlob });

                  completedCount++;
                  setProgress({
                    status: 'generating',
                    currentChapter: completedCount,
                    totalChapters: total,
                    message: `Đang xử lý song song: đã xong ${completedCount}/${total} chương...`,
                    downloadUrl: '',
                    fileName: '',
                  });
                } catch (chapErr) {
                  if (tracker.chunks.length > 0) {
                    failedChapterPartials.push({ index: actualIdx, title: chap.title, tracker });
                  }
                  throw chapErr;
                }
              })
            );

            const rejected = batchResults.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
            if (rejected) {
              throw rejected.reason;
            }
          }
        } else {
          for (let i = 0; i < total; i++) {
            const chap = chapters[i];
            const tracker = { chunks: [] as string[], total: 0 };
            const textContent = chap.sentences.map((s) => s.text).join(' ');

            setProgress({
              status: 'generating',
              currentChapter: i,
              totalChapters: total,
              message: `Đang xử lý chương ${i + 1}/${total}: "${chap.title}"...`,
              downloadUrl: '',
              fileName: '',
            });

            try {
              const audioBlob = await synthesizeTextToAudio(
                textContent,
                exportFormat,
                (done, chunkTotal) => {
                  setProgress({
                    status: 'generating',
                    currentChapter: i,
                    totalChapters: total,
                    message: `Chương ${i + 1}/${total} ("${chap.title}"): đoạn ${done}/${chunkTotal}...`,
                    downloadUrl: '',
                    fileName: '',
                  });
                },
                tracker
              );

              const paddedIndex = String(i + 1).padStart(2, '0');
              const trackName = `${paddedIndex}_${sanitizeFileName(chap.title)}.${fileExt}`;
              completedZipTracks.push({ index: i, title: chap.title, trackName, blob: audioBlob });

              setProgress({
                status: 'generating',
                currentChapter: i + 1,
                totalChapters: total,
                message: `Đã xong ${i + 1}/${total} chương: "${chap.title}"`,
                downloadUrl: '',
                fileName: '',
              });

              if (i < total - 1) {
                await new Promise((r) => setTimeout(r, 200));
              }
            } catch (chapErr) {
              if (tracker.chunks.length > 0) {
                failedChapterPartials.push({ index: i, title: chap.title, tracker });
              }
              throw chapErr;
            }
          }
        }

        completedZipTracks.sort((a, b) => a.index - b.index);
        for (const track of completedZipTracks) {
          zip.file(track.trackName, track.blob);
        }

        // Add lightweight JSON metadata (NO heavy/redundant txt transcript)
        const metadata = {
          title: book.title,
          author: book.author || 'Tác giả',
          totalChapters: total,
          totalWords: book.wordCount,
          audioFormat: fileExt.toUpperCase(),
          voiceEngine: voiceSettings.engine,
          voiceId: voiceSettings.voiceId,
          voiceName: selectedVoiceName,
          strictSingleVoice: true,
          exportedAt: new Date().toISOString(),
          chapters: completedZipTracks.map((t) => ({
            track: t.index + 1,
            fileName: t.trackName,
            title: t.title,
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
      let partialUrl = '';
      let partialFileName = '';
      let partialNote = '';

      try {
        if (exportScope === 'zip_chapters' && (completedZipTracks.length > 0 || failedChapterPartials.length > 0)) {
          const partialZip = new JSZip();
          completedZipTracks.sort((a, b) => a.index - b.index);
          for (const track of completedZipTracks) {
            partialZip.file(track.trackName, track.blob);
          }

          let partialChapterCount = 0;
          for (const fp of failedChapterPartials) {
            if (fp.tracker.chunks.length > 0) {
              const partialBlob = await buildAudioBlobFromBase64Chunks(fp.tracker.chunks, exportFormat);
              const paddedIndex = String(fp.index + 1).padStart(2, '0');
              const trackName = `${paddedIndex}_${sanitizeFileName(fp.title)}_(DANG_DO_${fp.tracker.chunks.length}tren${fp.tracker.total}).${fileExt}`;
              partialZip.file(trackName, partialBlob);
              partialChapterCount++;
            }
          }

          const partialZipBlob = await partialZip.generateAsync({ type: 'blob', compression: 'STORE' });
          partialUrl = URL.createObjectURL(partialZipBlob);
          partialFileName = `${safeTitle}_Audio_(DANG_DO_${completedZipTracks.length}tren${book.chapters.length}_chuong)_${fileExt.toUpperCase()}.zip`;
          partialNote = ` Đã lưu sẵn ${completedZipTracks.length}/${book.chapters.length} chương hoàn chỉnh${
            partialChapterCount > 0 ? ` và ${partialChapterCount} file đang đọc dở (được gắn nhãn "(DANG_DO_...)" trong tên file)` : ''
          } để bạn tải về bên dưới.`;
        } else if (exportScope !== 'zip_chapters' && singlePartialTracker.chunks.length > 0) {
          const partialBlob = await buildAudioBlobFromBase64Chunks(singlePartialTracker.chunks, exportFormat);
          partialUrl = URL.createObjectURL(partialBlob);
          const baseName =
            exportScope === 'current'
              ? `${safeTitle}_${sanitizeFileName(currentChapter.title)}`
              : safeTitle;
          partialFileName = `${baseName}_(DANG_DO_${singlePartialTracker.chunks.length}tren${singlePartialTracker.total}).${fileExt}`;
          partialNote = ` Đã giữ lại phần âm thanh hợp lệ từ đầu đến đoạn ${singlePartialTracker.chunks.length}/${singlePartialTracker.total} (nghe bình thường, đúng 1 giọng) ở nút tải bên dưới.`;
        }
      } catch (partialErr) {
        console.warn('Could not package partial audio:', partialErr);
      }

      setProgress({
        status: 'error',
        currentChapter: 0,
        totalChapters: 0,
        message: (err?.message || 'Có lỗi xảy ra trong quá trình tạo file âm thanh.') + partialNote,
        downloadUrl: partialUrl,
        fileName: partialFileName,
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

          {/* Native Voice Guard Notice */}
          {isNativeVoiceSelected && (
            <div className="p-3.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300">
                  Giọng đọc thiết bị (Offline) chỉ nghe trực tiếp, không thể xuất thành file Audio.
                </p>
                <p className="opacity-90">
                  Vui lòng mở <strong>Giọng đọc &amp; Giao diện</strong> và chọn một giọng <strong>Microsoft Edge</strong> hoặc <strong>Google TTS</strong> để tạo file Audiobook đồng nhất 100%.
                </p>
              </div>
            </div>
          )}

          {/* Summary Info */}
          <div className={`p-3.5 rounded-2xl ${themeConfig.cardInner} border ${themeConfig.border} space-y-1.5 text-xs ${themeConfig.textPrimary}`}>
            <div className="flex justify-between">
              <span className={`font-bold ${themeConfig.textSecondary}`}>Nội dung:</span>
              <span className="font-black truncate max-w-[280px]" style={{ color: themeConfig.hex.accent }}>{book.title}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className={`font-bold ${themeConfig.textSecondary}`}>Giọng đọc:</span>
              <span className="font-semibold text-right">
                {selectedVoiceName} · {selectedEngineLabel} ({voiceSettings.rate}x)
              </span>
            </div>
            {!isNativeVoiceSelected && (
              <div className="flex justify-between items-center gap-2">
                <span className={`font-bold ${themeConfig.textSecondary}`}>Chế độ giọng:</span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                  <Lock className="w-3 h-3" />
                  Khóa cứng 100% đúng giọng đã chọn
                </span>
              </div>
            )}
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
              {progress.status !== 'error' && (
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
              )}

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
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-red-400 text-xs font-bold">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{progress.message}</span>
                  </div>

                  {progress.downloadUrl && progress.fileName && (
                    <a
                      href={progress.downloadUrl}
                      download={progress.fileName}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                    >
                      <Download className="w-4 h-4 stroke-[2.5]" />
                      <span className="truncate">Tải phần âm thanh đã hoàn thành ({progress.fileName})</span>
                    </a>
                  )}
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
            disabled={isExporting || isNativeVoiceSelected}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
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

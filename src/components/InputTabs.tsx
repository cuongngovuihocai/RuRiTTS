import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Upload,
  Camera,
  Trash2,
  Sparkles,
  ClipboardPaste,
  Play,
  RotateCw,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileUp,
  Image as ImageIcon,
  Zap,
  Cpu,
  BookOpen,
  FileType,
  Globe,
  Link2,
  Bookmark,
} from 'lucide-react';
import { Book, CustomDictionaryEntry, VoiceSettings, ThemeMode } from '../types';
import { fetchWebArticle } from '../services/geminiService';
import { performLocalOcr } from '../services/localOcrService';
import { cleanVietnameseTextOffline } from '../services/textCleaner';
import { playSoundCue, speakAnnouncement } from '../services/audioSynthesizer';
import { parseAnyDocument } from '../services/fileParser';
import { getThemeConfig } from '../utils/themeStyles';

interface InputTabsProps {
  theme: ThemeMode;
  onLoadContent: (title: string, text: string) => void;
  dictionary: CustomDictionaryEntry[];
  voiceSettings: VoiceSettings;
  isOffline: boolean;
  lastReadBook?: Book | null;
  onResumeBook?: (book: Book) => void;
}


export const InputTabs: React.FC<InputTabsProps> = ({
  theme,
  onLoadContent,
  dictionary,
  voiceSettings,
  isOffline,
  lastReadBook,
  onResumeBook,
}) => {
  const themeConfig = getThemeConfig(theme);
  const [activeTab, setActiveTab] = useState<'text' | 'file' | 'url' | 'camera'>('text');
  const [inputText, setInputText] = useState('');
  const [docTitle, setDocTitle] = useState('Văn bản mới');
  const [isCleaning, setIsCleaning] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Web URL Article State
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlSuccessInfo, setUrlSuccessInfo] = useState<{
    title: string;
    wordCount: number;
    url: string;
  } | null>(null);

  // File Upload State
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [fileProgressMsg, setFileProgressMsg] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsedFileInfo, setParsedFileInfo] = useState<{
    title: string;
    wordCount: number;
    fileType: string;
    pageOrChapterCount?: number;
  } | null>(null);

  // Camera & Image OCR State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImages, setCapturedImages] = useState<{ id: string; url: string; base64: string }[]>([]);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState({ current: 0, total: 0 });
  const [ocrError, setOcrError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Handle Tab Switch
  const switchTab = (tab: 'text' | 'file' | 'url' | 'camera') => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    setActiveTab(tab);
    if (tab !== 'camera' && isCameraActive) {
      stopCamera();
    }
    if (voiceSettings.enableSpokenGuide) {
      const tabNames = {
        text: 'Thẻ nhập và dán văn bản',
        file: 'Thẻ tải tệp tài liệu sách',
        url: 'Thẻ đọc bài viết từ link web',
        camera: 'Thẻ quét ảnh chụp từ sách',
      };
      speakAnnouncement(tabNames[tab], voiceSettings);
    }
  };

  // Instant Paste URL from Clipboard
  const handlePasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setUrlInput(text.trim());
        if (voiceSettings.enableSoundCues) playSoundCue('click');
      } else if (text) {
        setUrlInput(text.trim());
      }
    } catch {
      // Fallback
    }
  };

  // Fetch and Extract Web Article
  const handleFetchUrl = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl || urlInput).trim();
    if (!targetUrl) {
      setUrlError('Vui lòng nhập hoặc dán đường dẫn link web (URL).');
      return;
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      setUrlError('Đường dẫn phải bắt đầu bằng http:// hoặc https://');
      return;
    }

    if (isOffline) {
      setUrlError('Chức năng tải link web cần kết nối Internet.');
      return;
    }

    setIsFetchingUrl(true);
    setUrlError(null);
    setUrlSuccessInfo(null);

    if (voiceSettings.enableSoundCues) playSoundCue('click');
    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement('Đang tải và bóc tách bài viết từ liên kết...', voiceSettings);
    }

    try {
      const result = await fetchWebArticle(targetUrl);
      if (!result.text || result.text.trim().length === 0) {
        throw new Error('Không thể trích xuất được bài viết từ trang web này.');
      }

      setDocTitle(result.title);
      setInputText(result.text);
      setUrlSuccessInfo({
        title: result.title,
        wordCount: result.wordCount,
        url: result.url,
      });

      if (voiceSettings.enableSoundCues) playSoundCue('success');
      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement(`Đã trích xuất bài viết "${result.title}" gồm ${result.wordCount} từ.`, voiceSettings);
      }
    } catch (err: any) {
      console.error('Fetch URL Error:', err);
      setUrlError(err?.message || 'Không thể tải trang web. Vui lòng kiểm tra lại liên kết hoặc thử liên kết khác.');
      if (voiceSettings.enableSoundCues) playSoundCue('error');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Quick Clean Text
  const handleCleanText = () => {
    if (!inputText.trim()) return;
    if (voiceSettings.enableSoundCues) playSoundCue('clean');
    setIsCleaning(true);
    const cleaned = cleanVietnameseTextOffline(inputText, dictionary);
    setInputText(cleaned);
    setTimeout(() => {
      setIsCleaning(false);
      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement('Đã làm sạch ký tự thừa và chuẩn hóa từ viết tắt.', voiceSettings);
      }
    }, 200);
  };

  // Start Reading Document
  const handleStartReading = () => {
    if (!inputText.trim()) {
      if (voiceSettings.enableSoundCues) playSoundCue('error');
      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement('Vui lòng nhập hoặc tải nội dung văn bản trước.', voiceSettings);
      }
      return;
    }
    if (voiceSettings.enableSoundCues) playSoundCue('play');
    onLoadContent(docTitle.trim() || 'Sách nói RÙ RÌ', inputText);
  };

  // File Upload Handler (Supports PDF, EPUB, DOCX, TXT, MD, HTML, JSON, CSV)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    setFileError(null);
    setParsedFileInfo(null);
    setUploadedFileName(file.name);
    setFileProgressMsg('Đang phân tích cấu trúc tệp...');

    try {
      const result = await parseAnyDocument(file, (_cur, _tot, msg) => {
        setFileProgressMsg(msg);
      });

      if (!result.text || result.text.trim().length === 0) {
        throw new Error('Tệp không chứa văn bản hoặc văn bản không thể trích xuất.');
      }

      setDocTitle(result.title);
      setInputText(result.text);

      const words = result.text.split(/\s+/).filter(Boolean).length;
      setParsedFileInfo({
        title: result.title,
        wordCount: words,
        fileType: result.fileType.toUpperCase(),
        pageOrChapterCount: result.pageOrChapterCount,
      });

      if (voiceSettings.enableSoundCues) playSoundCue('success');
      if (voiceSettings.enableSpokenGuide) {
        const extraInfo = result.pageOrChapterCount
          ? ` gồm ${result.pageOrChapterCount} ${result.fileType === 'pdf' ? 'trang' : 'chương'}`
          : '';
        speakAnnouncement(`Đã tải thành công tệp ${result.fileType.toUpperCase()}${extraInfo} với ${words} từ.`, voiceSettings);
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setFileError(
        err?.message ||
          'Không thể trích xuất nội dung từ tệp này. Vui lòng kiểm tra lại tệp PDF/EPUB hoặc thử tệp khác.'
      );
      if (voiceSettings.enableSoundCues) playSoundCue('error');
    } finally {
      setIsReadingFile(false);
    }
  };

  // Camera Management
  const startCamera = async () => {
    try {
      setOcrError(null);
      if (voiceSettings.enableSoundCues) playSoundCue('click');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setCameraStream(stream);
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement('Đã bật camera. Đưa trang sách vào trước ống kính rồi nhấn nút Chụp ảnh.', voiceSettings);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setOcrError('Không thể truy cập máy ảnh. Vui lòng cấp quyền truy cập camera hoặc chọn tải ảnh từ máy.');
      if (voiceSettings.enableSoundCues) playSoundCue('error');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    if (voiceSettings.enableSoundCues) playSoundCue('click');

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.92);
    const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    setCapturedImages((prev) => [...prev, { id, url: base64, base64 }]);

    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement(`Đã chụp trang sách thứ ${capturedImages.length + 1}.`, voiceSettings);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (voiceSettings.enableSoundCues) playSoundCue('click');

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          setCapturedImages((prev) => [...prev, { id, url: base64, base64 }]);
        }
      };
      reader.readAsDataURL(file);
    });

    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement(`Đã chọn thêm ${files.length} ảnh trang sách.`, voiceSettings);
    }
  };

  const removeCapturedImage = (id: string) => {
    if (voiceSettings.enableSoundCues) playSoundCue('click');
    setCapturedImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Perform OCR (Offline Tesseract / Online Gemini) on all captured book images
  const handleProcessOcr = async () => {
    if (capturedImages.length === 0) return;

    setIsOcrProcessing(true);
    setOcrError(null);
    setOcrProgress({ current: 0, total: capturedImages.length });

    const modeName = 'Tesseract OCR Client-side';
    if (voiceSettings.enableSpokenGuide) {
      speakAnnouncement(`Bắt đầu nhận diện ${capturedImages.length} trang sách bằng chế độ ${modeName}.`, voiceSettings);
    }

    try {
      const extractedPages: string[] = [];

      for (let i = 0; i < capturedImages.length; i++) {
        setOcrProgress({ current: i + 1, total: capturedImages.length });
        const img = capturedImages[i];

        // Local client-side Tesseract OCR (100% Offline, free, 0d)
        const localRes = await performLocalOcr(img.base64);
        const pageText = cleanVietnameseTextOffline(localRes.text, dictionary);

        if (pageText.trim()) {
          extractedPages.push(`--- Trang ${i + 1} ---\n` + pageText.trim());
        }
      }

      if (extractedPages.length === 0) {
        throw new Error('Không nhận dạng được chữ trong các ảnh đã chọn.');
      }

      const fullOcrText = extractedPages.join('\n\n');
      setInputText(fullOcrText);
      setDocTitle(`Sách ảnh quét (${capturedImages.length} trang)`);

      if (voiceSettings.enableSoundCues) playSoundCue('success');
      if (voiceSettings.enableSpokenGuide) {
        speakAnnouncement(`Đã nhận diện thành công ${capturedImages.length} trang sách. Đã chuyển sang khung đọc.`, voiceSettings);
      }

      stopCamera();
      setActiveTab('text');
    } catch (err: any) {
      setOcrError(err?.message || 'Có lỗi xảy ra trong quá trình nhận diện ảnh sách.');
      if (voiceSettings.enableSoundCues) playSoundCue('error');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Words and reading duration calculations
  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;
  const charCount = inputText.length;
  const estimatedMinutes = Math.ceil(wordCount / 180); // ~180 wpm in Vietnamese

  return (
    <div id="input-tabs-container" className="w-full max-w-5xl mx-auto my-6 px-4">
      {/* Auto Resume Saved Reading Position Banner */}
      {lastReadBook && (lastReadBook.currentChapterIndex > 0 || lastReadBook.currentSentenceIndex > 0) && (
        <div className={`mb-5 p-4 sm:p-5 rounded-2xl ${themeConfig.card} ${themeConfig.border} border-2 border-amber-500/60 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center font-black flex-shrink-0 shadow-md">
              <Bookmark className="w-6 h-6 fill-current" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>📍 Tự động nhớ vị trí đọc (Auto Resume)</span>
              </div>
              <h3 className={`text-base sm:text-lg font-black ${themeConfig.textPrimary} truncate mt-0.5`}>
                {lastReadBook.title}
              </h3>
              <p className={`text-xs sm:text-sm ${themeConfig.textSecondary} font-semibold`}>
                Đang đọc dở tại <strong className="text-amber-300">Chương {lastReadBook.currentChapterIndex + 1}</strong> • <strong className="text-amber-300">Câu {lastReadBook.currentSentenceIndex + 1}</strong>
              </p>
            </div>
          </div>

          <button
            id="btn-auto-resume-input"
            type="button"
            onClick={() => onResumeBook?.(lastReadBook)}
            className={`w-full sm:w-auto px-6 py-3 rounded-xl ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl transition-all active:scale-95 flex-shrink-0`}
            aria-label={`Tiếp tục nghe tác phẩm ${lastReadBook.title} từ câu ${lastReadBook.currentSentenceIndex + 1}`}
          >
            <Play className="w-4 h-4 fill-current stroke-[2.5]" />
            <span>Tiếp tục nghe từ câu {lastReadBook.currentSentenceIndex + 1}</span>
          </button>
        </div>
      )}

      {/* Tab Navigation Header */}
      <div
        role="tablist"
        aria-label="Các phương thức nhập sách và văn bản"
        className={`grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 p-1.5 rounded-2xl ${themeConfig.card} ${themeConfig.border} border shadow-xl mb-4 w-full box-border`}
      >
        <button
          id="tab-text"
          role="tab"
          aria-selected={activeTab === 'text'}
          aria-controls="panel-text"
          onClick={() => switchTab('text')}
          className={`w-full min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm md:text-base font-bold transition-all ${
            activeTab === 'text'
              ? `${themeConfig.accent} ${themeConfig.accentText} shadow-md font-black`
              : `${themeConfig.textSecondary} hover:${themeConfig.textPrimary} hover:opacity-85`
          }`}
        >
          <FileText className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 stroke-[2.5]" />
          <span className="truncate">Dán Văn bản</span>
        </button>

        <button
          id="tab-file"
          role="tab"
          aria-selected={activeTab === 'file'}
          aria-controls="panel-file"
          onClick={() => switchTab('file')}
          className={`w-full min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm md:text-base font-bold transition-all ${
            activeTab === 'file'
              ? `${themeConfig.accent} ${themeConfig.accentText} shadow-md font-black`
              : `${themeConfig.textSecondary} hover:${themeConfig.textPrimary} hover:opacity-85`
          }`}
        >
          <Upload className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 stroke-[2.5]" />
          <span className="truncate">Tải tệp Sách</span>
        </button>

        <button
          id="tab-url"
          role="tab"
          aria-selected={activeTab === 'url'}
          aria-controls="panel-url"
          onClick={() => switchTab('url')}
          className={`w-full min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm md:text-base font-bold transition-all ${
            activeTab === 'url'
              ? `${themeConfig.accent} ${themeConfig.accentText} shadow-md font-black`
              : `${themeConfig.textSecondary} hover:${themeConfig.textPrimary} hover:opacity-85`
          }`}
        >
          <Globe className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 stroke-[2.5]" />
          <span className="truncate">Dán Link Web</span>
        </button>

        <button
          id="tab-camera"
          role="tab"
          aria-selected={activeTab === 'camera'}
          aria-controls="panel-camera"
          onClick={() => switchTab('camera')}
          className={`w-full min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm md:text-base font-bold transition-all ${
            activeTab === 'camera'
              ? `${themeConfig.accent} ${themeConfig.accentText} shadow-md font-black`
              : `${themeConfig.textSecondary} hover:${themeConfig.textPrimary} hover:opacity-85`
          }`}
        >
          <Camera className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 stroke-[2.5]" />
          <span className="truncate">Quét ảnh sách</span>
        </button>
      </div>

      {/* TAB 1: TEXT & PASTE */}
      {activeTab === 'text' && (
        <section
          id="panel-text"
          role="tabpanel"
          aria-labelledby="tab-text"
          className={`rounded-2xl p-4 sm:p-6 ${themeConfig.card} border ${themeConfig.border} shadow-xl space-y-4`}
        >
          {/* Document Title Bar */}
          <div className={`pb-3.5 border-b ${themeConfig.border}`}>
            <label htmlFor="input-doc-title" className={`block text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider mb-1.5`}>
              Tên sách / Tiêu đề bài đọc
            </label>
            <input
              id="input-doc-title"
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="Nhập tiêu đề tác phẩm hoặc bài viết..."
              className={`w-full h-11 px-3.5 py-2 text-sm sm:text-base font-bold rounded-xl ${themeConfig.inputBg} ${themeConfig.inputText} border ${themeConfig.inputBorder} transition-all outline-none focus:ring-2`}
            />
          </div>

          {/* Large Accessible Textarea */}
          <div className="relative">
            <label htmlFor="main-text-input" className="sr-only">
              Nội dung văn bản cần đọc
            </label>
            <textarea
              id="main-text-input"
              rows={9}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Dán hoặc gõ văn bản tiếng Việt vào đây (không giới hạn độ dài)... Bạn cũng có thể tải tệp sách hoặc chụp ảnh trang sách."
              className={`w-full p-4 rounded-xl text-base sm:text-lg leading-relaxed ${themeConfig.inputBg} ${themeConfig.inputText} border-2 ${themeConfig.inputBorder} resize-y font-normal transition-all`}
            />
          </div>

          {/* Text Metrics & Cleaning Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className={`flex items-center gap-4 text-xs font-medium ${themeConfig.textSecondary}`} aria-live="polite">
              <span>
                <strong className={`${themeConfig.textPrimary} text-sm font-bold`}>{wordCount}</strong> từ
              </span>
              <span>•</span>
              <span>
                <strong className={`${themeConfig.textPrimary} text-sm font-bold`}>{charCount}</strong> ký tự
              </span>
              <span>•</span>
              <span>
                Ước tính nghe: <strong className="text-sm font-bold" style={{ color: themeConfig.hex.accent }}>{estimatedMinutes} phút</strong>
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {/* Smart Clean Text */}
              <button
                id="btn-clean-text-input"
                type="button"
                onClick={handleCleanText}
                disabled={!inputText.trim() || isCleaning}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold ${themeConfig.cardInner} ${themeConfig.borderHighlight} border disabled:opacity-50 transition-all active:scale-95`}
                title="Tự động loại bỏ ký tự rác, sửa ngắt dòng và mở rộng từ viết tắt"
                aria-label="Làm sạch ký tự thừa và từ viết tắt"
              >
                {isCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Làm sạch văn bản</span>
              </button>

              {/* Clear Text */}
              <button
                id="btn-clear-text"
                type="button"
                onClick={() => {
                  if (!inputText.trim()) return;
                  if (voiceSettings.enableSoundCues) playSoundCue('click');
                  if (!showClearConfirm && inputText.trim().length > 50) {
                    setShowClearConfirm(true);
                    setTimeout(() => setShowClearConfirm(false), 3500);
                    return;
                  }
                  setInputText('');
                  setDocTitle('Văn bản mới');
                  setParsedFileInfo(null);
                  setUrlSuccessInfo(null);
                  setShowClearConfirm(false);
                }}
                disabled={!inputText.trim()}
                className={`flex items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                  showClearConfirm
                    ? 'bg-red-500/20 border-red-500 text-red-300 ring-2 ring-red-500/40'
                    : `${themeConfig.cardInner} ${themeConfig.border} text-red-400 hover:text-red-300`
                } disabled:opacity-40`}
                title={showClearConfirm ? 'Bấm lần nữa để xác nhận xóa trắng' : 'Xóa trắng nội dung'}
                aria-label={showClearConfirm ? 'Bấm lần nữa để xác nhận xóa trắng' : 'Xóa trắng nội dung'}
              >
                <Trash2 className="w-4 h-4" />
                {showClearConfirm && (
                  <span className="text-xs font-bold text-red-300 animate-pulse">Bấm lại để xóa</span>
                )}
              </button>

              {/* Primary Launch Reader Button */}
              <button
                id="btn-start-reading-main"
                type="button"
                onClick={handleStartReading}
                disabled={!inputText.trim()}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm sm:text-base font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-lg transition-all active:scale-95 disabled:opacity-50`}
                aria-label="Bắt đầu đọc sách và phát giọng nói"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Bắt đầu đọc sách</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: FILE UPLOAD */}
      {activeTab === 'file' && (
        <section
          id="panel-file"
          role="tabpanel"
          aria-labelledby="tab-file"
          className={`rounded-2xl p-6 sm:p-8 ${themeConfig.card} border ${themeConfig.border} shadow-xl space-y-6 text-center`}
        >
          {/* Format Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 pb-2">
            <span className={`text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider mr-1`}>Định dạng hỗ trợ:</span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-red-950/60 text-red-400 border border-red-800/60">
              PDF (.pdf)
            </span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-950/60 text-amber-400 border border-amber-800/60">
              EPUB (.epub)
            </span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-950/60 text-blue-400 border border-blue-800/60">
              WORD (.docx)
            </span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
              TEXT (.txt / .md)
            </span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-950/60 text-purple-400 border border-purple-800/60">
              WEB (.html)
            </span>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInputRef.current.files = dataTransfer.files;
                handleFileUpload({ target: fileInputRef.current } as any);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed ${themeConfig.border} hover:${themeConfig.borderHighlight} hover:${themeConfig.cardInner} rounded-2xl p-8 sm:p-10 cursor-pointer transition-all flex flex-col items-center justify-center gap-4 group`}
            role="button"
            tabIndex={0}
            aria-label="Khu vực kéo thả hoặc nhấn để chọn tệp tài liệu sách PDF, EPUB, DOCX, TXT"
          >
            <div className={`w-16 h-16 rounded-2xl ${themeConfig.cardInner} border ${themeConfig.border} group-hover:${themeConfig.accent} group-hover:${themeConfig.accentText} flex items-center justify-center transition-all shadow-inner`}>
              <FileUp className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div>
              <h3 className={`text-lg sm:text-xl font-black ${themeConfig.textPrimary} mb-1`}>
                Kéo thả hoặc nhấn để tải tệp Sách / Tài liệu
              </h3>
              <p className={`text-sm ${themeConfig.textSecondary} max-w-lg mx-auto`}>
                Hỗ trợ trích xuất toàn diện: <strong>PDF sách điện tử, EPUB phân chương, Word (.docx), Markdown và Text</strong>. Tự động chia chương, loại bỏ ký tự rác và chuẩn hóa phát âm tiếng Việt.
              </p>
            </div>

            <input
              ref={fileInputRef}
              id="file-input-hidden"
              type="file"
              accept=".pdf,.epub,.docx,.txt,.md,.json,.csv,.html,.htm"
              onChange={handleFileUpload}
              className="hidden"
            />

            <span className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold ${themeConfig.cardInner} border ${themeConfig.border} ${themeConfig.textPrimary} group-hover:border-amber-400 transition-colors`}>
              Chọn tệp từ máy tính / điện thoại
            </span>
          </div>

          {isReadingFile && (
            <div className={`p-4 rounded-xl ${themeConfig.cardInner} border ${themeConfig.borderHighlight} space-y-2`}>
              <div className="flex items-center justify-center gap-3 font-bold text-sm" style={{ color: themeConfig.hex.accent }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{fileProgressMsg || 'Đang đọc và giải mã nội dung tệp...'}</span>
              </div>
              <p className={`text-xs ${themeConfig.textSecondary}`}>Đang chuyển đổi thành văn bản sạch để đọc giọng nói...</p>
            </div>
          )}

          {fileError && (
            <div className="flex items-center justify-center gap-2 text-red-400 text-sm font-semibold p-4 rounded-xl bg-red-950/40 border border-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {/* Success Summary Card after parsing */}
          {parsedFileInfo && !isReadingFile && (
            <div className={`p-5 rounded-2xl ${themeConfig.cardInner} border border-emerald-500/40 text-left space-y-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Trích xuất thành công: {uploadedFileName}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-black ${themeConfig.card} ${themeConfig.border} border`} style={{ color: themeConfig.hex.accent }}>
                  {parsedFileInfo.fileType}
                </span>
              </div>

              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs ${themeConfig.card} p-3 rounded-xl border ${themeConfig.border}`}>
                <div>
                  <span className={`${themeConfig.textSecondary} block`}>Tiêu đề:</span>
                  <span className={`font-bold ${themeConfig.textPrimary} truncate block`}>{parsedFileInfo.title}</span>
                </div>
                <div>
                  <span className={`${themeConfig.textSecondary} block`}>Độ dài:</span>
                  <span className="font-bold" style={{ color: themeConfig.hex.accent }}>{parsedFileInfo.wordCount.toLocaleString()} từ</span>
                </div>
                <div>
                  <span className={`${themeConfig.textSecondary} block`}>Phân đoạn:</span>
                  <span className={`font-bold ${themeConfig.textPrimary}`}>
                    {parsedFileInfo.pageOrChapterCount
                      ? `${parsedFileInfo.pageOrChapterCount} ${parsedFileInfo.fileType === 'PDF' ? 'trang' : 'chương'}`
                      : 'Toàn văn'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => switchTab('text')}
                  className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold ${themeConfig.textPrimary} ${themeConfig.card} ${themeConfig.border} border hover:opacity-90 transition-all`}
                >
                  Chỉnh sửa văn bản trong khung soạn thảo
                </button>
                <button
                  type="button"
                  onClick={handleStartReading}
                  className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-lg transition-all active:scale-95`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Bắt đầu đọc sách ngay</span>
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB: WEB LINK & ONLINE ARTICLE EXTRACTOR */}
      {activeTab === 'url' && (
        <section
          id="panel-url"
          role="tabpanel"
          aria-labelledby="tab-url"
          className={`rounded-2xl p-6 sm:p-8 ${themeConfig.card} border ${themeConfig.border} shadow-xl space-y-6`}
        >
          <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b ${themeConfig.border}`}>
            <div>
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: themeConfig.hex.accent }}>
                <Globe className="w-5 h-5" />
                <span>Đọc báo & Bài viết từ Link Web (URL)</span>
              </h3>
              <p className={`text-xs ${themeConfig.textSecondary} mt-0.5`}>
                Dán đường dẫn bài báo, blog, tài liệu trực tuyến. Hệ thống tự động loại bỏ quảng cáo, menu và định dạng thành bài đọc mượt mà.
              </p>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="space-y-3">
            <label htmlFor="input-web-url" className={`block text-xs font-bold ${themeConfig.textSecondary} uppercase tracking-wider`}>
              Đường dẫn bài viết (URL)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  id="input-web-url"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://vnexpress.net/... hoặc https://tuoitre.vn/..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isFetchingUrl) {
                      e.preventDefault();
                      handleFetchUrl();
                    }
                  }}
                  className={`w-full px-4 py-3.5 pl-10 rounded-xl ${themeConfig.inputBg} border ${themeConfig.inputBorder} text-sm ${themeConfig.inputText} outline-none font-medium transition-all`}
                />
                <Link2 className={`w-4 h-4 ${themeConfig.textSecondary} absolute left-3.5 top-4`} />
              </div>

              <button
                type="button"
                onClick={() => handleFetchUrl()}
                disabled={isFetchingUrl || !urlInput.trim()}
                className={`flex-1 sm:flex-none px-6 py-3.5 rounded-xl text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95`}
              >
                {isFetchingUrl ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang bóc tách...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 stroke-[2.5]" />
                    <span>Trích xuất nội dung</span>
                  </>
                )}
              </button>
            </div>
          </div>



          {/* Fetching Progress */}
          {isFetchingUrl && (
            <div className={`p-4 rounded-xl ${themeConfig.cardInner} border ${themeConfig.borderHighlight} space-y-2 text-center`}>
              <div className="flex items-center justify-center gap-3 font-bold text-sm" style={{ color: themeConfig.hex.accent }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Đang tải và làm sạch bài viết từ liên kết...</span>
              </div>
              <p className={`text-xs ${themeConfig.textSecondary}`}>Loại bỏ quảng cáo, hình ảnh rác và giữ lại toàn bộ bài viết chính</p>
            </div>
          )}

          {/* URL Error */}
          {urlError && (
            <div className="flex items-center justify-center gap-2 text-red-400 text-sm font-semibold p-4 rounded-xl bg-red-950/40 border border-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{urlError}</span>
            </div>
          )}

          {/* Success Summary Card */}
          {urlSuccessInfo && !isFetchingUrl && (
            <div className={`p-5 rounded-2xl ${themeConfig.cardInner} border border-emerald-500/40 text-left space-y-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Đã trích xuất bài viết thành công</span>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-black bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                  {urlSuccessInfo.wordCount.toLocaleString()} từ
                </span>
              </div>

              <div className={`space-y-1.5 ${themeConfig.card} p-3 rounded-xl border ${themeConfig.border}`}>
                <h4 className={`font-bold ${themeConfig.textPrimary} text-sm line-clamp-2`}>
                  {urlSuccessInfo.title}
                </h4>
                <p className={`text-xs ${themeConfig.textSecondary} truncate`}>
                  Nguồn: {urlSuccessInfo.url}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => switchTab('text')}
                  className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold ${themeConfig.textPrimary} ${themeConfig.card} ${themeConfig.border} border hover:opacity-90 transition-all`}
                >
                  Xem & chỉnh sửa văn bản
                </button>
                <button
                  type="button"
                  onClick={handleStartReading}
                  className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-lg transition-all active:scale-95`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Bắt đầu nghe bài viết ngay</span>
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: CAMERA & BOOK PHOTO OCR */}
      {activeTab === 'camera' && (
        <section
          id="panel-camera"
          role="tabpanel"
          aria-labelledby="tab-camera"
          className={`rounded-2xl p-4 sm:p-6 ${themeConfig.card} border ${themeConfig.border} shadow-xl space-y-6`}
        >
          {/* Header Description */}
          <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b ${themeConfig.border}`}>
            <div>
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: themeConfig.hex.accent }}>
                <Camera className="w-5 h-5" />
                <span>Quét ảnh sách & Tài liệu in (AI Vision OCR)</span>
              </h3>
              <p className={`text-xs ${themeConfig.textSecondary} mt-0.5`}>
                Chụp trực tiếp từ camera hoặc tải nhiều ảnh trang sách. AI sẽ tự động loại bỏ số trang, tiêu đề đầu trang và vết mờ.
              </p>
            </div>

            {/* OCR Mode notification badge */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${themeConfig.cardInner} border ${themeConfig.border} text-xs font-bold`}>
              {isOffline ? (
                <>
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Offline OCR (Tesseract Engine)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" style={{ color: themeConfig.hex.accent }} />
                  <span style={{ color: themeConfig.hex.accent }}>AI Vision OCR (Gemini + Tesseract)</span>
                </>
              )}
            </div>
          </div>

          {/* Camera Viewport / Live Stream */}
          {isCameraActive ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-[380px] flex items-center justify-center border-2 border-[#FFB300]/50 shadow-2xl">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Guidance overlay box for book page framing */}
              <div
                className="absolute inset-4 sm:inset-8 border-2 border-dashed rounded-xl pointer-events-none flex items-center justify-center"
                style={{ borderColor: themeConfig.hex.accent }}
              >
                <span className={`px-3 py-1 rounded-md text-xs font-bold shadow ${themeConfig.card} ${themeConfig.textPrimary} border ${themeConfig.border}`}>
                  Căn trang sách vào khung này
                </span>
              </div>

              {/* Shutter Action Bar */}
              <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-4">
                <button
                  id="btn-capture-photo"
                  type="button"
                  onClick={capturePhoto}
                  className={`px-6 py-3 rounded-full ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} font-black shadow-2xl flex items-center gap-2 text-base active:scale-95 transition-all`}
                  aria-label="Chụp ảnh trang sách"
                >
                  <Camera className="w-5 h-5 stroke-[2.5]" />
                  <span>Chụp trang này</span>
                </button>

                <button
                  id="btn-stop-camera"
                  type="button"
                  onClick={stopCamera}
                  className={`px-4 py-3 rounded-full ${themeConfig.cardInner} ${themeConfig.textPrimary} text-xs font-bold border ${themeConfig.border} active:scale-95 transition-all`}
                  aria-label="Đóng máy ảnh"
                >
                  Tắt Camera
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Start Camera Box */}
              <button
                id="btn-start-camera"
                type="button"
                onClick={startCamera}
                className={`p-6 rounded-2xl ${themeConfig.cardInner} hover:opacity-95 border-2 border-dashed ${themeConfig.border} hover:border-amber-400 transition-all flex flex-col items-center justify-center gap-3 text-center group active:scale-98`}
                aria-label="Bật camera để chụp ảnh trang sách trực tiếp"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all"
                  style={{ backgroundColor: `${themeConfig.hex.accent}25`, color: themeConfig.hex.accent }}
                >
                  <Camera className="w-7 h-7 stroke-[2.5]" />
                </div>
                <span className={`text-base font-bold ${themeConfig.textPrimary}`}>Bật Camera Chụp Trực Tiếp</span>
                <span className={`text-xs ${themeConfig.textSecondary}`}>Dùng máy ảnh điện thoại/laptop quét trang sách</span>
              </button>

              {/* Upload Book Photos Box */}
              <button
                id="btn-upload-photos"
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className={`p-6 rounded-2xl ${themeConfig.cardInner} hover:opacity-95 border-2 border-dashed ${themeConfig.border} hover:border-amber-400 transition-all flex flex-col items-center justify-center gap-3 text-center group active:scale-98`}
                aria-label="Tải ảnh trang sách đã chụp từ thư viện"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all"
                  style={{ backgroundColor: `${themeConfig.hex.accent}25`, color: themeConfig.hex.accent }}
                >
                  <ImageIcon className="w-7 h-7 stroke-[2.5]" />
                </div>
                <span className={`text-base font-bold ${themeConfig.textPrimary}`}>Tải Ảnh Trang Sách Từ Máy</span>
                <span className={`text-xs ${themeConfig.textSecondary}`}>Chọn 1 hoặc nhiều ảnh chụp cùng lúc (.jpg, .png)</span>
              </button>

              <input
                ref={photoInputRef}
                id="photo-input-hidden"
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          )}

          {/* Captured / Uploaded Images Grid */}
          {capturedImages.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#9E9EA8] uppercase tracking-wider">
                  Danh sách trang sách đã chọn ({capturedImages.length} trang)
                </span>
                <button
                  type="button"
                  onClick={() => setCapturedImages([])}
                  className="text-xs font-semibold text-red-400 hover:text-red-300"
                >
                  Xóa tất cả ảnh
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {capturedImages.map((img, idx) => (
                  <div
                    key={img.id}
                    className={`relative group rounded-xl overflow-hidden ${themeConfig.cardInner} border ${themeConfig.border} aspect-3/4 shadow-md`}
                  >
                    <img
                      src={img.url}
                      alt={`Trang sách ${idx + 1}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className={`absolute top-1 left-1 ${themeConfig.card} ${themeConfig.textPrimary} border ${themeConfig.border} px-1.5 py-0.5 rounded text-[10px] font-black`}>
                      Trang {idx + 1}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removeCapturedImage(img.id);
                      }}
                      className="absolute top-1 right-1 p-1 rounded-md bg-red-600/90 hover:bg-red-500 text-white shadow transition-all cursor-pointer z-10"
                      title="Xóa trang này"
                      aria-label={`Xóa trang ${idx + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Start OCR Processing Button */}
              <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className={`text-xs ${themeConfig.textSecondary}`}>
                  AI sẽ tự động nhận dạng chữ Việt, ghép thành đoạn văn liền mạch và chuyển sang bảng đọc.
                </p>

                <button
                  id="btn-process-ocr"
                  type="button"
                  onClick={handleProcessOcr}
                  disabled={isOcrProcessing}
                  className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-black ${themeConfig.accent} ${themeConfig.accentHover} ${themeConfig.accentText} shadow-lg transition-all active:scale-95 disabled:opacity-50`}
                  aria-label={`Nhận diện chữ từ ${capturedImages.length} trang sách`}
                >
                  {isOcrProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>
                        Đang quét trang {ocrProgress.current}/{ocrProgress.total}...
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 stroke-[2.5]" />
                      <span>Trích xuất chữ & Đọc ({capturedImages.length} trang)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {ocrError && (
            <div className="flex items-center gap-2 text-red-400 text-sm font-semibold p-3 rounded-xl bg-red-950/40 border border-red-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{ocrError}</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

import { EmotionStyle } from '../types';

export interface OcrResult {
  text: string;
  success: boolean;
  error?: string;
}

async function safeParseJson(res: Response, fallbackError: string): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await res.text();
    console.error('Non-JSON response from server:', rawText.slice(0, 150));
    throw new Error(`${fallbackError} (Mã lỗi: ${res.status})`);
  }
  return await res.json();
}



export async function generateEdgeSpeech(
  text: string,
  voice: string = 'vi-VN-HoaiMyNeural',
  rate: number = 1.0,
  pitch: number = 1.0,
  volume: number = 1.0
): Promise<{
  audioBase64: string;
  sampleRate: number;
  mimeType: string;
  isFallback?: boolean;
  fallbackVoiceName?: string;
  fallbackReason?: string;
}> {
  try {
    const res = await fetch('/api/tts/edge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate, pitch, volume }),
    });

    const data = await safeParseJson(res, 'Lỗi tạo giọng đọc Microsoft Edge');
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Lỗi tạo giọng đọc Microsoft Edge.');
    }

    return {
      audioBase64: data.audioBase64,
      sampleRate: data.sampleRate || 24000,
      mimeType: data.mimeType || 'audio/mp3',
      isFallback: data.isFallback,
      fallbackVoiceName: data.fallbackVoiceName,
      fallbackReason: data.fallbackReason,
    };
  } catch (error: any) {
    console.error('Edge TTS API Error:', error);
    throw error;
  }
}

export async function generateGoogleTranslateSpeech(
  text: string,
  voice: string = 'google_translate_vi'
): Promise<{ audioBase64: string; sampleRate: number; mimeType: string }> {
  try {
    const res = await fetch('/api/tts/google-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });

    const data = await safeParseJson(res, 'Lỗi tạo giọng đọc Google Translate');
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Lỗi tạo giọng đọc Google Translate TTS.');
    }

    return {
      audioBase64: data.audioBase64,
      sampleRate: data.sampleRate || 24000,
      mimeType: data.mimeType || 'audio/mp3',
    };
  } catch (error: any) {
    console.error('Google Translate TTS API Error:', error);
    throw error;
  }
}

export async function fetchWebArticle(url: string): Promise<{
  title: string;
  text: string;
  url: string;
  wordCount: number;
}> {
  try {
    const res = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await safeParseJson(res, 'Lỗi tải trang web');
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Không thể trích xuất nội dung từ liên kết web.');
    }

    return data;
  } catch (error: any) {
    console.error('Fetch Web Article Error:', error);
    throw error;
  }
}


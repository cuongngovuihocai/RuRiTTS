export interface OcrResult {
  text: string;
  success: boolean;
  error?: string;
}

const BACKEND_URL_STORAGE_KEY = 'ruri_backend_url';

export function isStaticHosting(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.endsWith('github.io') ||
    host.endsWith('pages.dev') ||
    host.endsWith('netlify.app') ||
    window.location.protocol === 'file:'
  );
}

export function normalizeBackendUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  let withProto = trimmed;
  if (!/^https?:\/\//i.test(withProto)) {
    withProto = `https://${withProto}`;
  }
  return withProto.replace(/\/+$/, '').replace(/\/api$/i, '');
}

export function getConfiguredBackendUrl(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(BACKEND_URL_STORAGE_KEY);
      if (saved && saved.trim()) {
        return normalizeBackendUrl(saved);
      }
    }
  } catch {}

  const envUrl = (import.meta as any)?.env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return normalizeBackendUrl(envUrl);
  }
  return '';
}

export function setConfiguredBackendUrl(url: string): string {
  const normalized = normalizeBackendUrl(url);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (normalized) {
        window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
      }
    }
  } catch {}
  return normalized;
}

export function hasBackendSupport(): boolean {
  return !isStaticHosting() || Boolean(getConfiguredBackendUrl());
}

export function getApiEndpoint(path: string): string | null {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const configuredBase = getConfiguredBackendUrl();
  if (configuredBase) {
    return `${configuredBase}${cleanPath}`;
  }
  if (!isStaticHosting()) {
    return cleanPath;
  }
  return null;
}

export async function checkBackendHealth(testUrl?: string): Promise<{
  ok: boolean;
  resolvedUrl: string;
  error?: string;
}> {
  const base = testUrl !== undefined ? normalizeBackendUrl(testUrl) : getConfiguredBackendUrl();
  const endpoint = base ? `${base}/api/health` : !isStaticHosting() ? '/api/health' : '';
  if (!endpoint) {
    return { ok: false, resolvedUrl: '', error: 'Chưa nhập địa chỉ Backend Vercel.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(endpoint, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, resolvedUrl: base, error: `Máy chủ phản hồi mã lỗi ${res.status}.` };
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: false, resolvedUrl: base, error: 'Đường dẫn này không phải Backend API (không trả về JSON).' };
    }
    const data = await res.json();
    if (data?.ok) {
      return { ok: true, resolvedUrl: base };
    }
    return { ok: false, resolvedUrl: base, error: 'Backend không trả về trạng thái hợp lệ.' };
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      return { ok: false, resolvedUrl: base, error: 'Quá thời gian kết nối tới Backend (Timeout).' };
    }
    return { ok: false, resolvedUrl: base, error: err?.message || 'Không thể kết nối tới Backend.' };
  }
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
  const endpoint = getApiEndpoint('/api/tts/edge');
  if (!endpoint) {
    throw new Error('STATIC_HOSTING: Chưa kết nối máy chủ Backend Vercel. Tự động chuyển sang giọng đọc thiết bị.');
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate, pitch, volume }),
    });

    if (res.status === 405 || res.status === 404) {
      throw new Error('STATIC_HOSTING: API không khả dụng trên máy chủ hiện tại.');
    }

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
    console.warn('Edge TTS API warning:', error?.message);
    throw error;
  }
}

export async function generateGoogleTranslateSpeech(
  text: string,
  voice: string = 'google_translate_vi'
): Promise<{ audioBase64: string; sampleRate: number; mimeType: string }> {
  const endpoint = getApiEndpoint('/api/tts/google-translate');
  if (!endpoint) {
    throw new Error('STATIC_HOSTING: Chưa kết nối máy chủ Backend Vercel. Tự động chuyển sang giọng đọc thiết bị.');
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });

    if (res.status === 405 || res.status === 404) {
      throw new Error('STATIC_HOSTING: API không khả dụng trên máy chủ hiện tại.');
    }

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
    console.warn('Google Translate TTS API warning:', error?.message);
    throw error;
  }
}

/**
 * Parse raw HTML into clean article title and text client-side using browser DOMParser
 */
function parseHtmlClientSide(html: string, url: string): { title: string; text: string; url: string; wordCount: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove noise elements
  const noiseSelectors =
    'script, style, noscript, svg, iframe, form, button, nav, header, footer, aside, .header, .footer, .sidebar, .menu, .nav, .ad, .ads, .advertisement, .banner, .social-share, .relative-news, .box-comment, .comment, .related, .author-box';
  doc.querySelectorAll(noiseSelectors).forEach((el) => el.remove());

  // Extract Title
  let title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
    doc.querySelector('h1.title-detail, h1.article-title, h1.detail-title, h1.post-title, h1')?.textContent?.trim() ||
    doc.title?.trim() ||
    'Bài viết web';

  title = title
    .replace(/\s*[-|]\s*(VnExpress|Tuổi Trẻ|Dân Trí|Vietnamnet|Thanh Niên|Zing|Kênh 14|Báo|Truyện Cổ Tích|TruyenCoTich).*$/i, '')
    .trim();

  // Look for article containers
  const candidates = [
    'article',
    '.fck_detail',
    '.detail-content',
    '.article-content',
    '.content-detail',
    '.detail__content',
    '.post-content',
    '.entry-content',
    '.story-body',
    'main',
    '#main-content',
    '.main-content',
  ];

  let mainElement: Element | null = null;
  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    if (el && (el.textContent || '').trim().length > 200) {
      mainElement = el;
      break;
    }
  }

  const paragraphs: string[] = [];
  const description =
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
    doc.querySelector('.description, .lead, .sapo, .detail-sapo, .article-sapo')?.textContent?.trim();

  if (description && description.length > 20) {
    paragraphs.push(description);
  }

  const targetRoot = mainElement || doc.body;
  if (targetRoot) {
    targetRoot.querySelectorAll('p, h2, h3, h4, blockquote, li').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (t.length > 15 && !paragraphs.includes(t)) {
        paragraphs.push(t);
      }
    });
  }

  let articleText = paragraphs.join('\n\n');
  if (!articleText || articleText.length < 50) {
    articleText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  const wordCount = articleText.split(/\s+/).filter(Boolean).length;
  return {
    title,
    text: articleText,
    url,
    wordCount,
  };
}

/**
 * Client-side Article Extractor using CORS proxies (for GitHub Pages / PWA without backend)
 */
async function extractArticleClientSide(url: string): Promise<{
  title: string;
  text: string;
  url: string;
  wordCount: number;
}> {
  // Method 1: Jina Reader API (https://r.jina.ai/) - Fast, high quality, handles dynamic sites, no CORS issue
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: 'text/plain',
      },
    });

    if (jinaRes.ok) {
      const raw = await jinaRes.text();
      let title = '';
      let bodyText = raw;

      const titleMatch = raw.match(/^Title:\s*([^\n]+)/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      const contentIdx = raw.indexOf('Markdown Content:');
      if (contentIdx !== -1) {
        bodyText = raw.slice(contentIdx + 'Markdown Content:'.length).trim();
      }

      // Clean markdown images, links, markdown headers
      bodyText = bodyText
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/^[#*>-]+\s*/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (bodyText.length > 50) {
        const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
        return {
          title: title || 'Bài viết web',
          text: bodyText,
          url,
          wordCount,
        };
      }
    }
  } catch (err) {
    console.warn('Jina reader proxy failed, trying AllOrigins:', err);
  }

  // Method 2: AllOrigins CORS proxy with DOMParser
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      const html = json.contents;
      if (html && typeof html === 'string') {
        const parsed = parseHtmlClientSide(html, url);
        if (parsed.text.length > 50) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('AllOrigins proxy failed, trying Corsproxy:', err);
  }

  // Method 3: Corsproxy.io with DOMParser
  try {
    const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const corsRes = await fetch(corsProxyUrl);
    if (corsRes.ok) {
      const html = await corsRes.text();
      if (html && typeof html === 'string') {
        const parsed = parseHtmlClientSide(html, url);
        if (parsed.text.length > 50) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Corsproxy failed:', err);
  }

  throw new Error('Không thể trích xuất nội dung từ liên kết này. Vui lòng kiểm tra lại đường dẫn hoặc sao chép và dán trực tiếp vào tab Dán Văn bản.');
}

export async function fetchWebArticle(url: string): Promise<{
  title: string;
  text: string;
  url: string;
  wordCount: number;
}> {
  const endpoint = getApiEndpoint('/api/fetch-url');
  if (!endpoint) {
    return await extractArticleClientSide(url);
  }

  // Try configured backend server first, with automatic fallback to client-side extractor
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (res.status === 405 || res.status === 404) {
      return await extractArticleClientSide(url);
    }

    const data = await safeParseJson(res, 'Lỗi tải trang web');
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Không thể trích xuất nội dung từ liên kết web.');
    }

    return data;
  } catch (error: any) {
    console.warn('Backend fetch-url failed, falling back to client-side extractor:', error?.message);
    return await extractArticleClientSide(url);
  }
}

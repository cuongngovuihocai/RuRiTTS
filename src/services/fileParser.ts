import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker
try {
  if (typeof window !== 'undefined') {
    // Set fallback worker URL matching version or unpkg CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn('Could not set pdf.workerSrc:', e);
}

export interface ParsedDocumentResult {
  title: string;
  text: string;
  fileType: 'pdf' | 'epub' | 'docx' | 'txt' | 'md' | 'html' | 'other';
  pageOrChapterCount?: number;
}

/**
 * Extract text from PDF File using pdfjs-dist
 */
export async function parsePdfFile(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ParsedDocumentResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) onProgress(pageNum, numPages);
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items into lines
    let lastY: number | null = null;
    let pageStr = '';

    for (const item of textContent.items as any[]) {
      if (!('str' in item)) continue;
      const str = item.str;
      if (!str) continue;

      const currentY = item.transform ? item.transform[5] : null;
      if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
        pageStr += '\n' + str;
      } else {
        pageStr += (pageStr.length > 0 && !pageStr.endsWith(' ') && !str.startsWith(' ') ? ' ' : '') + str;
      }
      lastY = currentY;
    }

    if (pageStr.trim()) {
      pageTexts.push(`--- Trang ${pageNum} ---\n` + pageStr.trim());
    }
  }

  const title = file.name.replace(/\.[^/.]+$/, '');
  return {
    title,
    text: pageTexts.join('\n\n'),
    fileType: 'pdf',
    pageOrChapterCount: numPages,
  };
}

/**
 * Extract text from EPUB File using JSZip
 */
export async function parseEpubFile(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ParsedDocumentResult> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  // 1. Read META-INF/container.xml to find the root OPF file
  const containerXml = await loadedZip.file('META-INF/container.xml')?.async('text');
  let opfPath = 'OEBPS/content.opf';

  if (containerXml) {
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/i);
    if (rootfileMatch && rootfileMatch[1]) {
      opfPath = rootfileMatch[1];
    }
  }

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfContent = await loadedZip.file(opfPath)?.async('text');

  let bookTitle = file.name.replace(/\.[^/.]+$/, '');
  const chapterFiles: string[] = [];

  if (opfContent) {
    // Try to extract book title from dc:title
    const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    if (titleMatch && titleMatch[1]) {
      bookTitle = titleMatch[1].trim();
    }

    // Parse manifest to map id -> href
    const manifestItems: Record<string, string> = {};
    const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"/gi;
    let match;
    while ((match = itemRegex.exec(opfContent)) !== null) {
      manifestItems[match[1]] = match[2];
    }

    // Parse spine to get correct reading order
    const spineRegex = /<itemref\s+[^>]*idref="([^"]+)"/gi;
    while ((match = spineRegex.exec(opfContent)) !== null) {
      const idref = match[1];
      const href = manifestItems[idref];
      if (href) {
        // Resolve path relative to opf directory
        const fullPath = (opfDir + href).replace(/\\/g, '/');
        // Clean any url decoding or query strings
        const cleanPath = decodeURIComponent(fullPath.split('#')[0]);
        if (!chapterFiles.includes(cleanPath)) {
          chapterFiles.push(cleanPath);
        }
      }
    }
  }

  // Fallback: If no spine found, look for all .xhtml/.html files
  if (chapterFiles.length === 0) {
    loadedZip.forEach((relativePath) => {
      if (/\.(xhtml|html|htm)$/i.test(relativePath) && !relativePath.includes('toc')) {
        chapterFiles.push(relativePath);
      }
    });
    chapterFiles.sort();
  }

  const extractedChapters: string[] = [];
  const total = chapterFiles.length;

  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress(i + 1, total);
    const path = chapterFiles[i];
    
    // Try exact path or matching key
    let fileObj = loadedZip.file(path);
    if (!fileObj) {
      // Find case-insensitive or base name
      const foundKey = Object.keys(loadedZip.files).find(
        (k) => k.toLowerCase() === path.toLowerCase() || k.endsWith(path.split('/').pop() || '')
      );
      if (foundKey) fileObj = loadedZip.file(foundKey);
    }

    if (fileObj) {
      const rawHtml = await fileObj.async('text');
      const cleanText = extractTextFromHtml(rawHtml);
      if (cleanText.trim().length > 30) {
        extractedChapters.push(cleanText.trim());
      }
    }
  }

  return {
    title: bookTitle,
    text: extractedChapters.join('\n\n=== CHƯƠNG TIẾP THEO ===\n\n'),
    fileType: 'epub',
    pageOrChapterCount: extractedChapters.length,
  };
}

/**
 * Extract text from DOCX File using mammoth
 */
export async function parseDocxFile(file: File): Promise<ParsedDocumentResult> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const title = file.name.replace(/\.[^/.]+$/, '');
  return {
    title,
    text: result.value,
    fileType: 'docx',
  };
}

/**
 * Universal document loader dispatcher
 */
export async function parseAnyDocument(
  file: File,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<ParsedDocumentResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (extension === 'pdf' || file.type === 'application/pdf') {
    if (onProgress) onProgress(0, 100, 'Đang đọc cấu trúc tệp PDF...');
    return await parsePdfFile(file, (cur, tot) => {
      if (onProgress) onProgress(cur, tot, `Đang trích xuất trang ${cur}/${tot}...`);
    });
  }

  if (extension === 'epub' || file.type === 'application/epub+zip') {
    if (onProgress) onProgress(0, 100, 'Đang mở gói sách điện tử EPUB...');
    return await parseEpubFile(file, (cur, tot) => {
      if (onProgress) onProgress(cur, tot, `Đang trích xuất chương ${cur}/${tot}...`);
    });
  }

  if (extension === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    if (onProgress) onProgress(0, 100, 'Đang đọc văn bản Word (.docx)...');
    return await parseDocxFile(file);
  }

  // Text, Markdown, HTML, JSON, etc.
  if (onProgress) onProgress(0, 100, 'Đang đọc tệp văn bản...');
  const text = await file.text();

  if (extension === 'html' || extension === 'htm') {
    return {
      title: file.name.replace(/\.[^/.]+$/, ''),
      text: extractTextFromHtml(text),
      fileType: 'html',
    };
  }

  return {
    title: file.name.replace(/\.[^/.]+$/, ''),
    text,
    fileType: extension === 'md' ? 'md' : extension === 'txt' ? 'txt' : 'other',
  };
}

/**
 * Helper to strip HTML tags, preserve paragraphs and decode entities
 */
function extractTextFromHtml(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Remove non-content elements
      const toRemove = doc.querySelectorAll('script, style, noscript, svg, head');
      toRemove.forEach((el) => el.remove());

      // Extract headings and paragraphs with line breaks
      const elements = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote, li, tr');
      if (elements.length > 0) {
        const lines: string[] = [];
        elements.forEach((el) => {
          const txt = el.textContent?.trim();
          if (txt) lines.push(txt);
        });
        return lines.join('\n\n');
      }

      return doc.body.textContent || '';
    } catch {
      // Fallback below
    }
  }

  // Regex fallback
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');
}

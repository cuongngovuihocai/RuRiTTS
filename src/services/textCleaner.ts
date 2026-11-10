import { Chapter, CustomDictionaryEntry, SentenceItem } from '../types';

/**
 * Creates a Unicode-aware regular expression for whole word matching.
 * Standard JavaScript `\b` is ASCII-only and breaks on accented Vietnamese characters (e.g. ầ, ư, ợ, ộ, ý).
 * This uses Unicode negative lookbehind/lookahead for Unicode letters (\p{L}) and numbers (\p{N}).
 */
export function createUnicodeWordRegex(word: string, caseSensitive: boolean = false): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = caseSensitive ? 'gu' : 'giu';
  // Use prefix capture group instead of lookbehind for universal iOS Safari compatibility
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
}

/**
 * Convert small integer (0 - 999) to Vietnamese words
 */
function readThreeDigits(n: number, showZeroHundred: boolean = false): string {
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const hundred = Math.floor(n / 100);
  const ten = Math.floor((n % 100) / 10);
  const unit = n % 10;
  let res = '';

  if (hundred > 0 || showZeroHundred) {
    res += `${digits[hundred]} trăm `;
  }

  if (ten > 1) {
    res += `${digits[ten]} mươi `;
    if (unit === 1) res += 'mốt';
    else if (unit === 5) res += 'lăm';
    else if (unit > 0) res += digits[unit];
  } else if (ten === 1) {
    res += 'mười ';
    if (unit === 5) res += 'lăm';
    else if (unit > 0) res += digits[unit];
  } else if (ten === 0 && unit > 0) {
    if (hundred > 0 || showZeroHundred) res += 'lẻ ';
    res += digits[unit];
  }

  return res.trim();
}

/**
 * Converts integer number to natural Vietnamese words
 */
export function numberToVietnameseWords(num: number | string): string {
  const n = typeof num === 'string' ? parseInt(num.replace(/[.,]/g, ''), 10) : Math.floor(num);
  if (isNaN(n) || n === 0) return 'không';
  if (n < 0) return 'âm ' + numberToVietnameseWords(Math.abs(n));

  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  let temp = n;
  let groupIndex = 0;
  const groups: string[] = [];

  while (temp > 0) {
    const chunk = temp % 1000;
    if (chunk > 0) {
      const showZero = temp > 999 && chunk < 100;
      const chunkStr = readThreeDigits(chunk, showZero);
      const unitStr = units[groupIndex] ? ` ${units[groupIndex]}` : '';
      groups.unshift(`${chunkStr}${unitStr}`);
    }
    temp = Math.floor(temp / 1000);
    groupIndex++;
  }

  return groups.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Offline rule-based Vietnamese deep text cleaner & normalizer.
 * Expands numbers, dates (dd/mm/yyyy), times, phone numbers, percentages,
 * acronyms, OCR line-breaks with strict Unicode boundaries.
 */
export function cleanVietnameseTextOffline(
  text: string,
  dictionary: CustomDictionaryEntry[] = []
): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Remove scan/OCR noise characters (lines, bullets, strange symbols, pipe characters)
  cleaned = cleaned.replace(/[|~_❖●★▲▼■□◆◇►◄▶◀✓✔✕✖•·…]+/g, ' ');

  // 2. Fix broken hyphenated words at line breaks (e.g. "nghiên-\n cứu" -> "nghiên cứu")
  cleaned = cleaned.replace(/(\p{L}+)-\s*\n\s*(\p{L}+)/gu, '$1$2');

  // 3. Remove explicit page number lines (e.g. "Trang 45 / 150" or "--- 45 ---")
  cleaned = cleaned.replace(/^[ \t]*(?:Trang|Page)\s*\d+\s*(?:\/\s*\d+)?[ \t]*$/gim, '');
  cleaned = cleaned.replace(/^[ \t]*[-_=]{2,}\s*\d+\s*[-_=]{2,}[ \t]*$/gim, '');

  // 4. Normalize quotes and dashes
  cleaned = cleaned.replace(/[“”„«»]/g, '"');
  cleaned = cleaned.replace(/[‘’‚‹›]/g, "'");
  cleaned = cleaned.replace(/[–—―]/g, ' - ');

  // 5. Expand Dates (e.g., 02/09/1945 -> ngày 2 tháng 9 năm 1945)
  cleaned = cleaned.replace(
    /(^|[^\p{L}\p{N}])(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?![\p{L}\p{N}])/gu,
    (_, prefix, day, month, year) => `${prefix}ngày ${parseInt(day, 10)} tháng ${parseInt(month, 10)} năm ${year}`
  );

  // 6. Expand Times (e.g., 14:30 -> 14 giờ 30 phút, 8h30 -> 8 giờ 30)
  cleaned = cleaned.replace(
    /(^|[^\p{L}\p{N}])(\d{1,2}):(\d{2})(?![\p{L}\p{N}])/gu,
    (_, prefix, h, m) => `${prefix}${parseInt(h, 10)} giờ ${m} phút`
  );
  cleaned = cleaned.replace(
    /(^|[^\p{L}\p{N}])(\d{1,2})h(\d{1,2})(?![\p{L}\p{N}])/giu,
    (_, prefix, h, m) => `${prefix}${parseInt(h, 10)} giờ ${m} phút`
  );
  cleaned = cleaned.replace(
    /(^|[^\p{L}\p{N}])(\d{1,2})h(?![\p{L}\p{N}])/giu,
    (_, prefix, h) => `${prefix}${parseInt(h, 10)} giờ`
  );

  // 7. Common Vietnamese measurement units & titles (Longest first, Unicode word boundary)
  cleaned = cleaned
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*km\/h(?![\p{L}\p{N}])/giu, '$1$2 ki-lô-mét một giờ')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*km(?![\p{L}\p{N}])/giu, '$1$2 ki-lô-mét')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*cm(?![\p{L}\p{N}])/giu, '$1$2 xăng-ti-mét')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*kg(?![\p{L}\p{N}])/giu, '$1$2 ki-lô-gam')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*m\b(?![\p{L}\p{N}])/giu, '$1$2 mét')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*g\b(?![\p{L}\p{N}])/giu, '$1$2 gam')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*°C(?![\p{L}\p{N}])/giu, '$1$2 độ C')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*%(?![\p{L}\p{N}])/giu, '$1$2 phần trăm')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*k(?![\p{L}\p{N}])/giu, '$1$2 nghìn')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*tr(?![\p{L}\p{N}])/giu, '$1$2 triệu')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*tỷ(?![\p{L}\p{N}])/giu, '$1$2 tỷ')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*đ(?![\p{L}\p{N}])/giu, '$1$2 đồng')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*VND(?![\p{L}\p{N}])/giu, '$1$2 Việt Nam đồng')
    .replace(/(^|[^\p{L}\p{N}])(\d+)\s*\$(?![\p{L}\p{N}])/giu, '$1$2 đô la');

  // 8. Custom dictionary and teencode expansion
  // Sort longest words first so that "PGS.TS" or "ngta" gets replaced before "TS" or "ng"
  const sortedDict = [...dictionary].sort(
    (a, b) => (b.word?.length || 0) - (a.word?.length || 0)
  );

  for (const entry of sortedDict) {
    if (!entry.word || !entry.replaceWith) continue;
    const regex = createUnicodeWordRegex(entry.word, !!entry.caseSensitive);
    cleaned = cleaned.replace(regex, (_, prefix) => `${prefix}${entry.replaceWith}`);
  }

  // 9. Normalize whitespace and paragraph breaks
  cleaned = cleaned
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
    .replace(/\n\s*\n\s*\n+/g, '\n\n') // Max 2 line breaks
    .trim();

  // 10. Fix spacing before punctuation (e.g. "xin chào !" -> "xin chào!")
  cleaned = cleaned.replace(/\s+([.,!?:;])/g, '$1');

  return cleaned;
}

/**
 * Splits text into individual natural sentences for synchronized speech highlighting and TTS playback.
 * 100% compliant with older iOS Safari browsers (no regex lookbehinds).
 */
export function splitIntoSentences(text: string): SentenceItem[] {
  if (!text || !text.trim()) return [];

  // Split by paragraph double line breaks first to preserve structural line breaks
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const result: SentenceItem[] = [];
  let index = 0;

  for (const para of paragraphs) {
    // Within each paragraph, split by sentence punctuation without lookbehind
    const rawSentences: string[] = [];
    const sentenceRegex = /[^.!?…\n]+(?:[.!?…]+["'”»)]*)?/gu;
    let match: RegExpExecArray | null;
    while ((match = sentenceRegex.exec(para)) !== null) {
      const s = match[0].trim();
      if (s.length > 0) {
        rawSentences.push(s);
      }
    }
    if (rawSentences.length === 0) {
      rawSentences.push(para);
    }

    // Group short adjacent sentences WITHIN the same paragraph (~180 chars max)
    const groupedInPara: string[] = [];
    let currentGroup = '';

    for (const s of rawSentences) {
      if (!currentGroup) {
        currentGroup = s;
      } else if (currentGroup.length + s.length + 1 <= 180) {
        currentGroup += ' ' + s;
      } else {
        groupedInPara.push(currentGroup);
        currentGroup = s;
      }
    }
    if (currentGroup) {
      groupedInPara.push(currentGroup);
    }

    for (const itemText of groupedInPara) {
      // Only sub-split if an unbroken sentence is abnormally long (> 650 chars) without any punctuation
      if (itemText.length > 650) {
        const clauses = itemText.split(/[;:\n]\s+/).filter((c) => c.trim().length > 0);
        for (const c of clauses) {
          result.push({
            id: `sent_${index}`,
            index,
            text: c,
            cleanText: c,
          });
          index++;
        }
      } else {
        result.push({
          id: `sent_${index}`,
          index,
          text: itemText,
          cleanText: itemText,
        });
        index++;
      }
    }
  }

  return result;
}

/**
 * Builds structured chapters from full text.
 * Auto-detects chapter headers like "Chương 1", "Hồi II", "Phần 3", or auto-chunks every ~1000 words.
 */
export function buildChaptersFromText(text: string): Chapter[] {
  if (!text || !text.trim()) {
    return [
      {
        id: 'chap_1',
        title: 'Chương 1',
        content: '',
        sentences: [],
      },
    ];
  }

  // 1. Check for EPUB explicit chapter marker delimiter: "=== CHƯƠNG TIẾP THEO ===" or similar
  if (text.includes('=== CHƯƠNG TIẾP THEO ===')) {
    const rawParts = text.split(/\n*=== CHƯƠNG TIẾP THEO ===\n*/).filter((p) => p.trim().length > 0);
    if (rawParts.length > 1) {
      return rawParts.map((part, idx) => {
        // Try to extract first heading or first line as title
        const firstLine = part.trim().split('\n')[0].replace(/^#+\s*/, '').trim();
        const title = firstLine && firstLine.length <= 60 ? firstLine : `Chương ${idx + 1}`;
        return {
          id: `chap_${idx + 1}`,
          title,
          content: part.trim(),
          sentences: splitIntoSentences(part.trim()),
        };
      });
    }
  }

  // 2. Standard Chapter regex detection ("Chương 1", "Hồi 2", "Phần 3", "Mục 4", "Chapter 5", etc.)
  const chapterRegex = /(?:\n|^)(Chương\s+[\dIVXLCDM]+[^\n]*|Hồi\s+[\dIVXLCDM]+[^\n]*|Phần\s+[\dIVXLCDM]+[^\n]*|Mục\s+[\dIVXLCDM]+[^\n]*|Chapter\s+[\dIVXLCDM]+[^\n]*|Bài\s+[\dIVXLCDM]+[^\n]*)/gi;
  const matches = Array.from(text.matchAll(chapterRegex));

  if (matches.length >= 2) {
    const chapters: Chapter[] = [];
    for (let i = 0; i < matches.length; i++) {
      const startIndex = matches[i].index || 0;
      const endIndex = i < matches.length - 1 ? (matches[i + 1].index || text.length) : text.length;
      const rawTitle = (matches[i][0] as string).trim();
      const content = text.slice(startIndex, endIndex).trim();

      chapters.push({
        id: `chap_${i + 1}`,
        title: rawTitle.length > 60 ? rawTitle.slice(0, 60) + '...' : rawTitle,
        content,
        sentences: splitIntoSentences(content),
      });
    }
    return chapters;
  }

  // 3. Fallback: If text is long (> 1000 words), split into logical reading parts
  const words = text.split(/\s+/);
  if (words.length > 1000) {
    const chapters: Chapter[] = [];
    const paragraphs = text.split(/\n\s*\n+/);
    let currentChunk: string[] = [];
    let currentWords = 0;
    let chapNum = 1;

    for (const p of paragraphs) {
      const pWordCount = p.split(/\s+/).length;
      if (currentWords + pWordCount > 800 && currentChunk.length > 0) {
        const content = currentChunk.join('\n\n');
        chapters.push({
          id: `chap_${chapNum}`,
          title: `Phần ${chapNum}`,
          content,
          sentences: splitIntoSentences(content),
        });
        chapNum++;
        currentChunk = [p];
        currentWords = pWordCount;
      } else {
        currentChunk.push(p);
        currentWords += pWordCount;
      }
    }

    if (currentChunk.length > 0) {
      const content = currentChunk.join('\n\n');
      chapters.push({
        id: `chap_${chapNum}`,
        title: `Phần ${chapNum}`,
        content,
        sentences: splitIntoSentences(content),
      });
    }

    return chapters;
  }

  // Single chapter
  return [
    {
      id: 'chap_1',
      title: 'Toàn bộ nội dung',
      content: text,
      sentences: splitIntoSentences(text),
    },
  ];
}

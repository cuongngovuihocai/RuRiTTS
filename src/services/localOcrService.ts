import { createWorker } from 'tesseract.js';

let tesseractWorker: any = null;

/**
 * Perform local client-side OCR without any external API or cloud dependency.
 */
export async function performLocalOcr(
  imageBase64OrUrl: string,
  onProgress?: (progress: number) => void
): Promise<{ text: string; confidence: number }> {
  try {
    if (!tesseractWorker) {
      tesseractWorker = await createWorker('vie+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(Math.round(m.progress * 100));
          }
        },
      });
    }

    const ret = await tesseractWorker.recognize(imageBase64OrUrl);
    return {
      text: ret.data.text || '',
      confidence: ret.data.confidence || 0,
    };
  } catch (error) {
    console.error('Local Tesseract OCR Error:', error);
    throw error;
  }
}

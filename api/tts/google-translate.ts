import { applyCors, readJsonBody } from '../_lib/cors.js';
import {
  fetchGoogleTranslateAudio,
  synthesizeEdgeDirect,
  synthesizeGoogleTranslatePayload,
} from '../_lib/ttsCore.js';

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', success: false });
  }

  let body: any = {};
  try {
    body = await readJsonBody(req);
    const { text, voice = 'google_translate_vi', strict = false } = body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Nội dung đọc không được để trống.', success: false });
    }

    const resultObj = await synthesizeGoogleTranslatePayload({
      text,
      voice,
      strict: Boolean(strict),
    });
    return res.status(200).json(resultObj);
  } catch (error: any) {
    if (body?.strict) {
      return res.status(502).json({
        error: error?.message || 'Không thể kết nối giọng Google Dịch TTS trong chế độ khóa cứng giọng.',
        success: false,
      });
    }

    try {
      const cleanText = (body?.text || '').trim();
      if (cleanText) {
        let fb: Buffer;
        try {
          fb = await fetchGoogleTranslateAudio(cleanText);
        } catch {
          fb = await synthesizeEdgeDirect(cleanText, 'vi-VN-HoaiMyNeural', 1.0, 1.0, 1.0);
        }
        return res.status(200).json({
          audioBase64: fb.toString('base64'),
          mimeType: 'audio/mp3',
          sampleRate: 24000,
          voice: body?.voice || 'google_translate_vi',
          success: true,
        });
      }
    } catch {}

    return res.status(500).json({
      error: error?.message || 'Lỗi tạo giọng đọc Google Translate TTS.',
      success: false,
    });
  }
}

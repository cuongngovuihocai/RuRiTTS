import { applyCors, readJsonBody } from '../_lib/cors.js';
import { fetchGoogleTranslateAudio, synthesizeEdgeSpeechPayload } from '../_lib/ttsCore.js';

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', success: false });
  }

  let body: any = {};
  try {
    body = await readJsonBody(req);
    const {
      text,
      voice = 'vi-VN-HoaiMyNeural',
      rate = 1.0,
      pitch = 1.0,
      volume = 1.0,
    } = body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Nội dung đọc không được để trống.', success: false });
    }

    const resultObj = await synthesizeEdgeSpeechPayload({ text, voice, rate, pitch, volume });
    return res.status(200).json(resultObj);
  } catch (error: any) {
    try {
      const cleanText = (body?.text || '').trim();
      if (cleanText) {
        const fb = await fetchGoogleTranslateAudio(cleanText);
        return res.status(200).json({
          audioBase64: fb.toString('base64'),
          mimeType: 'audio/mp3',
          sampleRate: 24000,
          voice: body?.voice || 'vi-VN-HoaiMyNeural',
          isFallback: true,
          fallbackVoiceName: 'Google Dịch TTS (Dự phòng)',
          fallbackReason: 'Động cơ Edge TTS gặp sự cố, tự động dự phòng sang Google Dịch',
          success: true,
        });
      }
    } catch {}

    return res.status(500).json({
      error: error?.message || 'Lỗi tạo giọng đọc Microsoft Edge.',
      success: false,
    });
  }
}

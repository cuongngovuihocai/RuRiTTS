import { applyCors, readJsonBody } from './_lib/cors.js';
import { splitChaptersServer } from './_lib/ttsCore.js';

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', success: false });
  }

  try {
    const body = await readJsonBody(req);
    const { text } = body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Thiếu nội dung văn bản.', success: false });
    }

    const result = splitChaptersServer(text);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || 'Lỗi phân tách chương sách.',
      success: false,
    });
  }
}

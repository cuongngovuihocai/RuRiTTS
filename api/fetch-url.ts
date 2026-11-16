import { applyCors, readJsonBody } from './_lib/cors.js';
import { extractWebArticleServer } from './_lib/ttsCore.js';

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', success: false });
  }

  try {
    const body = await readJsonBody(req);
    const { url } = body || {};

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return res.status(400).json({
        error: 'Đường dẫn liên kết web không hợp lệ (phải bắt đầu bằng http:// hoặc https://).',
        success: false,
      });
    }

    const result = await extractWebArticleServer(url);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({
      error: error?.message || 'Không thể trích xuất nội dung từ liên kết web này.',
      success: false,
    });
  }
}

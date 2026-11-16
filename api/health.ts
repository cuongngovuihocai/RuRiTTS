import { applyCors } from './_lib/cors.js';

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;
  res.status(200).json({
    ok: true,
    service: 'ruri-tts-vercel-backend',
    timestamp: Date.now(),
  });
}

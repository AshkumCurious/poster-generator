import { getLayout, upsertLayout } from '../../../../lib/db';
import { isSessionValid } from '../../../../lib/auth';

export default async function handler(req, res) {
  if (!isSessionValid(req.headers.cookie)) return res.status(401).json({ error: 'Not logged in.' });
  const { eventId } = req.query;

  if (req.method === 'GET') {
    const layout = await getLayout(eventId);
    return res.status(200).json({ layout });
  }

  if (req.method === 'POST') {
    const { layout } = req.body || {};
    if (!layout) return res.status(400).json({ error: 'layout is required.' });
    await upsertLayout(eventId, layout);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

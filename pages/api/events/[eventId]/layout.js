import db from '../../../../lib/db';
import { isSessionValid } from '../../../../lib/auth';

export default function handler(req, res) {
  if (!isSessionValid(req.headers.cookie)) return res.status(401).json({ error: 'Not logged in.' });
  const { eventId } = req.query;

  if (req.method === 'GET') {
    const row = db.prepare('SELECT layout_json FROM poster_state WHERE event_id = ?').get(eventId);
    return res.status(200).json({ layout: row ? JSON.parse(row.layout_json) : null });
  }

  if (req.method === 'POST') {
    const { layout } = req.body || {};
    if (!layout) return res.status(400).json({ error: 'layout is required.' });

    db.prepare(
      `INSERT INTO poster_state (event_id, layout_json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(event_id) DO UPDATE SET layout_json = excluded.layout_json, updated_at = datetime('now')`
    ).run(eventId, JSON.stringify(layout));

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

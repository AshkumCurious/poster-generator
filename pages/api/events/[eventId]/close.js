import db from '../../../../lib/db';
import { isSessionValid } from '../../../../lib/auth';

export default async function handler(req, res) {
  if (!isSessionValid(req.headers.cookie)) return res.status(401).json({ error: 'Not logged in.' });
  if (req.method !== 'POST') return res.status(405).end();

  const { eventId } = req.query;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  db.prepare("UPDATE events SET status = 'closed' WHERE id = ?").run(eventId);
  res.status(200).json({ ok: true });
}

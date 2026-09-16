import db from '../../../../../lib/db';
import { isSessionValid } from '../../../../../lib/auth';
import { getFileStream } from '../../../../../lib/drive';
import { requireEventOwner } from '../../../../../lib/google';

export default async function handler(req, res) {
  if (!isSessionValid(req.headers.cookie)) return res.status(401).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { eventId, fileId } = req.query;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  try {
    const stream = await getFileStream(fileId, requireEventOwner(event));
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Could not fetch image: ${err.message}` });
  }
}

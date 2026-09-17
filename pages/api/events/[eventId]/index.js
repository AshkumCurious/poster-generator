import { deleteEvent, getEvent, listContributors } from '../../../../lib/db';
import { getSession } from '../../../../lib/auth';
import { trashEventFolder } from '../../../../lib/drive';

export default async function handler(req, res) {
  const session = getSession(req.headers.cookie);
  if (!session) return res.status(401).json({ error: 'Not logged in.' });

  const { eventId } = req.query;
  const event = await getEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  if (req.method === 'GET') {
    const contributors = await listContributors(eventId);
    return res.status(200).json({ event, contributors });
  }

  if (req.method === 'DELETE') {
    if (event.owner_email && event.owner_email !== session.email) {
      return res.status(403).json({ error: 'You can only delete farewells you created.' });
    }

    try {
      await trashEventFolder(event.folder_id, event.owner_email || session.email);
    } catch (err) {
      console.error('Drive trash failed:', err);
    }

    await deleteEvent(eventId);

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

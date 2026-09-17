import { nanoid } from 'nanoid';
import { createEvent, insertContributors, listEvents } from '../../../lib/db';
import { getSession } from '../../../lib/auth';
import { createEventFolder } from '../../../lib/drive';

export default async function handler(req, res) {
  const session = getSession(req.headers.cookie);
  if (!session) return res.status(401).json({ error: 'Not logged in.' });

  if (req.method === 'GET') {
    const events = await listEvents();
    return res.status(200).json({ events });
  }

  if (req.method === 'POST') {
    const { personName, title, message, contributorEmails } = req.body || {};

    if (!personName || !title || !message || !Array.isArray(contributorEmails) || contributorEmails.length === 0) {
      return res.status(400).json({ error: 'personName, title, message and at least one contributor email are required.' });
    }

    const folderName = `${personName} - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

    let folderId;
    try {
      folderId = await createEventFolder(folderName, session.email);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: `Drive setup failed: ${err.message}` });
    }

    const eventId = nanoid(10);
    await createEvent({
      id: eventId,
      personName,
      title,
      message,
      folderId,
      ownerEmail: session.email,
    });
    await insertContributors(eventId, contributorEmails);

    return res.status(201).json({ eventId });
  }

  return res.status(405).end();
}

import { getEvent, listContributors, markContributorsInvited } from '../../../../lib/db';
import { isSessionValid } from '../../../../lib/auth';
import { sendUploadInvites } from '../../../../lib/mailer';
import { requireEventOwner, getBaseUrl } from '../../../../lib/google';

export default async function handler(req, res) {
  if (!isSessionValid(req.headers.cookie)) return res.status(401).json({ error: 'Not logged in.' });
  if (req.method !== 'POST') return res.status(405).end();

  const { eventId } = req.query;
  const event = await getEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (event.status !== 'open') return res.status(400).json({ error: 'This event is closed for submissions.' });

  let ownerEmail;
  try {
    ownerEmail = requireEventOwner(event);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const contributors = await listContributors(eventId);

  const uploadUrl = `${getBaseUrl()}/upload/${eventId}`;

  let results;
  try {
    results = await sendUploadInvites({
      toEmails: contributors.map((c) => c.email),
      personName: event.person_name,
      message: event.message,
      uploadUrl,
      ownerEmail,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: `Email sending failed: ${err.message}` });
  }

  await markContributorsInvited(
    eventId,
    results.filter((r) => !r.error).map((r) => r.email)
  );

  const failed = results.filter((r) => r.error);
  if (failed.length) {
    console.error('Invite send failures', failed);
  }
  res.status(200).json({ sent: results.length - failed.length, failed, from: ownerEmail });
}

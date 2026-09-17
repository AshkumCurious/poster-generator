import {
  getEvent,
  insertContributors,
  listContributors,
  markContributorsInvited,
} from '../../../../lib/db';
import { isSessionValid } from '../../../../lib/auth';
import { sendUploadInvites } from '../../../../lib/mailer';
import { requireEventOwner } from '../../../../lib/google';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[\n,]/);
  const seen = new Set();
  const emails = [];
  const invalid = [];

  for (const item of raw) {
    const email = String(item || '').trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      invalid.push(String(item).trim());
      continue;
    }
    if (!seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }

  return { emails, invalid };
}

export default async function handler(req, res) {
  if (!isSessionValid(req.headers.cookie)) return res.status(401).json({ error: 'Not logged in.' });
  if (req.method !== 'POST') return res.status(405).end();

  const { eventId } = req.query;
  const event = await getEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (event.status !== 'open') {
    return res.status(400).json({ error: 'This event is closed for submissions.' });
  }

  let ownerEmail;
  try {
    ownerEmail = requireEventOwner(event);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { emails, invalid } = parseEmails(req.body?.emails ?? req.body?.contributorEmails);
  if (invalid.length) {
    return res.status(400).json({ error: `Invalid email: ${invalid[0]}` });
  }
  if (emails.length === 0) {
    return res.status(400).json({ error: 'Add at least one email.' });
  }

  const existing = new Set((await listContributors(eventId)).map((row) => row.email));
  const added = emails.filter((email) => !existing.has(email));
  const skipped = emails.filter((email) => existing.has(email));

  if (added.length) {
    await insertContributors(eventId, added);
  }

  let sent = 0;
  let failed = [];
  if (added.length) {
    const uploadUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/upload/${eventId}`;
    try {
      const results = await sendUploadInvites({
        toEmails: added,
        personName: event.person_name,
        message: event.message,
        uploadUrl,
        ownerEmail,
      });
      await markContributorsInvited(
        eventId,
        results.filter((row) => !row.error).map((row) => row.email)
      );
      failed = results.filter((row) => row.error);
      sent = results.length - failed.length;
    } catch (err) {
      console.error(err);
      const contributors = await listContributors(eventId);
      return res.status(500).json({
        error: `People were added, but email sending failed: ${err.message}`,
        added: added.length,
        skipped: skipped.length,
        sent: 0,
        failed: [],
        contributors,
      });
    }
  }

  const contributors = await listContributors(eventId);

  res.status(200).json({
    added: added.length,
    skipped: skipped.length,
    sent,
    failed,
    from: ownerEmail,
    contributors,
  });
}

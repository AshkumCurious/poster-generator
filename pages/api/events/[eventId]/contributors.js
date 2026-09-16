import { nanoid } from 'nanoid';
import db from '../../../../lib/db';
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
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
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

  const existing = new Set(
    db
      .prepare('SELECT email FROM contributors WHERE event_id = ?')
      .all(eventId)
      .map((row) => row.email)
  );
  const added = emails.filter((email) => !existing.has(email));
  const skipped = emails.filter((email) => existing.has(email));

  if (added.length) {
    const insertContributor = db.prepare(
      'INSERT OR IGNORE INTO contributors (id, event_id, email) VALUES (?, ?, ?)'
    );
    const insertMany = db.transaction((rows) => {
      for (const email of rows) insertContributor.run(nanoid(10), eventId, email);
    });
    insertMany(added);
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
      const now = new Date().toISOString();
      const markInvited = db.prepare(
        'UPDATE contributors SET invited_at = ? WHERE event_id = ? AND email = ?'
      );
      const markMany = db.transaction((rows) => {
        for (const row of rows) if (!row.error) markInvited.run(now, eventId, row.email);
      });
      markMany(results);
      failed = results.filter((row) => row.error);
      sent = results.length - failed.length;
    } catch (err) {
      console.error(err);
      const contributors = db
        .prepare('SELECT email, invited_at, uploaded_at FROM contributors WHERE event_id = ? ORDER BY email')
        .all(eventId);
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

  const contributors = db
    .prepare('SELECT email, invited_at, uploaded_at FROM contributors WHERE event_id = ? ORDER BY email')
    .all(eventId);

  res.status(200).json({
    added: added.length,
    skipped: skipped.length,
    sent,
    failed,
    from: ownerEmail,
    contributors,
  });
}

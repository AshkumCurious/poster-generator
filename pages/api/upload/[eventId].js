import formidable from 'formidable';
import fs from 'fs';
import { getEvent, markContributorUploaded } from '../../../lib/db';
import { uploadFileToFolder } from '../../../lib/drive';
import { requireEventOwner } from '../../../lib/google';

// This route needs the raw multipart body, so Next's default JSON parser
// must be turned off.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { eventId } = req.query;
  const event = await getEvent(eventId);
  if (!event) return res.status(404).json({ error: 'This link is no longer valid.' });
  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Submissions for this farewell have been closed.' });
  }

  const form = formidable({ maxFileSize: 15 * 1024 * 1024, multiples: false });

  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err) {
    return res.status(400).json({ error: 'Could not read the upload — is the file under 15MB?' });
  }

  const file = files.image?.[0];
  if (!file) return res.status(400).json({ error: 'No image was attached.' });
  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'Only image files can be uploaded.' });
  }

  const contributorName = (fields.name?.[0] || 'anonymous').trim().replace(/[^\w\- ]/g, '');
  const buffer = fs.readFileSync(file.filepath);
  const ext = file.originalFilename?.split('.').pop() || 'jpg';
  const driveFilename = `${contributorName || 'note'}-${Date.now()}.${ext}`;

  try {
    await uploadFileToFolder(event.folder_id, driveFilename, file.mimetype, buffer, requireEventOwner(event));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: `Upload to Drive failed: ${err.message}` });
  } finally {
    fs.unlink(file.filepath, () => {});
  }

  const email = (fields.email?.[0] || '').trim().toLowerCase();
  if (email) {
    await markContributorUploaded(eventId, email);
  }

  res.status(200).json({ ok: true });
}

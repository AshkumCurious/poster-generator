import formidable from 'formidable';
import fs from 'fs';
import { getEvent } from '../../../../lib/db';
import { isSessionValid } from '../../../../lib/auth';
import { listFolderImages, uploadFileToFolder } from '../../../../lib/drive';
import { requireEventOwner } from '../../../../lib/google';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (!isSessionValid(req.headers.cookie)) return res.status(401).json({ error: 'Not logged in.' });

  const { eventId } = req.query;
  const event = await getEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  let ownerEmail;
  try {
    ownerEmail = requireEventOwner(event);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (req.method === 'GET') {
    try {
      const files = await listFolderImages(event.folder_id, ownerEmail);
      const images = files.map((f) => ({
        id: f.id,
        name: f.name,
        url: `/api/events/${eventId}/image/${f.id}`,
      }));
      return res.status(200).json({ images });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: `Could not list Drive images: ${err.message}` });
    }
  }

  if (req.method === 'POST') {
    const form = formidable({ maxFileSize: 15 * 1024 * 1024, multiples: true });
    let files;
    try {
      [, files] = await form.parse(req);
    } catch {
      return res.status(400).json({ error: 'Could not read the upload — is each file under 15MB?' });
    }

    const uploads = []
      .concat(files.images || [], files.image || [])
      .filter(Boolean);

    if (uploads.length === 0) {
      return res.status(400).json({ error: 'No images were attached.' });
    }

    const saved = [];
    try {
      for (const file of uploads) {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
          return res.status(400).json({ error: 'Only image files can be uploaded.' });
        }
        const buffer = fs.readFileSync(file.filepath);
        const ext = file.originalFilename?.split('.').pop() || 'jpg';
        const safeName = String(file.originalFilename || 'photo')
          .replace(/[^\w.\- ]/g, '')
          .slice(0, 60);
        const driveFilename = `hr-${Date.now()}-${safeName || `photo.${ext}`}`;
        await uploadFileToFolder(event.folder_id, driveFilename, file.mimetype, buffer, ownerEmail);
        saved.push(driveFilename);
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: `Upload to Drive failed: ${err.message}` });
    } finally {
      for (const file of uploads) fs.unlink(file.filepath, () => {});
    }

    return res.status(200).json({ uploaded: saved.length });
  }

  return res.status(405).end();
}

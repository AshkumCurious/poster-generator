import { Readable } from 'node:stream';
import { ensureDriveRoot, getDriveForEmail, requireEventOwner } from './google';

export async function createEventFolder(folderName, ownerEmail) {
  const drive = await getDriveForEmail(ownerEmail);
  const rootId = await ensureDriveRoot(ownerEmail);

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootId],
    },
    fields: 'id',
  });
  return res.data.id;
}

export async function uploadFileToFolder(folderId, filename, mimeType, buffer, ownerEmail) {
  const drive = await getDriveForEmail(ownerEmail);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, name',
  });
  return res.data;
}

export async function listFolderImages(folderId, ownerEmail) {
  const drive = await getDriveForEmail(ownerEmail);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/')`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime',
  });
  return res.data.files || [];
}

export async function getFileStream(fileId, ownerEmail) {
  const drive = await getDriveForEmail(ownerEmail);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return res.data;
}

export async function trashEventFolder(folderId, ownerEmail) {
  if (!folderId || !ownerEmail) return;
  const drive = await getDriveForEmail(ownerEmail);
  await drive.files.update({
    fileId: folderId,
    requestBody: { trashed: true },
  });
}

export { requireEventOwner };

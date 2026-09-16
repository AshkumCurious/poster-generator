import { google } from 'googleapis';
import db from './db';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
];

export function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_BASE_URL is not set.');
  return `${base.replace(/\/$/, '')}/api/auth/google/callback`;
}

export function createOAuthClient() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set.');
  }
  return new google.auth.OAuth2(id, secret, getRedirectUri());
}

export function isEmailAllowed(email) {
  const list = (process.env.ALLOWED_GOOGLE_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(String(email).toLowerCase());
}

export function upsertGoogleAccount({ email, tokens, driveRootFolderId }) {
  const existing = db.prepare('SELECT refresh_token, drive_root_folder_id FROM google_accounts WHERE email = ?').get(email);
  const refreshToken = tokens.refresh_token || existing?.refresh_token;
  if (!refreshToken) {
    throw new Error('Google did not return a refresh token. Remove this app from your Google Account permissions and sign in again.');
  }

  db.prepare(
    `INSERT INTO google_accounts (email, refresh_token, access_token, expiry_date, drive_root_folder_id, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET
       refresh_token = excluded.refresh_token,
       access_token = excluded.access_token,
       expiry_date = excluded.expiry_date,
       drive_root_folder_id = COALESCE(excluded.drive_root_folder_id, google_accounts.drive_root_folder_id),
       updated_at = datetime('now')`
  ).run(
    email,
    refreshToken,
    tokens.access_token || null,
    tokens.expiry_date || null,
    driveRootFolderId || existing?.drive_root_folder_id || null
  );
}

export async function getAuthForEmail(email) {
  const row = db.prepare('SELECT * FROM google_accounts WHERE email = ?').get(email);
  if (!row?.refresh_token) {
    throw new Error('Google is not connected. Sign in with Google from the HR login page.');
  }

  const auth = createOAuthClient();
  auth.setCredentials({
    refresh_token: row.refresh_token,
    access_token: row.access_token || undefined,
    expiry_date: row.expiry_date || undefined,
  });

  auth.on('tokens', (tokens) => {
    const nextRefresh = tokens.refresh_token || row.refresh_token;
    db.prepare(
      `UPDATE google_accounts
       SET refresh_token = ?, access_token = COALESCE(?, access_token), expiry_date = COALESCE(?, expiry_date), updated_at = datetime('now')
       WHERE email = ?`
    ).run(nextRefresh, tokens.access_token || null, tokens.expiry_date || null, email);
  });

  return auth;
}

export async function getDriveForEmail(email) {
  const auth = await getAuthForEmail(email);
  return google.drive({ version: 'v3', auth });
}

export async function getGmailForEmail(email) {
  const auth = await getAuthForEmail(email);
  return google.gmail({ version: 'v1', auth });
}

export function requireEventOwner(event) {
  if (!event?.owner_email) {
    throw new Error('This farewell was created before Google sign-in. Create a new event after signing in with Google.');
  }
  return event.owner_email;
}

export async function ensureDriveRoot(email) {
  const row = db.prepare('SELECT drive_root_folder_id FROM google_accounts WHERE email = ?').get(email);
  const drive = await getDriveForEmail(email);

  if (row?.drive_root_folder_id) {
    try {
      const existing = await drive.files.get({
        fileId: row.drive_root_folder_id,
        fields: 'id, trashed',
      });
      if (existing.data.id && !existing.data.trashed) return existing.data.id;
    } catch {
      // Folder was deleted; create a new one below.
    }
  }

  const created = await drive.files.create({
    requestBody: {
      name: 'Farewell Posters',
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  const folderId = created.data.id;
  db.prepare('UPDATE google_accounts SET drive_root_folder_id = ?, updated_at = datetime(\'now\') WHERE email = ?').run(folderId, email);
  return folderId;
}

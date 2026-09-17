import { google } from 'googleapis';
import {
  getGoogleAccount,
  upsertGoogleAccountRow,
  updateGoogleAccountTokens,
  updateDriveRoot,
} from './db';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
];

export function getBaseUrl() {
  const base = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (!base) throw new Error('BASE_URL is not set.');
  return base.replace(/\/$/, '');
}

export function getRedirectUri() {
  return `${getBaseUrl()}/api/auth/google/callback`;
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

export async function upsertGoogleAccount({ email, tokens, driveRootFolderId }) {
  const existing = await getGoogleAccount(email);
  const refreshToken = tokens.refresh_token || existing?.refresh_token;
  if (!refreshToken) {
    throw new Error('Google did not return a refresh token. Remove this app from your Google Account permissions and sign in again.');
  }

  await upsertGoogleAccountRow({
    email,
    refreshToken,
    accessToken: tokens.access_token || null,
    expiryDate: tokens.expiry_date || null,
    driveRootFolderId: driveRootFolderId || existing?.drive_root_folder_id || null,
  });
}

export async function getAuthForEmail(email) {
  const row = await getGoogleAccount(email);
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
    updateGoogleAccountTokens(email, {
      refreshToken: tokens.refresh_token || row.refresh_token,
      accessToken: tokens.access_token || null,
      expiryDate: tokens.expiry_date || null,
    }).catch((err) => console.error('Failed to store Google tokens', err));
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
  const row = await getGoogleAccount(email);
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
  await updateDriveRoot(email, folderId);
  return folderId;
}

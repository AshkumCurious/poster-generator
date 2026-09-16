import { google } from 'googleapis';
import {
  createOAuthClient,
  ensureDriveRoot,
  isEmailAllowed,
  upsertGoogleAccount,
} from '../../../../lib/google';
import {
  clearOAuthStateCookie,
  createSessionCookie,
  readOAuthState,
} from '../../../../lib/auth';

function loginError(res, code) {
  res.setHeader('Set-Cookie', clearOAuthStateCookie());
  res.redirect(302, `/login?error=${encodeURIComponent(code)}`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state, error } = req.query;
  if (error) return loginError(res, String(error));
  if (!code) return loginError(res, 'missing_code');

  const expectedState = readOAuthState(req.headers.cookie);
  if (!expectedState || expectedState !== state) {
    return loginError(res, 'invalid_state');
  }

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();
    const email = profile.email;
    if (!email) return loginError(res, 'no_email');
    if (!isEmailAllowed(email)) return loginError(res, 'not_allowed');

    upsertGoogleAccount({ email, tokens });
    await ensureDriveRoot(email);

    res.setHeader('Set-Cookie', [
      createSessionCookie(email),
      clearOAuthStateCookie(),
    ]);
    res.redirect(302, '/dashboard');
  } catch (err) {
    console.error(err);
    loginError(res, 'oauth_failed');
  }
}

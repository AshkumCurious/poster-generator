import { createOAuthClient, GOOGLE_SCOPES } from '../../../../lib/google';
import { createOAuthStateCookie } from '../../../../lib/auth';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { state, cookie } = createOAuthStateCookie();
    const client = createOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state,
      include_granted_scopes: true,
    });
    res.setHeader('Set-Cookie', cookie);
    res.redirect(302, url);
  } catch (err) {
    console.error(err);
    res.redirect(302, `/login?error=${encodeURIComponent('oauth_not_configured')}`);
  }
}

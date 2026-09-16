import { useRouter } from 'next/router';

const ERRORS = {
  not_allowed: 'That Google account is not allowed to use this dashboard.',
  oauth_not_configured: 'Google login is not set up yet. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env.local.',
  no_refresh_token: 'Google did not grant offline access. Remove this app from your Google Account permissions, then try again.',
  invalid_state: 'Sign-in expired. Please try again.',
  missing_code: 'Google did not return a login code. Please try again.',
  no_email: 'Google did not share an email address.',
  oauth_failed: 'Google sign-in failed. Please try again.',
  access_denied: 'Google sign-in was cancelled.',
};

export default function Login() {
  const router = useRouter();
  const errorCode = typeof router.query.error === 'string' ? router.query.error : '';
  const error = ERRORS[errorCode] || (errorCode ? 'Could not sign in with Google.' : '');

  return (
    <div className="auth-screen">
      <h1>
        <span style={{ color: 'var(--gold)' }}>Farewell</span> Notes
      </h1>
      <p className="hint-text" style={{ marginBottom: 20, textAlign: 'center', maxWidth: 360 }}>
        Collect notes, arrange a poster, and export a print-ready card.
      </p>
      <div className="card auth-card">
        {error && <p className="error-text">{error}</p>}
        <a className="btn google-btn" href="/api/auth/google">
          Continue with Google
        </a>
        <p className="hint-text" style={{ marginTop: 14, textAlign: 'center' }}>
          Photos and invite emails use the account you sign in with.
        </p>
      </div>
    </div>
  );
}

import crypto from 'crypto';

const COOKIE_NAME = 'farewell_session';
const OAUTH_STATE_COOKIE = 'farewell_oauth_state';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function sign(value) {
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-me';
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function cookieExtras() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

function readCookie(cookieHeader, name) {
  const match = String(cookieHeader || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return '';
  return match.slice(name.length + 1);
}

export function createSessionCookie(email) {
  const payload = JSON.stringify({
    email,
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  });
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = sign(encoded);
  const value = `${encoded}.${sig}`;
  return `${COOKIE_NAME}=${value}; HttpOnly; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${cookieExtras()}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieExtras()}`;
}

export function createOAuthStateCookie() {
  const state = crypto.randomBytes(24).toString('hex');
  const cookie = `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${cookieExtras()}`;
  return { state, cookie };
}

export function clearOAuthStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieExtras()}`;
}

export function readOAuthState(cookieHeader = '') {
  return readCookie(cookieHeader, OAUTH_STATE_COOKIE);
}

export function getSession(cookieHeader = '') {
  const value = readCookie(cookieHeader, COOKIE_NAME);
  if (!value) return null;

  const [encoded, sig] = value.split('.');
  if (!encoded || !sig) return null;
  if (sign(encoded) !== sig) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.email || payload.exp <= Date.now()) return null;
    return { email: payload.email, exp: payload.exp };
  } catch {
    return null;
  }
}

export function isSessionValid(cookieHeader = '') {
  return Boolean(getSession(cookieHeader));
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

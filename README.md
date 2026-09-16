# Farewell Notes

A small internal tool for HR to collect farewell notes and turn them into a printable poster.

**Flow:** HR signs in with Google → app creates a Drive folder in that account and emails
contributors an upload link → contributors drop in a photo of their note → HR arranges the
photos anywhere on a blank poster → exports a print-ready PDF.

## Stack

- **Next.js** (pages router) — single app, frontend + API routes
- **SQLite** via `better-sqlite3` — event/contributor metadata only (not images)
- **Google Drive API** (signed-in HR account) — image storage, one folder per event
- **Gmail API** (same signed-in account) — invite emails
- **html2canvas + jsPDF** — client-side PDF export of the poster

No image ever touches your own storage — everything lives in the signed-in Google account's
Drive. You can delete those folders any time from Drive.

## One-time setup

### 1. Google Cloud OAuth

1. Open your project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable **Google Drive API** and **Gmail API**.
3. **APIs & Services → OAuth consent screen**. User type **External** is fine for a personal
   Gmail. Add your email as a **test user** while the app is in Testing.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   Application type: **Web application**.
5. Add Authorized JavaScript origin: `http://localhost:3000`
6. Add Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
   (use your real host instead of localhost when you deploy).
7. Put the client ID and secret in `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
8. Set `ALLOWED_GOOGLE_EMAILS` to the HR Gmail(s) that may open the dashboard
   (comma-separated). Leave empty only if you want any Google account to get in.

On first sign-in the app creates a **Farewell Posters** folder in that account's My Drive.
Event folders go inside it. Invites are sent from the same address.

### 2. App secrets

- `SESSION_SECRET` — any long random string (`openssl rand -hex 32`).
- `NEXT_PUBLIC_BASE_URL` — where the app is hosted, no trailing slash. Must match the
  redirect URI origin.

Copy `.env.example` to `.env.local` and fill in all of the above. Restart `npm run dev`
after changing env vars.

## Running locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and click **Continue with Google**.

## Data model

See **[DATA.md](./DATA.md)** for how SQLite tables relate to Google Drive, what is written
on each action, and how this would map to Supabase later.

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for host options, Google OAuth production URIs, env vars,
and step-by-step Railway / Render / VPS / Docker notes.

Short version: you need a **persistent disk** (Railway, Render, Fly.io, or a VM). This will
not run as-is on Vercel or Netlify.

## Project structure

```
lib/            Drive, Gmail, Google OAuth, auth, DB helpers
pages/api       Backend routes (auth, events, invites, uploads, image proxy)
pages/dashboard HR-only pages (list events, event detail)
pages/poster    HR-only poster builder (free placement, PDF export)
pages/upload    Public page contributors use to submit their note photo
```

## Security notes

- Upload links are unguessable event IDs, not password-protected — fine for internal teams,
  not for anything public-facing.
- Contributors never talk to Drive directly. Photos are uploaded through the app using the
  HR account's stored Google token, then proxied back for the poster builder.
- HR can close an event any time, which stops new uploads. Delete the folder in Drive
  whenever you want it gone.
- If you revoke the app in your Google Account, sign in again so a new refresh token is stored.

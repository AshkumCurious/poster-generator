# Farewell Notes

A small internal tool for HR to collect farewell notes and turn them into a printable poster.

## How to use

1. **Sign in** with Google. Photos and invite emails use that account (Drive + Gmail).
2. **Create a farewell.** Enter who is leaving, an internal title, the invite message, and teammate emails.
3. **Send invites.** Each person gets an email with the upload link. If you forgot someone, add their email on the farewell page and they are invited too. You can also copy the upload link.
4. **Teammates upload.** They open the link, add their name, email, and a photo of their note. Submissions stay open until you close them.
5. **Collect extras.** On the poster builder you can add more photos yourself. Close submissions when you do not want new uploads.
6. **Build the poster.** Drag photos onto the page, add coloured shapes if you need blocks or frames, then move, resize, and rotate items. Pick a page size (A4, A3, …) if needed.
7. **Save and export.** Save the layout, then export a print-ready PDF.

## Stack

- **Next.js** (pages router) — single app, frontend + API routes
- **Supabase Postgres** — event/contributor metadata and Google refresh tokens (not images)
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
- `BASE_URL` — where the app is hosted, no trailing slash. Must match the
  redirect URI origin. Server-only.
- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (server only).

In Supabase, run `supabase/schema.sql` once (SQL Editor).

Copy `.env.example` to `.env.local` and fill in all of the above. Restart `npm run dev`
after changing env vars.

## Running locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and click **Continue with Google**.

## Data model

See **[DATA.md](./DATA.md)** for how Supabase tables relate to Google Drive and what is written
on each action.

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for Vercel, Google OAuth production URIs, and env vars.

Short version: host the Next.js app on **Vercel**. Photos stay in Drive; metadata and Google
tokens stay in Supabase. GitHub Pages will not work (this app needs API routes).

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

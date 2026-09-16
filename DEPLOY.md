# Deploying Farewell Notes

This app is a **long-running Node server** with a **SQLite file** on disk. Photos live in Google Drive; the database only stores events, contributors, poster layouts, and the HR Google refresh token.

Pick a host with a **persistent disk**. Do not use Vercel, Netlify, or Cloudflare Pages as-is — their filesystems reset, so logins and farewells would vanish.

---

## What you must have before deploy

| Item | Why |
| --- | --- |
| A public HTTPS URL | Google OAuth and invite/upload links |
| Persistent disk | `data/farewell.db` (and WAL files) |
| Node 18+ with build tools | `better-sqlite3` compiles a native addon |
| Google OAuth client | Same project you already use locally |

Keep the OAuth app in **Testing**. Adding each HR Gmail as a **test user** is enough. Publishing the app would trigger Google verification for Drive + Gmail, which you do not need.

---

## Option comparison

| Option | Fits this app? | Effort | Cost (ballpark) | Notes |
| --- | --- | --- | --- | --- |
| **Railway** | Yes | Low | ~$5/mo + volume | Easiest. GitHub → deploy. Attach a volume. |
| **Render** (Web Service + disk) | Yes | Low | Paid disk required | Similar to Railway. Free web services have no persistent disk. |
| **Fly.io** | Yes | Medium | Few dollars/mo | Volumes are first-class. Needs a Dockerfile. |
| **Small VPS** (Hetzner, DigitalOcean, Lightsail) | Yes | Medium–high | ~$4–6/mo | Full control. You install Node, nginx, HTTPS. |
| **Company VM / existing server** | Yes | Depends | Already paid | Fine if it can run Node 24/7 and keep `data/`. |
| **Vercel / Netlify / Cloudflare Pages** | **No** | — | — | Serverless + ephemeral disk. SQLite and stored Google tokens would not survive. |

**Recommendation:** Railway if you want this live this afternoon. A cheap VPS if you already SSH into machines and want the lowest long-term cost.

To use Vercel later you would replace SQLite with hosted Postgres. That is a code change, not a config change.

---

## 1. Google Cloud (every option)

Do this once, then keep localhost **and** production on the same OAuth client.

1. [Google Cloud Console](https://console.cloud.google.com) → your project.
2. Confirm **Google Drive API** and **Gmail API** are enabled.
3. **APIs & Services → Credentials →** your **Web application** OAuth client.
4. **Authorized JavaScript origins** — add:
   - `http://localhost:3000`
   - `https://your-app.example.com` (no trailing slash)
5. **Authorized redirect URIs** — add:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://your-app.example.com/api/auth/google/callback`
6. **OAuth consent screen** → stay in **Testing** → **Test users** → add every HR Gmail in `ALLOWED_GOOGLE_EMAILS`.

Google often takes a minute to accept a new redirect URI. If sign-in fails with `redirect_uri_mismatch`, wait and retry.

---

## 2. Environment variables (every option)

Set these on the host (not in git). Generate a new session secret; do not reuse the local one.

```bash
openssl rand -hex 32
```

| Variable | Production value |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Same as local |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Same as local |
| `ALLOWED_GOOGLE_EMAILS` | Comma-separated HR emails |
| `SESSION_SECRET` | Output of `openssl rand -hex 32` |
| `NEXT_PUBLIC_BASE_URL` | `https://your-app.example.com` (no trailing slash) |

`NEXT_PUBLIC_BASE_URL` is used for the Google redirect and for upload links in invite emails. It must match the origin you added in Google Cloud.

`NODE_ENV=production` is set automatically by `next start`. Session cookies then get the `Secure` flag, so **HTTPS is required**.

---

## 3. Deploy on Railway (recommended)

1. Push this repo to GitHub (private is fine).
2. [railway.app](https://railway.app) → **New project → Deploy from GitHub repo**.
3. Open the service → **Variables** and add the five env vars above.  
   `NEXT_PUBLIC_BASE_URL` will be `https://<your-service>.up.railway.app` until you add a custom domain.
4. **Settings → Networking → Generate domain** (or attach your own).
5. Update `NEXT_PUBLIC_BASE_URL` to that `https://…` URL, then **redeploy** so Next bakes the public URL into the client.
6. **Volumes** → add a volume, mount path:

   ```
   /app/data
   ```

   The app writes `data/farewell.db` under the process working directory (`/app` on Railway’s Nixpacks image). The volume must cover that folder or every deploy wipes farewells and Google tokens.
7. Add the Railway origin + `/api/auth/google/callback` in Google Cloud (section 1).
8. Open the URL → **Continue with Google**. HR must sign in once on production so a **refresh token** is stored in that SQLite file. Local tokens do not copy over unless you migrate the db (section 6).

Start command if Railway does not detect Next:

```bash
npm run start
```

Build command:

```bash
npm install && npm run build
```

---

## 4. Deploy on Render

1. [render.com](https://render.com) → **New → Web Service** from GitHub.
2. Runtime: **Node**. Build: `npm install && npm run build`. Start: `npm run start`.
3. Instance: any **paid** plan that allows a **persistent disk**.
4. Add a disk, mount path `/opt/render/project/src/data` (Render’s app root is the repo). Confirm with Render’s docs if the root path differs, then mount so `data/farewell.db` lands on the disk.
5. Set the same env vars. Use the `onrender.com` URL (or custom domain) as `NEXT_PUBLIC_BASE_URL`.
6. Add that URL to Google OAuth origins + redirect.
7. Redeploy after changing `NEXT_PUBLIC_BASE_URL`.

---

## 5. Deploy on a VPS (Hetzner / DigitalOcean / company VM)

Needs: Ubuntu (or similar), a domain pointed at the VM, ports 80 and 443 open.

```bash
# Node 20 via NodeSource or nvm, then:
sudo apt-get update
sudo apt-get install -y build-essential python3 git nginx certbot python3-certbot-nginx

git clone <your-repo-url> /var/www/farewell-poster
cd /var/www/farewell-poster
npm install
# create /var/www/farewell-poster/.env.local or export env in the systemd unit
npm run build
```

Create `/etc/systemd/system/farewell.service`:

```ini
[Unit]
Description=Farewell Notes
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/farewell-poster
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/var/www/farewell-poster/.env.production
ExecStart=/usr/bin/npm run start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Put the five variables in `.env.production` (same names as `.env.example`). `chmod 600` that file.

```bash
sudo mkdir -p /var/www/farewell-poster/data
sudo chown -R www-data:www-data /var/www/farewell-poster
sudo systemctl enable --now farewell
```

Nginx reverse proxy (replace the server name):

```nginx
server {
  listen 80;
  server_name farewell.example.com;

  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo certbot --nginx -d farewell.example.com
```

`client_max_body_size 20m` matters: contributor uploads are capped at 15MB in the app.

---

## 6. Optional: Docker / Fly.io

`better-sqlite3` needs compile tools in the **build** image. Mount a volume on `/app/data`.

```dockerfile
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Run with a named volume:

```bash
docker build -t farewell-poster .
docker run -d --name farewell \
  -p 3000:3000 \
  -v farewell-data:/app/data \
  --env-file .env.production \
  farewell-poster
```

Put HTTPS in front (Caddy, nginx, Fly proxy, or Cloudflare).

On Fly.io: `fly launch` from this Dockerfile, then `fly volumes create` and mount `/app/data` in `fly.toml`.

---

## 7. Moving local data to production

Production starts empty. HR must **sign in with Google on the live URL** so a production refresh token is stored.

To copy existing farewells (metadata only; photos stay in Drive):

1. Stop the production app.
2. Copy local `data/farewell.db`, `data/farewell.db-wal`, and `data/farewell.db-shm` onto the volume at `data/`.
3. Start the app.
4. Sign in on production once if Google calls fail (token was issued for localhost in some setups; a fresh production login is the reliable fix).

Do not commit `data/*.db` to git.

---

## 8. After it is live — checklist

- [ ] `https://your-host` loads the login page
- [ ] Google origins + redirect URI match `NEXT_PUBLIC_BASE_URL` exactly
- [ ] HR test users are listed on the OAuth consent screen
- [ ] Sign-in reaches `/dashboard`
- [ ] Create a test farewell, send an invite, open the upload link on a phone
- [ ] Redeploy once and confirm the farewell is **still** on the dashboard (volume is wired)
- [ ] `SESSION_SECRET` is unique and not the local `change-me-too` value

---

## 9. What not to worry about

- **Images** — they are already in the HR Google Drive, not on the server.
- **PDF export** — runs in the browser; the server does not need extra PDF packages.
- **Contributor Google login** — they never sign in; they only use the upload link.

---

## 10. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `redirect_uri_mismatch` | Production callback URL missing or typo in Google Console |
| Sign-in works locally, 403 / “access denied” in prod | HR email not a **test user**, or not in `ALLOWED_GOOGLE_EMAILS` |
| Login cookie missing after Google redirect | Site is HTTP; production cookies require HTTPS |
| Dashboard empty after every deploy | Volume not mounted on `data/` |
| `Drive setup failed` / invalid grant | HR has not signed in **on production**, or revoked the app in Google Account |
| `better-sqlite3` build error | Image missing `python3`, `make`, `g++` |
| Uploads fail at ~1MB | Reverse proxy `client_max_body_size` too small |
| Invites have `localhost` links | `NEXT_PUBLIC_BASE_URL` still local; rebuild after changing it |

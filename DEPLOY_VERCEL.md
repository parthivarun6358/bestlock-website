# Deploy to Vercel

This project is a static site (HTML) with Vercel Serverless Functions for the contact form.

## What’s deployed

- Static pages: `index.html`, `contact.html`, `images/`
- API:
  - `POST /contact` → rewrites to `api/contact.js`
  - `GET /health/email` → rewrites to `api/health/email.js`

Local-only dev server:
- `npm start` runs `dev/server.js` (not used on Vercel)

## Steps (Vercel Dashboard)

1. Push this folder to GitHub.
2. In Vercel: **Add New → Project → Import** your repo.
3. When prompted for settings:
   - Framework Preset: **Other**
   - Build Command: *(empty)*
   - Output Directory: *(empty / default)*
4. Add **Environment Variables** in Vercel (Project → Settings → Environment Variables):
   - `EMAIL_USER` (your Gmail)
   - `EMAIL_PASS` (Gmail **App Password**, not your normal password)
   - `EMAIL_FROM` (usually same as `EMAIL_USER`)
   - `EMAIL_NOTIFY_TO` (where you want admin notifications sent)

   Optional database (must be a hosted MySQL, not localhost):
   - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
5. Deploy.

## Verify

- Open: `/contact.html` and submit the form.
- Check: `/health/email` should show `"ready": true`.

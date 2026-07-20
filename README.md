# Pablo FP

Function Prospectus system for Pablo The Art Cafe — a rebuild of the WordPress
`/function-prospectus/` page as a standalone app.

- **Frontend** — React + Vite, deployed on **Vercel**
- **Backend** — Express + TypeScript, deployed on **Railway**
- **Database** — MongoDB (local `mongod` for development, Railway MongoDB in production)

## What it does

1. Staff fill in the prospectus form and authenticate inline with **Submitted By + Password**.
2. On submit the record is saved, an FP number is reserved (`PABLO FP / 0001`, `0002`, …),
   and an **A4 PDF is generated and downloaded**.
3. The same PDF is **emailed automatically** to the distribution list.
4. The **admin panel** at `/admin` lists every submission, re-downloads or re-sends any PDF,
   edits the mail recipients, and manages staff logins.

### The PDF is always exactly one page

Every section has a fixed height and the menu cell takes the remaining space. Long menus are
scaled down to fit rather than flowing onto a second page. A realistic 50-line banquet menu
renders at full size; menus beyond roughly 120 lines will shrink to the minimum size and any
excess is clipped.

## Project layout

```
backend/          Express API, MongoDB access, PDF generation, mailer
  src/db.ts       Connection, indexes, seeding, FP serial counter
  src/pdf.ts      Single-page A4 PDF renderer
  src/mailer.ts   SMTP transport + admin-editable mail settings
  src/routes/     public.ts (form) and admin.ts (panel)
frontend/         React + Vite app
  main.tsx        Browser entry point and route selection
  app/(app)/page.tsx    The prospectus form
  app/admin/      Admin panel
```

## Local development

MongoDB must be running first:

```bash
mongod --dbpath ./.mongodb-data --port 27017
```

Backend:

```bash
cd backend
cp .env.example .env      # then fill in SMTP_PASS, JWT_SECRET, ADMIN_PASSWORD
npm install
npm run dev               # http://localhost:3001
```

Frontend:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev               # http://localhost:5173
```

## Deploying the backend to Railway

1. Create a new Railway project and point it at this repo, root directory `backend`.
2. Add a **MongoDB** service — Railway injects `MONGO_URL`, which the app picks up automatically.
3. Set these variables on the backend service:

   | Variable | Notes |
   | --- | --- |
   | `JWT_SECRET` | Long random string |
   | `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Seeded on every boot; how you sign into `/admin` |
   | `CORS_ORIGIN` | Your Vercel URL, e.g. `https://pablo-fp.vercel.app` |
   | `STAFF_CREDENTIALS` | `irfan:…,vinod:…,tushar:…` — hashed at boot, never stored in plain text |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | Hostinger mailbox |
   | `MAIL_FROM` | e.g. `Pablo Function Prospectus <info@pablotheartcafe.com>` |
   | `NOTIFY_EMAILS` | Initial recipients; editable later from the admin panel |

4. Railway builds with `npm install && npm run build` and starts with `npm run start`.

## Deploying the frontend to Vercel

1. Import the repo on Vercel with root directory `frontend`.
2. Set `VITE_API_URL` to the Railway backend URL (no trailing slash).
3. Deploy, then add that Vercel URL to `CORS_ORIGIN` on Railway.

## Security notes

- Passwords are bcrypt-hashed. The old plugin held staff passwords in plain text in
  `PABLO_ALLOWED_USERS`; here they come from `STAFF_CREDENTIALS` and are hashed at boot.
- `.env` is gitignored. Never commit the SMTP password — set it in the Railway dashboard.
- Admin sessions are JWTs valid for 12 hours.

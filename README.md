# School Help Desk Ticketing System

A general-purpose student ticket-submission portal + Staff dashboard, built with
HTML/CSS/JavaScript on the frontend and Node.js + SQLite (via
[libSQL](https://github.com/tursodatabase/libsql)) on the backend. Students can submit a
ticket for any kind of issue (academic, IT, facilities, hostel, fees, etc.) and staff
manage all of them from one dashboard.

## Why libSQL instead of a plain `.db` file?

Vercel and Netlify run your backend as **serverless functions** — there is no persistent
disk. A plain SQLite file would get wiped every time a function cold-starts, so tickets
would keep disappearing. **Turso** solves this: it's a hosted database that runs the real
SQLite engine, but reachable over the network, so serverless functions can use it safely.
The same `@libsql/client` code works two ways:

- **Locally**: points at a file (`./data/tickets.db`) — completely normal SQLite, no setup needed.
- **In production**: points at your Turso database URL — same SQL, same engine, just hosted.

## Project structure

```
ticketing-system/
├── api/
│   └── index.js          # All Express routes (auth, tickets, comments, stats)
├── lib/
│   ├── db.js              # libSQL client + schema creation + seeding
│   └── auth.js             # JWT sign/verify + requireAuth middleware
├── public/                 # Static frontend (served as-is)
│   ├── index.html           # Student portal (submit + track tickets)
│   ├── login.html            # IT Manager login
│   ├── dashboard.html         # IT Manager dashboard
│   ├── css/style.css
│   └── js/
│       ├── student.js
│       ├── login.js
│       └── dashboard.js
├── netlify/functions/api.js  # Netlify Function wrapper (same Express app)
├── server.js                 # Local dev server
├── vercel.json                # Vercel routing config
├── netlify.toml                # Netlify routing config
└── .env.example
```

## Running locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000 for the student portal, and http://localhost:3000/login.html
for staff login.

**Default staff login** (auto-created on first run, change in `.env`):
- Username: `admin`
- Password: `admin123`

The first run creates `data/tickets.db` and the `managers`, `tickets`, and `comments` tables automatically — nothing to set up by hand.

## Deploying to Vercel

1. Push this project to a GitHub repo.
2. Create a free database at [turso.tech](https://turso.tech) (`turso db create ticketing`),
   then grab the URL and an auth token:
   ```bash
   turso db show ticketing --url
   turso db tokens create ticketing
   ```
3. In Vercel, import the repo. Add these Environment Variables:
   - `DATABASE_URL` = your Turso URL (starts with `libsql://`)
   - `DATABASE_AUTH_TOKEN` = your Turso token
   - `JWT_SECRET` = any long random string
   - `DEFAULT_MANAGER_USERNAME` / `DEFAULT_MANAGER_PASSWORD` = your chosen staff login
4. Deploy. Vercel will use `vercel.json` to route `/api/*` to the Express app and serve
   everything in `public/` as static files.

## Deploying to Netlify

1. Push to GitHub, then "Add new site -> Import an existing project" in Netlify.
2. Build settings are already defined in `netlify.toml` (publish dir: `public`, functions: `netlify/functions`).
3. Add the same environment variables as above (Site settings -> Environment variables).
4. Deploy. Netlify will route `/api/*` to the bundled Express app via `netlify/functions/api.js`.

## Notes for your logbook / report

- **Frontend**: plain HTML/CSS/JS, no framework — three pages (student portal, staff
  login, staff dashboard), talking to the backend via `fetch()` calls to a REST API.
- **Backend**: Node.js + Express, exposing `/api/tickets`, `/api/tickets/:id`,
  `/api/tickets/:id/comments`, `/api/auth/login`, `/api/stats`. Full CRUD (create, read,
  update, delete) plus search/filter (by keyword, status, category, priority) on tickets.
- **Database**: SQLite, accessed through libSQL so the same code runs locally (file-based)
  and in production (Turso-hosted) without changes.
- **Categories**: sample general school categories (Academic/Registrar, IT/Computer Lab,
  Facilities/Maintenance, Hostel/Accommodation, Finance/Fees, Administration, Other) —
  edit the `CATEGORIES` array in `api/index.js` and the `<select>` options in
  `public/index.html`, `public/dashboard.html`, and `public/js/dashboard.js` to change them.
- **Auth**: staff passwords are hashed with bcrypt; the dashboard is protected with a
  signed JWT stored in the browser's `localStorage` and sent as a Bearer token.
- **Students never need an account** — they get a unique ticket code (e.g. `TCK-8X4K2P`)
  at submission time and use it to check status later.

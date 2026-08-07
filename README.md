# ImprintID

An internal proof-generator for printed/imprinted products — product
catalog with color photos and imprint presets, drag-and-drop logo
placement, automatic logo color treatments (full color, laser-engraved
metal, embroidery, Pantone spot color), and PDF proof export. Optionally
pulls order details from Business Central.

This version is set up to deploy on **Vercel**, with data stored in
**Vercel Postgres**. You can also run it on your own machine for
development/testing.

---

## 1. Put this in a GitHub repository

If you don't already have this in a repo:

```bash
cd imprintid            # this folder
git init
git add .
git commit -m "Initial commit"
```

Then create an empty repository on GitHub (github.com → New repository —
**don't** initialize it with a README, since you already have one), and
push:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git branch -M main
git push -u origin main
```

`.gitignore` is already set up to keep `node_modules/`, `.env`, and any
Vercel-local files out of the repo.

## 2. Create the Vercel project

1. Go to [vercel.com](https://vercel.com), sign in (GitHub sign-in is the
   easiest option), and click **Add New… → Project**.
2. Pick the GitHub repository you just pushed. Vercel will detect it as a
   Node.js project automatically — you don't need to change any build
   settings.
3. Click **Deploy**. It'll succeed even before the database is connected —
   the app loads fine, it just can't save/load anything yet.

## 3. Add Postgres storage

1. In your new Vercel project, go to the **Storage** tab.
2. Click **Create Database → Postgres** (this is Vercel's native Postgres,
   powered by Neon under the hood). Follow the prompts — the free tier is
   enough to start.
3. Once created, Vercel automatically connects it to your project and
   injects the right environment variables (`POSTGRES_URL` and a few
   related ones) — you don't need to copy/paste anything for production.
4. Go to **Deployments** and redeploy (or just push a new commit) so the
   app picks up the new environment variables.

That's it — your catalog and proofs now persist in that database instead
of a local file.

## 4. (Optional) Business Central integration

Same as before — see `business-central-api-request.md` for what to ask
your IT team/BC partner for, and `bc-field-map.js` for mapping the custom
fields once you have that information.

Add the six `BC_*` values from `.env.example` in **Project Settings →
Environment Variables** in Vercel (not in a file — Vercel manages these
for you in production). Redeploy after adding them.

## 5. Running it locally (for development/testing)

```bash
npm install
cp .env.example .env
```

Then fill in `.env`:
- **POSTGRES_URL** — copy this from your Vercel project's Storage tab
  (click your database → `.env.local` tab → copy the `POSTGRES_URL` value).
  This makes your local server talk to the *same* database as production,
  so you're testing against real data, not a separate copy.
- The `BC_*` values, if you're using Business Central.

```bash
npm start
```

Open `http://localhost:3000`.

**Careful:** since local development points at the same production
database by default, anything you save locally is real — there's no
separate "test" database unless you create a second Postgres database in
Vercel and use its connection string locally instead.

## How this is structured

- **`public/index.html`** — the entire frontend (UI, logic, PDF export).
  Vercel serves this directly as a static file — fast, no server
  involved for the page itself.
- **`app.js`** — the Express app with all the `/api/*` routes (storage
  API + Business Central). This is the one place route logic lives.
- **`api/index.js`** — Vercel's serverless function entry point; just
  hands off to `app.js`. This is what actually runs in production.
- **`server.js`** — local-development-only entry point; adds static file
  serving on top of `app.js` (Vercel does that separately/natively, so
  this is only needed when running on your own machine).
- **`lib/db.js`** — the Postgres storage layer (a simple key/value table,
  same shape the app has always used).
- **`bc-field-map.js`** — Business Central custom field mapping, plain
  English, edit directly if your field names differ.

## Planning ahead: moving to AWS later

This is built with a future AWS move in mind, so it's worth knowing what
will and won't need to change when that happens:

**Won't need to change:**
- `api/app.js` — the actual Express app (all routes, all logic). This is
  plain Express with no Vercel-specific code in it at all.
- `api/lib/db.js` — uses the standard `pg` driver, which works against any
  real Postgres server over the normal wire protocol. Moving from Neon to
  AWS RDS or Aurora Postgres is just a connection-string change, not a
  code change.
- `server.js` — already runs the app as a normal long-running Node
  process. This is very close to what you'd deploy on AWS.

**Will need to change (only at actual migration time):**
- `api/index.js` and `vercel.json` are Vercel-specific — these get
  replaced by whichever AWS compute you land on:
  - **EC2, ECS/Fargate, or Elastic Beanstalk** — the simplest path, since
    these just run `server.js` directly (same as running it locally),
    no serverless wrapper needed at all.
  - **AWS Lambda** (if you want to stay serverless) — would need a small
    adapter (the `serverless-http` package is the standard way to wrap an
    existing Express app for Lambda) plus an API Gateway in front of it.
- The database connection string moves from Neon's to RDS/Aurora's — same
  `DATABASE_URL` environment variable, different value.
- Photos are currently stored as base64 text inside the database (same
  approach the original local SQLite version used) — this still works
  fine on AWS as-is. If the catalog grows large enough that this becomes
  slow or expensive, moving photos to S3 (with the database just storing
  a URL) would be the natural next step, but isn't necessary up front.

## Limitations worth knowing

- **Cold starts:** serverless functions "sleep" when idle and take a
  moment to wake up on the first request after a while — you might notice
  a brief pause after periods of no activity. Subsequent requests are
  fast.
- **No file-based photo storage:** photos are stored as base64 text
  inside the database (same as before), not as separate files — this
  keeps everything working the same way, but very large catalogs will use
  more database storage than a typical setup. Vercel Postgres' free tier
  has a storage cap; keep an eye on it as your catalog grows.
- **Business Central token caching** resets on cold starts (a fresh
  serverless instance has no memory of the previous one) — this just
  means occasionally re-authenticating, not a functional problem.

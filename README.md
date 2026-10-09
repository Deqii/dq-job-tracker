# Job Application Tracker

A personal tool for logging every company, role, and full job-description snapshot for every job application, with status tracked through a timestamped history.

Unlike a spreadsheet or a folder of links, each application is a persistent record: the full job description is stored (not just a URL) because postings are routinely edited or taken down, and every status change (Wishlist → Applied → Assessment → Interview → Offer / Rejected / Withdrawn) is appended to an append-only history log. That makes each application's timeline, and the shape of a job search over time, reconstructable. The app is single-user — there is no sharing or collaboration. Full requirements live in [`PRD.md`](./PRD.md).

## Screenshots

![Dashboard](docs/screenshots/dashboard.png)
![Applications list](docs/screenshots/applications.png)
![Application detail](docs/screenshots/application-detail.png)
![Log an application](docs/screenshots/log-application.png)

## Features

- Email/password authentication (register + login) with JWT and bcrypt-hashed passwords.
- Companies: create, read, update and delete, with in-page search by name.
- Applications: create, read, update and delete, each storing a full job-description snapshot (immutable) alongside role, company, posting URL, location/remote type, salary and applied date.
- Status pipeline: Wishlist, Applied, Assessment, Interview, Offer, Rejected, Withdrawn — changeable from the application detail page and from the status badge in the applications list.
- Status history timeline: every change is appended with a timestamp and shown per application.
- Notes: free-form, editable notes on each application.
- Tags: custom labels, editable on the application detail page, shown as chips and usable as a filter.
- Search and filter: applications by company, status, tag and applied date range.
- Dashboard: counts per status, response rate, per-tag stats, recent activity and a "needs follow-up" card for applications still in Applied after 14 days.
- Excel export: export all or the current filtered set of applications to `.xlsx`.

## Tech stack

| Layer          | Technology                                                                             |
| -------------- | -------------------------------------------------------------------------------------- |
| Frontend       | React 18 + Vite, TypeScript, React Router v6, TanStack Query, Axios, Zod, Tailwind CSS |
| Backend        | Express + Node.js, TypeScript                                                          |
| Database / ORM | MySQL via Prisma (developed against XAMPP's MariaDB 10.4)                              |
| Auth           | JWT + bcrypt                                                                           |
| Export         | ExcelJS (server-side `.xlsx` generation)                                               |
| Testing        | Vitest (web and api); Testing Library + jsdom (web), Supertest (api)                   |
| Tooling        | npm workspaces, ESLint, Prettier, concurrently                                         |

## Project structure

```
.
├── apps/
│   ├── web/      # React + Vite frontend
│   └── api/      # Express + Node.js REST API (Prisma, MySQL)
├── docs/         # screenshots (referenced above)
├── package.json  # npm workspaces root
├── PRD.md        # product requirements
└── AGENTS.md     # contributor / agent notes
```

`apps/web` and `apps/api` are independently deployable and only talk to each other over HTTP through the REST API — never import code directly across that boundary.

## Getting started

Prerequisites:

- Node.js >= 20 (from the `engines` field in the root and API `package.json`; there is no `.nvmrc`).
- A running MySQL or MariaDB server (developed against XAMPP's MariaDB 10.4).

1. Install dependencies once, at the repo root:

   ```bash
   npm install
   ```

2. Configure environment variables. Copy both examples to `.env` and fill them in:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

   `apps/api/.env`:

   - `DATABASE_URL` — MySQL connection string used by Prisma (`mysql://root:password@localhost:3306/job_tracker`; for a XAMPP default with no password, `mysql://root@localhost:3306/job_tracker`).
   - `JWT_SECRET` — signing secret for auth tokens. Generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `PORT` — port the API listens on (default `4000`).
   - `NODE_ENV` — `development` or `production`.

   `apps/web/.env`:

   - `VITE_API_URL` — base URL of the API, e.g. `http://localhost:4000`. Optional in dev: leave it empty to use the Vite dev proxy that forwards `/api` to `http://localhost:4000`. Required for production builds, where it should be the deployed API origin.

3. Create the database (once):

   ```sql
   CREATE DATABASE job_tracker CHARACTER SET utf8mb4;
   ```

4. Apply the committed migrations, from `apps/api`:

   ```bash
   npx prisma migrate deploy
   ```

   `migrate deploy` applies the migrations committed in `apps/api/prisma/migrations` and is safe on an empty database. Use `npx prisma migrate dev` only when you are changing the schema.

5. Start the dev servers, from the repo root:

   ```bash
   npm run dev            # web + api together via concurrently
   # or individually
   npm run dev -w apps/web
   npm run dev -w apps/api
   ```

The API listens on `http://localhost:4000` (`PORT` defaults to `4000`) and the web app on `http://localhost:5173` (Vite `server.port`).

## Scripts

Run from the repo root unless noted. Root scripts fan out to the workspaces.

| Command                   | Location            | Purpose                                     |
| ------------------------- | ------------------- | ------------------------------------------- |
| `npm run dev`             | root                | Run web and api together via `concurrently` |
| `npm run dev:web`         | root                | Frontend dev server                         |
| `npm run dev:api`         | root                | Backend dev server                          |
| `npm run build`           | root                | Build the frontend (alias of `build:web`)   |
| `npm run build:web`       | root                | Type-check and build the frontend           |
| `npm run build:api`       | root                | Compile the API                             |
| `npm run test`            | root                | Run Vitest in both workspaces               |
| `npm run test:web`        | root                | Run the frontend tests                      |
| `npm run lint`            | root                | Run ESLint in both workspaces               |
| `npm run lint:web`        | root                | Run the frontend ESLint                     |
| `npm run format`          | root                | Prettier write across the repo              |
| `npm run dev`             | apps/web / apps/api | Start the dev server for that workspace     |
| `npm run build`           | apps/web / apps/api | Type-check/build the workspace              |
| `npm run preview`         | apps/web            | Serve the production build locally          |
| `npm run start`           | apps/api            | Run the compiled API from `dist/`           |
| `npm run test`            | apps/web / apps/api | Run that workspace's Vitest suite           |
| `npm run test:watch`      | apps/web / apps/api | Run Vitest in watch mode                    |
| `npm run lint`            | apps/web / apps/api | Run ESLint for that workspace               |
| `npm run prisma:generate` | apps/api            | Regenerate the Prisma client                |
| `npm run prisma:migrate`  | apps/api            | Create/apply a migration in development     |
| `npm run prisma:deploy`   | apps/api            | Apply committed migrations                  |

## Testing

Run `npm run test` from the root, or `npm run test -w apps/web` / `npm run test -w apps/api` for one workspace. The web suite (Vitest + Testing Library in jsdom) covers components, the application form, detail and list, companies search, dashboard follow-ups and tag stats, accessibility, and query-string utils; the API suite covers the application and dashboard services, Zod schemas, and HTTP routes via Supertest.

## Backups and data safety

- The Applications page has an **Export .xlsx** button that downloads the current (possibly filtered) set of applications as an Excel file.
- Full database backup with `mysqldump`:

  ```bash
  mysqldump -u root job_tracker > backup.sql
  ```

  On Windows, `mysqldump` may not be on `PATH` — use the full path to MySQL's `bin` folder (e.g. `C:\xampp\mysql\bin\mysqldump.exe`).

- Stop MySQL from the XAMPP control panel before shutting down the computer. An unclean shutdown once corrupted XAMPP's InnoDB files.

## Documentation

- [`PRD.md`](./PRD.md) — product requirements.
- [`AGENTS.md`](./AGENTS.md) — repo conventions and agent/contributor notes.

## Out of scope

From PRD 2.3:

- Automatic scraping or import of job postings from job boards.
- Team/multi-user collaboration or shared application tracking.
- Native mobile apps — this is a web app.
- Resume/cover-letter builder tooling (only a reference field for which version was used).
- Interview-scheduling or calendar/email integration.

## License

Personal project.

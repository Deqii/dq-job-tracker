# Job Application Tracker

A personal tool for logging every company, role, and full job-description snapshot for every job application, with status tracked through a timestamped history.

Unlike a spreadsheet or scattered notes, each application is a persistent record rather than a link. The full job description is stored — not just a URL — because postings are routinely edited or taken down. Every status change (Wishlist → Applied → Assessment → Interview → Offer/Rejected/Withdrawn) is appended to a history log, so you can always reconstruct how long each stage took and see the shape of your search over time.

Single-user, no sharing or collaboration. Full requirements live in [`PRD.md`](./PRD.md).

## Features

- Secure sign-up / login with JWT and bcrypt-hashed passwords
- Company CRUD (name, website, industry, notes)
- Application CRUD with a stored job-description snapshot
- Status pipeline with an append-only, timestamped status-history timeline
- Free-form notes per application
- Custom tags per application
- Search and filter by company, status, tag, or date range
- Dashboard summarizing counts by status and response rate
- Export all or filtered applications to Excel (`.xlsx`)

## Tech stack

| Layer              | Technology                |
| ------------------ | ------------------------- |
| Frontend framework | React (Vite)              |
| Language           | TypeScript                |
| Routing            | React Router v6           |
| Data fetching      | TanStack Query            |
| HTTP client        | Axios                     |
| Validation         | Zod                       |
| Backend            | Express (Node.js)         |
| Database           | MySQL                     |
| ORM                | Prisma                    |
| Data export        | ExcelJS                   |
| Auth               | JWT + bcrypt              |
| Testing            | Vitest                    |

## Repo layout

```
.
├── apps/
│   ├── web/      # React + Vite frontend
│   └── api/      # Express + Node.js REST API
├── package.json  # npm workspaces root
└── PRD.md
```

`apps/web` and `apps/api` are independently deployable services that only talk to each other over HTTP through the REST API — never import code directly across that boundary.

## Prerequisites

- Node.js >= 20
- A running MySQL server

## Getting started

1. Install dependencies (once, at the repo root):

   ```bash
   npm install
   ```

2. Configure environment variables. Copy each example and fill in real values:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

   `apps/api/.env`:

   | Variable       | Description                                    |
   | -------------- | ---------------------------------------------- |
   | `DATABASE_URL` | MySQL connection string used by Prisma         |
   | `JWT_SECRET`   | Signing secret for auth tokens                 |
   | `PORT`         | Port the API listens on (default `4000`)       |

   `apps/web/.env`:

   | Variable       | Description                                          |
   | -------------- | ---------------------------------------------------- |
   | `VITE_API_URL` | Base URL of the API, e.g. `http://localhost:4000`    |

3. Create the database schema (from `apps/api`):

   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. Start the dev servers:

   ```bash
   npm run dev            # both web and api via concurrently
   # or individually
   npm run dev -w apps/web
   npm run dev -w apps/api
   ```

The API runs on `http://localhost:4000` and the web app on Vite's default `http://localhost:5173`.

## Scripts

Run from the repo root unless noted.

| Command                        | Description                              |
| ------------------------------ | ---------------------------------------- |
| `npm run dev`                  | Run web + api together                   |
| `npm run dev -w apps/web`      | Frontend dev server                      |
| `npm run dev -w apps/api`      | Backend dev server                       |
| `npm run build -w apps/web`    | Type-check and build the frontend        |
| `npm run build -w apps/api`    | Compile the API                          |
| `npm run test`                 | Run Vitest across both workspaces        |
| `npm run lint`                 | ESLint across both workspaces            |
| `npm run format`               | Prettier write across the repo           |

Prisma commands are run from `apps/api`:

```bash
npx prisma migrate dev     # apply migrations
npx prisma generate        # regenerate the client after a schema change
npx prisma migrate deploy  # apply migrations in production
```

## API surface

All routes are prefixed with `/api` and (except auth) require a bearer JWT. Every query is scoped to the authenticated user.

| Route                          | Method             | Purpose                                                                 |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------- |
| `/api/auth/register`           | POST               | Register a new user                                                     |
| `/api/auth/login`              | POST               | Log in, issue JWT                                                       |
| `/api/companies`               | GET, POST          | List/create companies                                                   |
| `/api/companies/:id`           | PATCH, DELETE      | Update/delete a company                                                 |
| `/api/applications`            | GET, POST          | List/create applications                                                |
| `/api/applications/:id`        | GET, PATCH, DELETE | Read/update/delete an application                                       |
| `/api/applications/:id/status` | POST               | Log a status change                                                     |
| `/api/tags`                    | GET, POST          | List/create tags                                                        |
| `/api/dashboard`               | GET                | Aggregate stats by status                                               |
| `/api/applications/export`     | GET                | Stream an Excel (`.xlsx`) file, honoring the same filters as the list   |

## Domain rules

These are hard constraints, not suggestions:

- **Never overwrite or delete `Application.jobDescription`.** Preserving the original posting text is the core value of the app.
- **Every status change inserts a new `StatusHistory` row** before or alongside updating `Application.currentStatus`. The timeline depends on that log being complete.
- **Every query is scoped to `userId`.** A user must never read or write another user's data.
- **Store all timestamps in UTC**; convert to local time only at the presentation layer.

## Before opening a PR

1. `npm run lint`
2. `npm run test`
3. `npm run build` for whichever workspace(s) changed

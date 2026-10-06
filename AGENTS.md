## Project

Job Application Tracker — a personal tool for logging companies, roles, and full job-description snapshots for every job application, with status tracked through a timestamped history. Full product requirements live in `PRD.md`

## Repo layout (monorepo)

```
.
├── apps/
│   ├── web/      # React + Vite frontend
│   └── api/      # Express + Node.js REST API
├── package.json  # npm workspaces root
└── AGENTS.md
```

`apps/web` and `apps/api` are independently deployable services that only talk to each other over HTTP through the REST API — never import code directly across that boundary.

## Setup & commands

- Install everything: `npm install` (once, at the repo root)
- Frontend dev server: `npm run dev -w apps/web`
- Backend dev server: `npm run dev -w apps/api`
- Both at once: `npm run dev` (root script running both workspaces via `concurrently`)
- Build: `npm run build -w apps/web` / `npm run build -w apps/api`
- Test: `npm run test` (Vitest, root or per-workspace)
- Prisma, from `apps/api`: `npx prisma migrate dev` to apply migrations, `npx prisma generate` after any schema change

## Environment variables

`apps/api/.env`:

- `DATABASE_URL` — MySQL connection string (used by Prisma)
- `JWT_SECRET` — signing secret for auth tokens

`apps/web/.env`:

- `VITE_API_URL` — base URL of the API, e.g. `http://localhost:4000`

## Tech stack

- **Frontend:** React (Vite), TypeScript, React Router v6, TanStack Query, Axios, Zod, Tailwind CSS
- **Backend:** Express, Node.js, TypeScript, Prisma ORM, MySQL
- **Auth:** JWT, bcrypt-hashed passwords
- **Export:** ExcelJS for server-side .xlsx generation
- **Testing:** Vitest across both workspaces

## Code conventions

- TypeScript strict mode everywhere — no implicit `any`.
- Validate every incoming request with Zod at the route boundary, before it reaches Prisma.
- Keep Prisma calls inside a `services/` (or `repositories/`) layer in `apps/api`; route handlers stay thin and only orchestrate.
- ESLint + Prettier; fix lint errors before committing rather than suppressing them.

## Temporary and debug files

- Never write outside the repo: no `/tmp`, no `AppData\Local\Temp`. On this Windows setup `/tmp` resolves to the user's Temp folder and triggers a permission prompt.
- Scratch files that are not tests go in `.tmp/` at the repo root (gitignored).
- Debug tests go directly next to the real tests (e.g. `apps/web/src/test/`), named `*.debug.test.ts(x)` (gitignored). Delete them before finishing the task.
- When running a single test, run it from the workspace (`npm run test -w apps/web -- <file>`) and show the full unfiltered output first. Only filter output after you've seen why it fails.

## Domain rules agents must not violate

These come directly from the PRD's non-functional requirements — treat them as hard constraints, not suggestions:

- **Never overwrite or delete `Application.jobDescription`.** Preserving the original posting text is the core value of the app, even after the listing itself is edited or taken down elsewhere.
- **Every status change inserts a new `StatusHistory` row before or alongside updating `Application.currentStatus`.** Never update `currentStatus` directly without a matching history entry — the dashboard and timeline both depend on that log being complete.
- **Every query is scoped to `userId`.** There is no shared or admin view in this app; a user must never be able to read or write another user's companies, applications, or tags.
- **Store all timestamps in UTC**; convert to local time only at the presentation layer.

## Git workflow

- One feature branch per unit of work; squash to a single commit when merging.
- Commit messages follow Conventional Commits, written in English (`feat:`, `fix:`, `chore:`, `refactor:`, …).
- PR description template:
  ```
  ## What
  ## Changes
  ## Closes
  ```
- Work is tracked as 5 milestones via GitHub issues/labels. Bump the version only once a milestone is fully closed — not mid-milestone.

## Before opening a PR

1. `npm run lint`
2. `npm run test`
3. `npm run build` for whichever workspace(s) changed

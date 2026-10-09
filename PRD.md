# Product Requirements Document: Job Application Tracker

## 1. Overview

Job Application Tracker is a personal job-search organization tool for logging every company, role, and job description a user has applied to, and tracking each application's progress through the hiring pipeline.

Unlike a spreadsheet or scattered notes, the system treats each application as a persistent record rather than a link. Once a job description is logged, its full text is stored — not just a URL to it — because postings are routinely edited or taken down by the time the user wants to revisit them for interview prep or comparison. Status changes (Applied → Assessment → Interview → Offer/Rejected) are appended to a timestamped history rather than overwriting a single field, so the user can always reconstruct how long each stage took and see the shape of their job search over time.

The tool is scoped for single-user personal use — there are no social, sharing, or collaborative features. The goal is one complete, always-searchable record: every company approached, every role description saved exactly as it was applied to, and every status change logged.

## 2. Requirements

### 2.1 Functional Requirements

- Users must be able to register and authenticate securely.
- Users must be able to create, read, update, and delete company records (name, website, industry, notes).
- Users must be able to create, read, update, and delete job applications linked to a company, storing the role title, the full job description text, posting URL, location/remote type, and salary range (if listed).
- Users must be able to set and update an application's status (Wishlist, Applied, Assessment, Interview, Offer, Rejected, Withdrawn).
- The system must log every status change with a timestamp, producing a full status-history timeline per application.
- Users must be able to attach free-form notes to an application (e.g., interviewer names, prep notes).
- Users must be able to tag applications with custom labels (e.g., "referral," "remote," "priority").
- Users must be able to search and filter applications by company, status, tag, or date range.
- Users must be able to view a dashboard summarizing application counts by status and overall response rate.
- Users must be able to export their application data — the full collection or a filtered subset — to an Excel (.xlsx) file.

### 2.2 Non-Functional Requirements

- **Correctness:** Status-history timestamps must be stored in UTC and displayed in the user's local timezone with zero drift across day-boundary edge cases.
- **Security:** All API routes must enforce per-user authorization so users can only read/write their own data.
- **Performance:** Target a Lighthouse score of 90+.
- **Data safety:** A stored job description must never be overwritten or lost — even if the original posting is later edited or taken down.
- **Usability:** Logging a new application (company + role + description) should be completable in under 60 seconds.

### 2.3 Out of Scope

- Automatic scraping or import of job postings from job boards.
- Team/multi-user collaboration or shared application tracking.
- Native mobile apps — this is a web app.
- Resume/cover-letter builder tooling (only a reference field for which version was used).
- Interview-scheduling or calendar/email integration.

## 3. Core Features

| Feature                | Description                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Authentication         | Secure sign-up/login (JWT-based)                                                    |
| Company CRUD           | Create/read/update/delete company records                                           |
| Application CRUD       | Create/read/update/delete applications, including a stored job-description snapshot |
| Status pipeline        | Move an application through defined stages                                          |
| Status history log     | Timestamped record of every status transition                                       |
| Notes                  | Free-form notes per application                                                     |
| Tagging                | Custom labels per application                                                       |
| Tag editing            | Add/remove tags on the application detail page                                      |
| Inline status change   | Change an application's status from the list badge without opening it               |
| Search & filter        | Filter by company, status, tag, or date range                                       |
| Company search         | Filter the companies list by name                                                   |
| Dashboard summary      | Counts per status and response-rate stats                                           |
| Dashboard by-tag stats | Per-tag totals and responded counts on the dashboard                                |
| Needs follow-up        | Dashboard card listing applications still Applied after 14 days                     |
| Data export            | Export applications — all or filtered — to an Excel (.xlsx) file                    |

## 4. User Flow

1. **Sign up / Log in** — user registers or logs in.
2. **Dashboard (home)** — user sees a summary of all applications grouped by status, per-tag stats, a "needs follow-up" card, plus recent activity.
3. **Log a new application** — user adds (or selects an existing) company, then creates an application: role title, full job description pasted in, posting URL, location, salary range, and initial status ("Applied").
4. **Update status** — as the process moves forward, the user updates the application's status (from the detail page or directly from the status badge in the applications list); each change is appended to that application's status-history log.
5. **Add notes & tags** — user attaches prep notes, interviewer names, or labels like "referral" as the process continues; both notes and tags are editable on the application detail page.
6. **Search past applications** — user filters by company, status, or tag to revisit a previous job description or check where things stand; the companies list can also be searched by name.
7. **Review dashboard** — user checks aggregate stats (e.g., 40 applied, 6 in interview, response rate).
8. **Export data** — user exports the full list, or whatever is currently filtered (e.g., just "Interview" status), to an Excel file for offline backup or sharing.

## 5. Architecture

**High-level shape:** A monorepo containing a React (Vite) single-page frontend and a separate Express/Node.js REST API backend, communicating over HTTP. Unlike a Next.js full-stack app, this is a decoupled frontend/backend split — two independently deployable services living in one repository.

```
┌──────────────────────────────┐         ┌────────────────────────────────┐
│     apps/web (frontend)       │         │       apps/api (backend)        │
│                                │         │                                  │
│  React + Vite                 │         │  Express + Node.js               │
│  React Router v6 — routing    │  REST   │  /api/auth                       │
│  TanStack Query — data cache  │ ──────▶ │  /api/companies                  │
│  Axios — HTTP client          │  JSON   │  /api/applications                │
│  Zod — input validation       │         │  /api/applications/:id/status    │
│                                │         │  /api/tags                       │
│                                │         │  /api/dashboard                  │
└──────────────────────────────┘         └────────────────┬─────────────────┘
                                                             │
                                                Prisma ORM   │
                                                             ▼
                                          ┌────────────────────────────────┐
                                          │              MySQL               │
                                          │  users, companies,               │
                                          │  applications, status_history,   │
                                          │  tags, application_tags          │
                                          └────────────────────────────────┘
```

**API surface:**

| Route                          | Method             | Purpose                                                                                                    |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `/api/auth/register`           | POST               | Register a new user                                                                                        |
| `/api/auth/login`              | POST               | Log in, issue JWT                                                                                          |
| `/api/companies`               | GET, POST          | List/create companies                                                                                      |
| `/api/companies/:id`           | PATCH, DELETE      | Update/delete a company                                                                                    |
| `/api/applications`            | GET, POST          | List/create applications                                                                                   |
| `/api/applications/:id`        | GET, PATCH, DELETE | Read/update/delete an application                                                                          |
| `/api/applications/:id/status` | POST               | Log a status change                                                                                        |
| `/api/tags`                    | GET, POST          | List/create tags                                                                                           |
| `/api/dashboard`               | GET                | Aggregate stats by status, per-tag stats, and follow-ups                                                   |
| `/api/applications/export`     | GET                | Stream an Excel (.xlsx) file of applications, honoring the same filter query params as `/api/applications` |
| `/api/health`                  | GET                | Health check                                                                                               |

`GET /api/dashboard` returns `counts` (one count per status), `total`, `successRate` (the share of applications currently at Interview or Offer, as a whole-number percentage; `0` when there are none) and `recentActivity`, plus two additive fields:

- `tagStats` — one entry per tag (`name`, `total`, `responded`), where "responded" means the application's current status is Interview or Offer. Sorted by `total` descending, then name ascending, capped at the 8 highest totals.
- `followUps` — `{ count, items }` for applications still in `APPLIED` status whose `appliedAt` is at least `FOLLOW_UP_AFTER_DAYS` (14) days in the past. Each item is `{ id, roleTitle, companyName, appliedAt, daysWaiting }`; items are longest-waiting first (then by id) and capped at 5, while `count` is the full matching total.

`PATCH /api/applications/:id` does not accept `jobDescription` — the stored snapshot is immutable. When a `tags` array is sent it is a full replacement: the application's existing tag links are deleted and the supplied set is written instead.

## 6. Database Schema

MySQL via Prisma ORM.

```prisma
model User {
  id           String        @id @default(uuid())
  email        String        @unique
  passwordHash String
  createdAt    DateTime      @default(now())
  companies    Company[]
  applications Application[]

  @@map("users")
}

model Company {
  id           String        @id @default(uuid())
  userId       String
  user         User          @relation(fields: [userId], references: [id])
  name         String
  website      String?
  industry     String?
  notes        String?       @db.Text
  createdAt    DateTime      @default(now())
  applications Application[]

  @@index([userId])
  @@map("companies")
}

model Application {
  id             String            @id @default(uuid())
  userId         String
  user           User              @relation(fields: [userId], references: [id])
  companyId      String
  company        Company           @relation(fields: [companyId], references: [id])
  roleTitle      String
  jobDescription String            @db.Text
  postingUrl     String?
  location       String?
  isRemote       Boolean           @default(false)
  salaryRange    String?
  resumeVersion  String?
  notes          String?           @db.Text
  currentStatus  ApplicationStatus @default(APPLIED)
  appliedAt      DateTime          @default(now())
  createdAt      DateTime          @default(now())
  statusHistory  StatusHistory[]
  tags           ApplicationTag[]

  @@index([userId])
  @@index([companyId])
  @@map("applications")
}

model StatusHistory {
  id            String            @id @default(uuid())
  applicationId String
  application   Application       @relation(fields: [applicationId], references: [id])
  status        ApplicationStatus
  note          String?
  changedAt     DateTime          @default(now())

  @@index([applicationId])
  @@map("status_history")
}

model Tag {
  id           String           @id @default(uuid())
  userId       String
  name         String
  applications ApplicationTag[]

  @@unique([userId, name])
  @@map("tags")
}

model ApplicationTag {
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  tagId         String
  tag           Tag         @relation(fields: [tagId], references: [id])

  @@id([applicationId, tagId])
  @@map("application_tags")
}

enum ApplicationStatus {
  WISHLIST
  APPLIED
  ASSESSMENT
  INTERVIEW
  OFFER
  REJECTED
  WITHDRAWN
}
```

**Notes on this schema:**

- `Application.jobDescription` uses `@db.Text` specifically so the full posting text — not just a URL — is preserved indefinitely, even after the original listing is edited or removed.
- `Application.notes` is application-level free-form text (`@db.Text`), separate from the per-stage `StatusHistory.note` recorded on an individual status transition.
- `StatusHistory` is append-only. `Application.currentStatus` is a denormalized convenience field for fast dashboard queries, while the authoritative timeline always lives in `StatusHistory`.
- `ApplicationTag` is a many-to-many join table, so one tag (e.g., "referral") can apply across many applications.

Migrations live under `apps/api/prisma/migrations`: `20260917120000_init` and `20261007093007_add_application_notes`.

## 7. Tech Stack

| Layer              | Technology                                                     |
| ------------------ | -------------------------------------------------------------- |
| Frontend framework | React (Vite)                                                   |
| Language           | TypeScript                                                     |
| Routing            | React Router v6                                                |
| Data fetching      | TanStack Query                                                 |
| HTTP client        | Axios                                                          |
| Validation         | Zod                                                            |
| Styling            | Tailwind CSS                                                   |
| Backend            | Express (Node.js)                                              |
| Database           | MySQL                                                          |
| ORM                | Prisma                                                         |
| Data export        | ExcelJS (server-side .xlsx generation, streamed as a download) |
| Auth               | JWT (email + password, bcrypt-hashed)                          |
| Testing            | Vitest; Testing Library + jsdom (web), Supertest (api)         |
| Version control    | GitHub — five-milestone, issue-driven workflow                 |

## 8. Status of the PRD

_Last updated: 2026-10-09._

All functional requirements in §2.1 are implemented and verified against the current code.

**Verification note (Performance, section 2.2):** Lighthouse on the production build (`vite preview`), application detail page, on <tanggal>: Performance 100, Accessibility 96, Best Practices 100, SEO 91.

See [`README.md`](./README.md) for setup and usage, and [`AGENTS.md`](./AGENTS.md) for repository conventions and data-safety rules.

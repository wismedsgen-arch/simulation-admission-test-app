# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Is

**Weizmann Mail** — a simulated email inbox exam platform for the Miriam and Aaron Gutwirth MD-PhD Program at the Weizmann Institute of Science. Students take a timed email-simulation admission test; psychologists supervise and interact via a parallel inbox; admins manage scenarios and exam cycles.

## Commands

```bash
# Development
npm run dev

# Build (requires env vars)
DATABASE_URL='postgresql://...' SESSION_SECRET='...' APP_BASE_URL='http://localhost:3000' npm run build

# Database
npm run db:push          # push schema changes (no migration files)
npm run seed             # seed the database via prisma/seed.ts
npm run prisma:generate  # regenerate Prisma client after schema changes

# Lint
npm run lint

# Production start (auto-runs prisma db push then next start)
npm start
```

## Required Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Used to hash session tokens |
| `APP_BASE_URL` | Full origin URL (e.g. `http://localhost:3000`) |
| `STORAGE_MODE` | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR` | Local file upload directory (default `./.uploads`) |
| `STORAGE_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET` | S3-compatible storage (when `STORAGE_MODE=s3`) |
| `MAX_ATTACHMENT_BYTES` | Max upload size (default 26214400 = 25 MB) |
| `BOOTSTRAP_ADMIN_NAME/ID/PASSWORD` | Seeds the first admin account |

## Architecture

### User Roles & Routes

| Role | Login | Main page |
|---|---|---|
| Student | `/student/login` (name + gov ID + 4-digit exam code) | `/student` |
| Psychologist | `/staff/login` | `/psychologist` |
| Admin | `/staff/login` | `/admin` |

- `/setup` handles first-run bootstrap when no approved admin exists.
- Staff signup is at `/staff/signup` and requires admin approval.
- Public home page (`/`) is student-facing only; staff links are shared from admin.

### Session / Auth Model

- Sessions are stored in the database (`AppSession` table), hashed with `SESSION_SECRET`.
- `src/lib/auth/session.ts` — `getCurrentActor()`, `requireStaff()`, `requireStudent()`, session creation/destruction.
- Two actor types: `STAFF` (psychologist or admin) and `STUDENT` (exam participant).
- `ActorType` enum from Prisma is used everywhere — do not use string literals.

### Exam Flow (in order)

1. Admin creates a **Scenario** with roles, email templates (preloaded + follow-up), and optional files.
2. Admin creates an **ExamCycle** linked to the scenario — generates a 4-digit `accessCode`.
3. Students self-enroll by logging in with the access code → creates `ExamCycleStudent` (status: `WAITING`).
4. Psychologist **claims** a student from the waiting pool → status: `CLAIMED`.
5. Psychologist **releases instructions** → creates a `Session` (status: `READY`) and sends preloaded emails.
6. Psychologist **starts** the test → `Session` transitions to `ACTIVE`; timer starts.
7. Student acknowledges intro and enters the live mailbox.
8. Session ends by time expiry (`expireDueSessions()`) or psychologist force-ending.

### Key Status Enums

- `CycleStudentStatus`: `WAITING → CLAIMED → READY → ACTIVE → COMPLETED`
- `SessionStatus`: `READY → ACTIVE → COMPLETED | FORCED_ENDED | EXPIRED`
- `ExamCycleStatus`: `DRAFT → READY → LIVE → ARCHIVED`

### Server Actions

All mutations are Next.js Server Actions in `src/lib/actions/`:

- `admin.ts` — scenario CRUD, exam cycle management, user approval
- `psychologist.ts` — claim/release/start/end sessions, send follow-up emails
- `student.ts` — begin session, send/trash/restore messages, manage drafts
- `auth.ts` — login, logout, signup

Actions use the `useActionState` pattern via `<ActionForm>` + `<ActionSubmitButton>` shared components.

### Data Model Highlights

- `Scenario` → `ScenarioRole[]` (the personas students email) + `ScenarioTemplate[]` (email templates, ordered by `sendOrder`) + `ScenarioFile[]` (reference docs).
- `ScenarioTemplate.kind`: `PRELOADED` (auto-sent when session starts) or `FOLLOW_UP` (psychologist sends manually during session).
- `SessionMessage` — all emails in a live session; soft-deleted via `deletedByStudentAt` / `deletedByStaffAt`.
- `Draft` — one draft per (session, authorType, authorId) combination.
- `AppSession` — auth sessions (distinct from exam `Session`).

### Storage

`src/lib/storage/index.ts` — dual-mode file storage:
- `STORAGE_MODE=local`: writes to `STORAGE_LOCAL_DIR` on disk, served via `/api/attachments/[attachmentId]` and `/api/scenario-files/[fileId]`.
- `STORAGE_MODE=s3`: uses AWS SDK v3 with any S3-compatible endpoint.

### UI Patterns

- RTL/LTR mixed content is supported via `TextDirection` enum (`AUTO | LTR | RTL`) and `detectTextDirection()` utility.
- `<LiveRefresh>` component polls for updates on student and psychologist pages.
- Only one mail panel open at a time: list, read view, or compose.
- `src/components/shared/` — reusable primitives (`ActionForm`, `CountdownBadge`, `DirectionTextareaField`, etc.).
- Institutional branding: use `public/WIS_logo.png`, clean white surfaces, soft blue accents, academic tone.

## Railway Deployment

See `CODEX_EDITING_AND_DEPLOYING_NOTES.md` for the full Railway workflow including login quirks, timing behavior, and log commands. Key points:

- Deploy: `railway up --service <service-name> --detach -m "note"`
- Always verify auth first: `railway whoami --json`
- Build can take 2–3 minutes end to end after `railway up`
- Use explicit deployment IDs when checking logs for a fresh rollout
- `npm start` runs `prisma db push` automatically before starting the server

## Product Rules to Preserve

- Students do not start their own test; psychologists start it for them.
- Exams use one shared 4-digit code; students self-register, admins don't add them one by one.
- Staff URLs are shared from the admin area, not listed on the public page.
- Preloaded scenario emails must remain drag-reorderable (ordered by `sendOrder`).
- Session expiry is lazy — `expireDueSessions()` is called at the start of most student actions.

## Current Development Context

- The app is fully deployed and functional on Railway
- A Prisma seed script exists and is used to populate demo data
- **Seed is gated by `SEED_ON_BOOT`** — `npm start` still calls `prisma db seed`, but the seed exits immediately unless `SEED_ON_BOOT=true` (Phase G). Default behaviour on Railway is therefore: no demo data is re-applied on boot.
- The system is in QA phase: testing admin/psychologist/student flows and gathering UX feedback
- Active branch: `feature/post-exam-review`

### Data safety on Railway

- **Attachments**: with `STORAGE_MODE=local` (default), uploaded files live on Railway's ephemeral disk and are lost on every redeploy. Set `STORAGE_MODE=s3` (and the matching `STORAGE_*` vars) — or attach a Railway Volume — before any cycle that handles real candidate data.
- **Seed is gated**: `npm start` calls `prisma db seed`, but the seed exits immediately unless `SEED_ON_BOOT=true` (Phase G). Leave that env var unset (or set to `"false"`) on Railway production; set it to `"true"` only when bootstrapping a fresh database.
- **DB backup**: use Railway's Postgres snapshot UI, or run an ad-hoc dump:
  `railway run --service <db-service> -- pg_dump $DATABASE_URL --no-owner --no-acl > backup.sql`

### Production recovery — 2026-05-13

- Production Railway DB cleanup + reseed completed successfully. Stale QA/demo data created before `schoolAnswer` was implemented has been wiped; the database was reseeded against the current schema and JSON.
- All 17 `ScenarioTemplate` rows on production now contain populated `schoolAnswer` values (verified post-reseed).
- App re-tested afterward across admin / psychologist / student flows — current Railway production state is considered stable.
- `SEED_ON_BOOT` must remain **unset** (or `"false"`) on the Railway service. Only flip it to `"true"` for an intentional one-shot reseed, and prefer an inline override (e.g. `railway ssh -- "SEED_ON_BOOT=true npx prisma db seed"`) so it never persists on the service.
- Active branch remains `feature/post-exam-review`.

### Post-exam review — phased implementation status

#### Completed

| Phase | Description | Key files changed |
|---|---|---|
| A | Merged `evaluationCriteria` + `evaluationCriteriaDirection` into single `schoolAnswer` + `schoolAnswerDirection` field on `ScenarioTemplate` | `prisma/schema.prisma`, `src/lib/validation/domain.ts`, `src/lib/actions/admin.ts`, `src/components/admin/scenario-template-library-list.tsx`, `prisma/seed.ts`, `prisma/scenario-ron-lab.json` |
| B | School answer shown in consolidated report; full template inline editing (all fields); seed populated with demo school answers for all 17 templates | `src/app/review/[sessionId]/report/page.tsx`, `src/lib/actions/admin.ts`, admin scenario page |
| B+ | Report TOC: thread classification (Preloaded / Follow-up / Psych-initiated / Candidate-initiated), status badges (Unanswered / Answered / Answered · Extended / Addressed / Unaddressed), last sender column, anchor links, per-thread message counts; candidate reply visual distinction (green highlight); unanswered template threads filtered from full sections | `src/app/review/[sessionId]/report/page.tsx` |
| — | Student login redirect fix: redirects now preserve the actual request origin (LAN IP or Railway host) instead of hardcoded `APP_BASE_URL` | `src/app/student/login/submit/route.ts` |
| — | Logout redirect now correctly sends staff to `/staff/login` and students to `/student/login` | `src/lib/actions/auth.ts` |
| — | Report itemLabel fix: psychologist-initiated threads now correctly labelled "Psychologist-initiated thread" instead of "Candidate-initiated thread" | `src/app/review/[sessionId]/report/page.tsx` |
| — | **Compose/reply UX stabilization** — form clears and closes after successful send; `useActionState` success effect dependency fixed (`state` object ref instead of `state.success` string, so re-firing works on repeat sends); `submitTypeRef` tracks compose vs reply so student replies stay in read view while new-compose returns to list; psychologist replies stay in thread after send; `window.confirm()` before all sends (student compose + reply: "Send this email?" / "Send this reply?"; psychologist compose + reply: same); reply body cleared when switching threads; reply form scrolls into view on open; email card height no longer forced (content-sized); long email content wraps via `overflow-wrap: break-word`; `minWidth: 0` + `overflowX: auto` on article cards prevent wide emails from stretching sibling elements | `src/components/student/student-workspace.tsx`, `src/components/psychologist/psychologist-workspace.tsx` |
| C | **School answer on psychologist live desk + completed review** — `SchoolAnswerPanel` renders alongside template-originated threads during active sessions (two-column layout) and in the completed review page; populated from `ScenarioTemplate.schoolAnswer` with RTL/LTR direction support | `src/components/psychologist/psychologist-workspace.tsx`, `src/components/psychologist/review-workspace.tsx`, `src/app/review/[sessionId]/page.tsx` |
| D | **Candidate action order / timeline** — new Timeline tab on both live desk and completed review showing all session activity sorted by `sentAt` with per-thread message index (`#1`, `#2`, …), entry-type pills (Candidate-initiated / Candidate reply / Follow-up / Psych-initiated / Psych reply), relative time from session start, and HH:mm:ss absolute time; consolidated report has a matching Timeline section and labels candidate replies "Candidate reply #N" | `src/components/psychologist/psychologist-workspace.tsx`, `src/components/psychologist/review-workspace.tsx`, `src/app/review/[sessionId]/report/page.tsx` |
| — | **Post-Phase-C/D stabilization pass** — Compose button works from the psychologist Timeline tab (returns to inbox before opening composer); instructions modal rendered via portal so backdrop-filter clipping doesn't push content off-screen on small viewports; Timeline excludes PRELOADED scenario emails from rows while still counting them toward per-thread numbering (so the first candidate reply to a preloaded thread is still `#2`); Timeline columns use compact HH:mm:ss display with horizontal scroll on narrow screens; outer dashboard sidebar is collapsible with `localStorage` persistence and inner sidebars trimmed modestly | `src/components/psychologist/psychologist-workspace.tsx`, `src/components/psychologist/review-workspace.tsx`, `src/components/shared/dashboard-sidebar.tsx`, `src/components/shared/dashboard-shell.tsx`, `src/app/globals.css` |
| G | **Seed guard** — `prisma/seed.ts` exits immediately unless `SEED_ON_BOOT=true`; documented in `.env.example`. Default behaviour is therefore "do nothing", which makes `npm start` safe to call on a production database with real candidate data | `prisma/seed.ts`, `.env.example` |
| E | **File audit trail** — nullable `uploadedByType` + `uploadedById` on `SessionAttachment` and `uploadedByUserId` (+ `User` relation) on `ScenarioFile`; populated in every upload path (student=STUDENT/cycleStudentId, psychologist compose/reply=STAFF/userId, preloaded + follow-up template propagation=SYSTEM/null, admin scenario file=actor.userId); consolidated review report renders an "Uploaded by Candidate / Psychologist / Scenario system" line under each attachment. Pre-existing rows show no uploader line (acceptable historical gap) | `prisma/schema.prisma`, `src/lib/actions/student.ts`, `src/lib/actions/psychologist.ts`, `src/lib/actions/admin.ts`, `src/app/review/[sessionId]/report/page.tsx` |
| F | **No-hard-delete audit** — verify no code path physically removes messages, attachments, or scenario files after a session ends; replace any hard-delete with soft-delete | Audit only for now |
| H | **Admin data export** — `/admin/export` page: JSON session transcript download + CSV attachment manifest; both in-process (no shell tools required) | `src/app/admin/export/page.tsx`, `src/lib/actions/admin.ts` |

### Development Priorities

1. **Phase F** — No-hard-delete audit.
2. **Phase H** — Admin data export.


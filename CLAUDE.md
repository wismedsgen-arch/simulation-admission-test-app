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
- Seeding currently runs on startup for demo purposes
- The system is in QA phase:
  - Testing flows for admin, psychologist, and student roles
  - Identifying bugs, validation issues, and UX improvements

### Known Issues Being Investigated

- Scenario creation fails with generic error: "Please complete all scenario fields"
- Likely related to mismatch between Zod validation and Prisma schema (e.g. psychologistInstructions optional in DB but required in validation)

### Development Priorities

1. Fix validation bugs and improve error messaging
2. Ensure seed script is safe for repeated deployments
3. Improve UX for admin and scenario creation flows


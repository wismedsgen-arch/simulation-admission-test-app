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
- `main` currently contains the latest stable merged state, including Phase E/F/F.5/H work.
- New work should generally branch from `main` into small issue-focused feature/fix branches.
- Prefer one issue/change per branch and merge frequently after testing.
- Keep active feature branches backed up on GitHub regularly; avoid leaving important work only local.
- Railway production deploys from `main`.

### Data safety on Railway

- **Attachments**: with `STORAGE_MODE=local` (default), uploaded files live on Railway's ephemeral disk and are lost on every redeploy. Set `STORAGE_MODE=s3` (and the matching `STORAGE_*` vars) — or attach a Railway Volume — before any cycle that handles real candidate data.
- **Seed is gated**: `npm start` calls `prisma db seed`, but the seed exits immediately unless `SEED_ON_BOOT=true` (Phase G). Leave that env var unset (or set to `"false"`) on Railway production; set it to `"true"` only when bootstrapping a fresh database.
- **DB backup**: use Railway's Postgres snapshot UI, or run an ad-hoc dump:
  `railway run --service <db-service> -- pg_dump $DATABASE_URL --no-owner --no-acl > backup.sql`

### QA reset script (`scripts/reset-qa-data.ts`)

For "we're done testing, prepare for the real event" only. Never during a live exam.

- Dry-run by default. Prints pre-reset counts, the preserve set, the storage size that would be deleted, and any conditions that would block `--execute`.
- Refuses to execute unless **all** of: `ALLOW_QA_RESET=true`, matching `--confirm "..."` phrase (printed by the dry-run, includes DB host + minute timestamp), `--execute` flag, no `ExamCycle.status === LIVE`, and `--i-understand-production` for non-localhost hosts.
- Default preserved users: any user whose normalized `fullName` matches `BOOTSTRAP_ADMIN_NAME` (env), falling back to "Einan Farhi". Extend with `--preserve-user-id <id>`, `--preserve-name "<name>"`, or `--keep-approved-staff`. Use `--no-default-preserve` or `--allow-empty-preserve` for total wipes (refused otherwise).
- Scenario content (Scenario / Role / Template / File / TemplateAttachment) is **preserved by default**. Pass `--wipe-scenarios` to remove it (plus its storage).
- Storage files are gathered before the DB transaction and deleted after commit, best-effort.
- Will refuse if scenarios are kept but their `createdBy` user is not preserved (`Scenario.createdById` is `Restrict`).
- Does **not** reseed afterwards. Run `SEED_ON_BOOT=true npx prisma db seed` separately if needed.
- Not referenced from `npm start` / any boot path / app code.

Common invocations:
```bash
# Dry-run locally
ALLOW_QA_RESET=true npx tsx scripts/reset-qa-data.ts

# Execute locally (paste the phrase the dry-run printed)
ALLOW_QA_RESET=true npx tsx scripts/reset-qa-data.ts \
  --confirm "RESET QA DATA FOR localhost AT 2026-05-13T14:22Z" --execute

# Wipe scenarios too
... --execute --wipe-scenarios

# Against Railway (run via railway ssh so ALLOW_QA_RESET stays in that shell)
railway ssh -- "ALLOW_QA_RESET=true npx tsx scripts/reset-qa-data.ts \
  --confirm 'RESET QA DATA FOR <db-host> AT <timestamp>' \
  --execute --i-understand-production"
```

### Restore from export (`scripts/restore-export.ts`)

Inverse of the H1/H2 export bundle. Reads a `.zip` produced by
`/api/admin/export` and rebuilds the database + storage from it.

- Dry-run by default. Verifies bundle sha256 sums, schema fingerprint, target DB row-id conflicts, target storage key conflicts, and live exam cycles. Prints what `--execute` would do.
- Refuses `--execute` unless **all** of: `ALLOW_RESTORE=true`, matching `--confirm "<phrase>"` (basename + DB host + minute timestamp printed by the dry-run), `--execute`, no `ExamCycle.status === LIVE` in the target, no row-id conflicts in the target, and `--i-understand-production` for non-localhost hosts.
- **Greenfield-only.** No merge mode. If row ids overlap, run `scripts/reset-qa-data.ts` first.
- **CYCLE-scope bundles are refused by default.** They have `User.passwordHash` redacted; restoring one leaves the DB with no working logins. Override with `--allow-cycle-scope-restore` if you accept that and plan to reset passwords afterwards.
- Schema fingerprint must match the current `prisma/schema.prisma`. Override: `--accept-schema-mismatch` after you've verified the change is restore-compatible (e.g. only added a nullable column).
- Insert order is FK-dependency. `SessionMessage` is two-pass because of the `replyToId` self-FK. Chunks at 500 rows per `createMany` to stay under Postgres's 65535-parameter cap. Transaction timeout defaults to 5 min and is configurable via `--db-timeout-ms`.
- Storage uploads run **outside** the DB transaction, best-effort. If a blob fails to upload after the DB commit succeeds, the inserted DB row dangles (mirrors the same state a `status: missing` manifest entry would produce). Failures are reported in the final summary.
- Does **not** reseed and does **not** restore `AppSession` — everyone signs in again after a restore. `User.passwordHash` rows are preserved for FULL bundles, so existing credentials still work.
- **Real-cycle restores (~200 candidates) should be rehearsed against `localhost` or a staging DB before you run them against production.** Pre-flight conflict detection scales with row count; a full cycle bundle takes seconds to dry-run but minutes to commit. Use `--db-timeout-ms` to give long restores more headroom.

Common invocations:
```bash
# Dry-run locally
ALLOW_RESTORE=true npx tsx scripts/restore-export.ts --bundle ./backup.zip

# Execute locally (paste the phrase the dry-run printed)
ALLOW_RESTORE=true npx tsx scripts/restore-export.ts \
  --bundle ./backup.zip \
  --confirm "RESTORE FROM backup.zip INTO localhost AT 2026-05-14T12:30Z" \
  --execute

# Against Railway (run via railway ssh so ALLOW_RESTORE stays in that shell)
railway ssh -- "ALLOW_RESTORE=true npx tsx scripts/restore-export.ts \
  --bundle ./backup.zip \
  --confirm 'RESTORE FROM backup.zip INTO <db-host> AT <timestamp>' \
  --execute --i-understand-production"
```

### Local hard-reset (schema drop)

If you need a true factory reset of the local dev DB (drops every table, recreates schema from `prisma/schema.prisma`), use Prisma's built-in commands — no custom script:
```bash
npx prisma migrate reset --skip-seed           # drop + recreate schema, no seed
SEED_ON_BOOT=true npx prisma migrate reset     # drop + recreate + run seed
rm -rf ./.uploads/*                            # also clear local storage
```
Intentionally **not** wrapped in an npm script — too easy to fire by accident.

### Production recovery — 2026-05-13

- Production Railway DB cleanup + reseed completed successfully. Stale QA/demo data created before `schoolAnswer` was implemented has been wiped; the database was reseeded against the current schema and JSON.
- All 17 `ScenarioTemplate` rows on production now contain populated `schoolAnswer` values (verified post-reseed).
- App re-tested afterward across admin / psychologist / student flows — current Railway production state is considered stable.
- `SEED_ON_BOOT` must remain **unset** (or `"false"`) on the Railway service. Only flip it to `"true"` for an intentional one-shot reseed, and prefer an inline override (e.g. `railway ssh -- "SEED_ON_BOOT=true npx prisma db seed"`) so it never persists on the service.
- Active development line is now `feature/phase-f5-qa-reset`, stacked on `feature/phase-f-deletion-audit` — both awaiting testing/merge into `main`. Future work continues from `feature/phase-f5-qa-reset` (or a new branch based on it).

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
| F | **Deletion-safety audit & guards** — student/psychologist mailbox already soft-delete-only (no change needed). Admin destructive paths hardened: `deleteExamCycleAction` blocks when status is `LIVE` or any `Session` rows exist (prevents one-click wipe of candidate evidence); `deleteScenarioTemplateAction` blocks when any `SessionMessage.templateId` references it (preserves report school-answer linkage); `deleteScenarioRoleAction` blocks when role is referenced by templates / messagesSent / drafts; `deleteScenarioAction` and the user-delete guard were already correct. Storage cleanup added: new `deleteFile(storageKey)` in `src/lib/storage/index.ts` (handles local + S3, swallows ENOENT/NoSuchKey); called from `deleteScenarioFileAction`, `deleteScenarioTemplateAttachmentAction`, `deleteScenarioTemplateAction` (for the template's own attachments), and `deleteScenarioAction` (for all child scenario files + template attachments fetched before the cascade). No archive UX added — admins simply get a clear "cannot be deleted safely" message in the existing error panels | `src/lib/storage/index.ts`, `src/lib/actions/admin.ts` |
| F.5 | **QA reset script** — `scripts/reset-qa-data.ts` (TypeScript, runs via tsx). Dry-run by default; refuses `--execute` unless `ALLOW_QA_RESET=true`, matching `--confirm` phrase (DB host + minute timestamp), no live `ExamCycle`, and `--i-understand-production` for non-localhost hosts. Preserve set defaults to `BOOTSTRAP_ADMIN_NAME` env → "Einan Farhi" fallback, extendable via `--preserve-user-id` / `--preserve-name` / `--keep-approved-staff`. Authored scenarios preserved unless `--wipe-scenarios`. Pre-flight check refuses when keeping a scenario whose `createdById` user is not preserved. Storage files gathered before the Prisma `$transaction`, deleted after commit, best-effort. Documented in CLAUDE.md "Data safety on Railway". `.gitignore` adjusted to un-ignore this single file (vs. the catch-all `scripts/` ignore for one-offs). Local hard-reset documented separately as `prisma migrate reset --skip-seed` — no convenience wrapper | `scripts/reset-qa-data.ts`, `.gitignore`, `CLAUDE.md` |
| H1 | **Export bundle builder** — pure modules, no UI. `computeCycleClosure(cycleId)` returns the row-id set for a per-cycle export (scenario + roles + templates + scenario files, cycle students + sessions + messages + attachments + drafts, every referenced user, plus a conservative slice of `AuditLog` matched by `entityId` / `cycleStudentId` / `userId`). `buildExport({ scope, exportedByUserId })` produces an in-memory `ExportBundle`: one JSON file per Prisma table (flat rows, deterministic order), every referenced blob mirrored under `storage/<storageKey>`, an `attachments.csv` operational summary, `README.txt`, and `manifest.json` with sha256 sums. `AppSession` is never exported. `User.passwordHash` is preserved for FULL (required for restore) and replaced with `"REDACTED"` for CYCLE (avoid leaking credentials when sharing). Storage fetches are best-effort: per-blob failures land in the manifest as `status: "missing"` rather than aborting. All sessions are included regardless of status — backups taken during an active exam capture in-progress session state and drafts | `src/lib/export/cycle-closure.ts`, `src/lib/export/build-export.ts` |
| H2 | **Admin export download (FULL)** — adds the user-visible path on top of H1. `jszip` dependency; `/admin/export` page with counts (cycles, sessions, active-right-now, messages, attachments, drafts), what-is-included / what-is-excluded / sensitivity panels, and "Download full backup (.zip)" link; `/api/admin/export` route handler (admin-gated, accepts `?scope=full` or `?scope=cycle&cycleId=...`, calls `buildExport()`, packs into a JSZip archive). In-memory zip per direction — not streamed. `AdminShell` gains an "Export" nav item. CYCLE scope is wired through the route already; per-cycle picker UI lands in H3 | `package.json`, `src/app/admin/export/page.tsx`, `src/app/api/admin/export/route.ts`, `src/components/admin/admin-shell.tsx` |
| H4 | **Restore script** — `scripts/restore-export.ts` (TypeScript, runs via tsx). Inverse of `build-export.ts`: reads an export bundle `.zip`, verifies sha256 of every manifest file, matches schema fingerprint, then rebuilds the DB and storage. Dry-run by default; refuses `--execute` unless `ALLOW_RESTORE=true`, matching `--confirm` phrase (basename + DB host + minute timestamp), no live `ExamCycle`, no row-id overlaps with the bundle (greenfield-only — no merge mode), and `--i-understand-production` for non-localhost hosts. CYCLE-scope bundles refused unless `--allow-cycle-scope-restore` (auth broken — passwordHash redacted). Storage-key conflicts refused unless `--allow-storage-overwrite`. Insert order is FK-dependency; chunked at 500 rows per `createMany`. `SessionMessage` is two-pass for the `replyToId` self-FK (insert with `null`, then per-row update). Storage uploads run OUTSIDE the DB transaction, best-effort, deduped by storageKey. Transaction timeout defaults to 5 min and is configurable via `--db-timeout-ms`. DateTime fields revived from ISO strings via an explicit `DATE_FIELDS_BY_TABLE` map. Also adds `saveFileAtKey()` and `fileExistsAtKey()` to `src/lib/storage/index.ts`. Documented in CLAUDE.md "Restore from export" with the staging-first note for ~200-candidate cycles | `scripts/restore-export.ts`, `src/lib/storage/index.ts`, `.gitignore`, `CLAUDE.md` |

### Development Priorities

1. **Phase H3 (optional)** — Per-cycle export picker UI on `/admin/export`. The route handler already accepts `?scope=cycle&cycleId=...` and the builder redacts `passwordHash` for CYCLE scope; only the picker is missing. Low priority — FULL backups already cover backup/recovery; CYCLE is only needed if exports start being shared with reviewers outside the admin team.


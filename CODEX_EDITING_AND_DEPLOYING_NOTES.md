# Codex Editing And Deploying Notes

This file is for future maintenance passes on the Weizmann Mail app.

Sanitized copy note: all Railway service names, deployment IDs, URLs, and
environment values in this file are fillers. Replace them with real values only
in a private working copy or deployment environment.

## Local workflow

1. Work from the project root.
2. After UI or server changes, run:
   `DATABASE_URL='postgresql://filler_user:filler_password@127.0.0.1:5432/filler_database' SESSION_SECRET='filler-session-secret' APP_BASE_URL='http://localhost:3000' npm run build`
3. If the Prisma schema changes, run:
   `XDG_CACHE_HOME="$PWD/.cache" npx prisma generate`
4. If you touch an app-router file with brackets in its path, quote it in shell commands:
   `sed -n '1,220p' 'src/app/admin/exam-cycles/[cycleId]/page.tsx'`

## Railway deploy workflow

1. Confirm the project is linked:
   `railway status --json`
2. Deploy the current workspace:
   `railway up --service filler-app-service --detach -m "short release note"`
3. Check status:
   `railway deployment list --service filler-app-service --limit 5 --json`
   `railway service status --all --json`
4. Check logs when needed:
   `railway logs --service filler-app-service --build --lines 200 --json`
   `railway logs --service filler-app-service --lines 200 --json`
5. For the exact newest deployment, prefer targeting the deployment ID directly:
   `railway logs --build <DEPLOYMENT_ID> --lines 260 --json`
   `railway logs <DEPLOYMENT_ID> --lines 120 --json`

## Railway login workflow

1. First verify auth before touching deploy commands:
   `railway whoami --json`
2. If Railway says `Unauthorized`, do a fresh login immediately:
   `railway login`
3. In Codex, answer `n` to the browser prompt and use the manual activation code from `https://railway.com/activate`.
4. Do not assume the login worked just because the user says they completed activation.
   Always verify again with:
   `railway whoami --json`
5. If the waiting login process ends with:
   `OAuth error: invalid_grant: grant request is invalid`
   then that login attempt failed. Generate a brand-new code and try again.
6. In this environment, `railway login` may need escalated execution because sandboxed network resolution can fail against Railway auth endpoints.
7. Practical rule: never start `railway up` after a fresh login until `railway whoami --json` succeeds.
8. Important observed difference:
   - browserless / device-code login from Codex repeatedly failed here with `OAuth error: invalid_grant: grant request is invalid`
   - normal browser login run by the user in their own terminal succeeded immediately and refreshed the local Railway CLI config
   - after the user logs in locally, prefer verifying from Codex with escalated `railway whoami --json`; the sandboxed check can still report stale auth
   - if auth is stuck, prefer asking the user to run `railway login` in their own terminal with the browser flow, then verify from Codex with `railway whoami --json`

## Railway timing and rollout behavior

- A successful deploy here can still take about 2 to 3 minutes end to end after `railway up`.
- In the latest clean deploy, the timeline was roughly:
  - upload accepted at `06:19:08 UTC`
  - build finished around `06:20:19 UTC`
  - container became ready at `06:21:39 UTC`
- Practical rule: after a fresh deploy starts, do not spam-check every few seconds. Wait in `20s` to `30s` chunks unless logs show a real failure.
- Railway may report the service as `BUILDING` even after the build stage is complete. The remaining delay can be image import, container start, or promotion.
- Runtime logs for the newest deployment may be empty until Railway actually starts the container. That is not automatically a failure.
- `railway logs --service ... --build --lines ...` can return logs from the most recent successful deployment instead of the newest in-progress one. When debugging a fresh rollout, use the explicit deployment ID from `railway deployment list`.
- Railway login can fail even after the user entered a code if the CLI returns `invalid_grant`. Treat that as a hard failure and restart the login flow with a new code.
- Best verification order after deploy:
  1. `railway deployment list --service filler-app-service --limit 5 --json`
  2. get the newest deployment ID
  3. `railway logs --build <DEPLOYMENT_ID> --lines 260 --json`
  4. wait until build completes
  5. `railway logs <DEPLOYMENT_ID> --lines 120 --json`
  6. `railway service status --all --json`
  7. `curl -s https://filler-production-url.example.com ...` to confirm the live HTML changed
- If the live site is still old while Railway says `BUILDING`, the safest move is usually to wait longer first, not immediately redeploy again.

## Infra reminders

- App service: `filler-app-service`
- Postgres service: `filler-postgres-service`
- Public URL: `https://filler-production-url.example.com`
- Bucket storage is already wired through environment variables.
- Current bucket region is `filler-bucket-region`. That mostly affects attachment upload/download latency, not core app page speed.
- Railway can briefly keep a deployment in `BUILDING` even after build logs finish; verify with the live URL and service logs.
- The live app is served through a European edge, so page delivery to Israel/Europe is still fine even with the current bucket region.

## Current product rules to preserve

- Public home page is student-only.
- Staff URLs are shared from the admin area, not from the public page.
- Exams generate one shared 4-digit code.
- Students create their own waiting entry when they sign in to an active exam.
- Admins do not manually add students one by one.
- Preloaded scenario emails are visually ordered and should stay drag-reorderable.

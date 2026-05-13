import { UserRole } from "@prisma/client";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function AdminExportPage() {
  await requireStaff(UserRole.ADMIN);

  const [
    cycleCount,
    sessionCount,
    activeSessionCount,
    messageCount,
    attachmentCount,
    draftCount
  ] = await Promise.all([
    prisma.examCycle.count(),
    prisma.session.count(),
    prisma.session.count({ where: { status: "ACTIVE" } }),
    prisma.sessionMessage.count(),
    prisma.sessionAttachment.count(),
    prisma.draft.count()
  ]);

  return (
    <AdminShell
      active="export"
      title="Export & backup"
      subtitle="Download a full database + attachments snapshot for backup and recovery."
    >
      <div className="stack-lg">
        <div className="metric-grid">
          <div className="panel metric-card">
            <span className="muted">Exam cycles</span>
            <strong>{cycleCount}</strong>
          </div>
          <div className="panel metric-card">
            <span className="muted">Sessions</span>
            <strong>{sessionCount}</strong>
          </div>
          <div className="panel metric-card">
            <span className="muted">Active right now</span>
            <strong>{activeSessionCount}</strong>
          </div>
          <div className="panel metric-card">
            <span className="muted">Messages</span>
            <strong>{messageCount}</strong>
          </div>
          <div className="panel metric-card">
            <span className="muted">Attachments</span>
            <strong>{attachmentCount}</strong>
          </div>
          <div className="panel metric-card">
            <span className="muted">Drafts</span>
            <strong>{draftCount}</strong>
          </div>
        </div>

        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Full backup</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Downloads a ZIP containing every database row and every
                uploaded file. Use this for backup before deploys, before
                destructive admin actions, or to keep a snapshot of a
                completed exam cycle.
              </p>
            </div>

            <div className="panel" style={{ padding: 16 }}>
              <div className="stack-sm">
                <strong>What gets included</strong>
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>
                    Every <code>Session</code> regardless of status — including{" "}
                    <strong>active exams in progress</strong>, their messages,
                    attachments, and drafts. Restoring the bundle resumes them
                    in their current state.
                  </li>
                  <li>
                    Scenario definitions, roles, templates, template
                    attachments, and scenario files.
                  </li>
                  <li>
                    User accounts (with hashed passwords) and staff signup
                    requests.
                  </li>
                  <li>Audit logs.</li>
                  <li>
                    A <code>manifest.json</code> with sha256 sums for every
                    file, an <code>attachments.csv</code> summary, and a
                    plaintext README.
                  </li>
                </ul>
              </div>
            </div>

            <div className="panel" style={{ padding: 16 }}>
              <div className="stack-sm">
                <strong>What is excluded</strong>
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>
                    Auth-cookie sessions (<code>AppSession</code>). After a
                    restore everyone signs in again; their exam state is
                    intact.
                  </li>
                </ul>
              </div>
            </div>

            <div
              className="panel"
              style={{ padding: 16, borderColor: "#f59e0b" }}
            >
              <div className="stack-sm">
                <strong>Sensitivity</strong>
                <p className="muted" style={{ margin: 0 }}>
                  The bundle contains candidate PII (full names, government
                  IDs, exam answers, uploaded files). Treat it as
                  confidential. Do not email or upload to third-party
                  services.
                </p>
              </div>
            </div>

            <div className="stack-sm">
              <a
                className="btn"
                href="/api/admin/export?scope=full"
                download
                style={{ alignSelf: "flex-start" }}
              >
                Download full backup (.zip)
              </a>
              <p className="muted" style={{ margin: 0 }}>
                Large exports can take a minute. The download starts once
                the bundle is built; keep this tab open until it does.
              </p>
            </div>
          </div>
        </section>

        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Per-cycle export</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Coming next: download a single completed exam cycle for
                review or archival. User passwords are redacted in
                per-cycle exports.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

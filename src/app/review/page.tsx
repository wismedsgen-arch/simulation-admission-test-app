import Link from "next/link";
import { UserRole } from "@prisma/client";

import { AdminShell } from "@/components/admin/admin-shell";
import { PsychologistShell } from "@/components/psychologist/psychologist-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { expireDueSessions } from "@/lib/db/session-state";
import { formatDateTime } from "@/lib/utils";

export default async function ReviewListPage() {
  const actor = await requireStaff();
  await expireDueSessions();
  const isAdmin = actor.role === UserRole.ADMIN;

  const sessions = await prisma.session.findMany({
    where: {
      status: {
        in: ["COMPLETED", "FORCED_ENDED", "EXPIRED"]
      },
      ...(isAdmin ? {} : { assignedPsychologistId: actor.userId })
    },
    include: {
      cycleStudent: true,
      scenario: true
    },
    orderBy: { endedAt: "desc" }
  });

  const subtitle = isAdmin
    ? "Open immutable completed timelines, attachments, and per-candidate consolidated reports."
    : "Open immutable completed timelines and consolidated reports for the sessions you ran.";

  const content = (
    <section className="panel" style={{ padding: 22 }}>
      {sessions.length === 0 ? (
        <div className="muted">No completed sessions yet.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Scenario</th>
              <th>Status</th>
              <th>Ended</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>
                  <Link href={`/review/${session.id}`} style={{ color: "#1a73e8", fontWeight: 700 }}>
                    {session.cycleStudent.fullName}
                  </Link>
                </td>
                <td>{session.scenario.name}</td>
                <td>{session.status}</td>
                <td>{formatDateTime(session.endedAt)}</td>
                <td>
                  <Link href={`/review/${session.id}/report`} className="btn btn-secondary">
                    Report
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  if (isAdmin) {
    return (
      <AdminShell active="overview" title="Completed session review" subtitle={subtitle}>
        {content}
      </AdminShell>
    );
  }

  return (
    <PsychologistShell active="review" title="Completed review" subtitle={subtitle}>
      {content}
    </PsychologistShell>
  );
}

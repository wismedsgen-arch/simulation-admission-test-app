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

  const sessions = await prisma.session.findMany({
    where: {
      status: {
        in: ["COMPLETED", "FORCED_ENDED", "EXPIRED"]
      }
    },
    include: {
      cycleStudent: true,
      scenario: true
    },
    orderBy: { endedAt: "desc" }
  });

  const content = (
    <section className="panel" style={{ padding: 22 }}>
      <table className="table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Scenario</th>
            <th>Status</th>
            <th>Ended</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  if (actor.role === UserRole.ADMIN) {
    return (
      <AdminShell active="overview" title="Completed session review" subtitle="Open immutable completed timelines, attachments, and timestamps.">
        {content}
      </AdminShell>
    );
  }

  return (
    <PsychologistShell
      active="review"
      title="Completed review"
      subtitle="Review completed Weizmann Mail timelines, attachments, and timestamps."
    >
      {content}
    </PsychologistShell>
  );
}

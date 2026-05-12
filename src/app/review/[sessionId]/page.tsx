import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { PsychologistShell } from "@/components/psychologist/psychologist-shell";
import { ReviewWorkspace } from "@/components/psychologist/review-workspace";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { expireDueSessions } from "@/lib/db/session-state";
import { formatDateTime } from "@/lib/utils";

export default async function ReviewDetailPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const actor = await requireStaff();
  await expireDueSessions();
  const { sessionId } = await params;
  const isAdmin = actor.role === UserRole.ADMIN;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      cycleStudent: true,
      scenario: {
        include: {
          roles: true,
          files: true,
          templates: {
            select: { id: true, schoolAnswer: true, schoolAnswerDirection: true }
          }
        }
      },
      messages: {
        include: {
          attachments: true
        },
        orderBy: { sentAt: "asc" }
      }
    }
  });

  if (!session) {
    notFound();
  }

  if (!isAdmin && session.assignedPsychologistId !== actor.userId) {
    notFound();
  }

  const content = (
    <div className="stack-lg">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Link href={`/review/${session.id}/report`} className="btn btn-primary">
          View consolidated report
        </Link>
      </div>
      <div className="metric-grid">
        <div className="panel metric-card">
          <span className="muted">Messages</span>
          <strong>{session.messages.length}</strong>
        </div>
        <div className="panel metric-card">
          <span className="muted">Started</span>
          <strong style={{ fontSize: "1rem" }}>{formatDateTime(session.startedAt)}</strong>
        </div>
        <div className="panel metric-card">
          <span className="muted">Ended</span>
          <strong style={{ fontSize: "1rem" }}>{formatDateTime(session.endedAt)}</strong>
        </div>
        <div className="panel metric-card">
          <span className="muted">Status</span>
          <strong style={{ fontSize: "1.15rem" }}>{session.status}</strong>
        </div>
      </div>

      <ReviewWorkspace
        studentName={session.cycleStudent.fullName}
        sessionStatus={session.status}
        startedAt={session.startedAt?.toISOString() ?? null}
        roles={session.scenario.roles.map((role) => ({
          id: role.id,
          name: role.name,
          category: role.category,
          accentColor: role.accentColor,
          description: role.description,
          descriptionDirection: role.descriptionDirection
        }))}
        files={session.scenario.files.map((file) => ({
          id: file.id,
          name: file.name,
          kind: file.kind,
          textContent: file.textContent,
          textDirection: file.textDirection,
          fileName: file.fileName
        }))}
        messages={session.messages.map((message) => ({
          id: message.id,
          senderType: message.senderType,
          senderDisplayName: message.senderDisplayName,
          senderRoleId: message.senderRoleId,
          recipientName: message.recipientName,
          subject: message.subject,
          body: message.body,
          bodyDirection: message.bodyDirection,
          sentAt: message.sentAt.toISOString(),
          replyToId: message.replyToId,
          templateId: message.templateId,
          attachments: message.attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName
          }))
        }))}
        templateSchoolAnswerMap={Object.fromEntries(
          session.scenario.templates
            .filter((t) => t.schoolAnswer)
            .map((t) => [t.id, { schoolAnswer: t.schoolAnswer, schoolAnswerDirection: t.schoolAnswerDirection }])
        )}
      />
    </div>
  );

  if (actor.role === UserRole.ADMIN) {
    return (
      <AdminShell
        active="overview"
        title={`Review · ${session.cycleStudent.fullName}`}
        subtitle={`${session.scenario.name} · ${session.status}`}
      >
        {content}
      </AdminShell>
    );
  }

  return (
    <PsychologistShell
      active="review"
      title={`Review · ${session.cycleStudent.fullName}`}
      subtitle={`${session.scenario.name} · ${session.status}`}
    >
      {content}
    </PsychologistShell>
  );
}

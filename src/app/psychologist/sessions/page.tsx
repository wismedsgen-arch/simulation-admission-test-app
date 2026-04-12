import Link from "next/link";
import { UserRole } from "@prisma/client";

import { PsychologistSessionDesk } from "@/components/psychologist/psychologist-session-desk";
import { PsychologistShell } from "@/components/psychologist/psychologist-shell";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { requireStaff } from "@/lib/auth/session";
import { getPsychologistSessionDesk } from "@/lib/db/psychologist-dashboard";
import { expireDueSessions } from "@/lib/db/session-state";

export default async function PsychologistSessionsPage({
  searchParams
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const actor = await requireStaff();
  await expireDueSessions();

  if (actor.role !== UserRole.PSYCHOLOGIST && actor.role !== UserRole.ADMIN) {
    return null;
  }

  const { session: selectedSessionId } = await searchParams;
  const sessionStudents = await getPsychologistSessionDesk(actor.userId);

  return (
    <PsychologistShell
      active="sessions"
      title="Session desk"
      subtitle="Release instructions, start the test, and manage live Weizmann Mail conversations."
    >
      <LiveRefresh intervalMs={4000} />
      {sessionStudents.length === 0 ? (
        <section className="panel" style={{ padding: 26 }}>
          <div className="stack-md">
            <h2 style={{ margin: 0 }}>Session desk</h2>
            <p className="muted" style={{ margin: 0 }}>
              There are no prepared sessions yet. Go back to the waiting pool, claim students, and prepare the test desk.
            </p>
            <div>
              <Link className="btn btn-primary" href="/psychologist">
                Return to waiting pool
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <PsychologistSessionDesk
          initialSessionId={selectedSessionId}
          students={sessionStudents.map((student) => {
            const usedTemplateIds = new Set(
              student.session?.messages
                .filter((message) => message.senderType === "STAFF" && message.templateId)
                .map((message) => message.templateId as string)
            );

            return {
              id: student.id,
              fullName: student.fullName,
              unresolvedCount: student.session!.messages.filter(
                (message) =>
                  message.senderType === "STUDENT" &&
                  message.requiresResponse &&
                  !message.resolvedAt
              ).length,
              session: {
                id: student.session!.id,
                status: student.session!.status,
                endsAt: student.session!.endsAt?.toISOString() ?? null,
                extensionMinutes: student.session!.extensionMinutes,
                openingTitle: student.examCycle.scenario.openingTitle,
                openingInstructions: student.examCycle.scenario.openingInstructions,
                openingInstructionsDirection: student.examCycle.scenario.openingInstructionsDirection,
                psychologistInstructions: student.examCycle.scenario.psychologistInstructions,
                psychologistInstructionsDirection: student.examCycle.scenario.psychologistInstructionsDirection,
                draft: student.session!.drafts[0]
                  ? {
                      subject: student.session!.drafts[0].subject,
                      body: student.session!.drafts[0].body,
                      recipientRoleId: student.session!.drafts[0].recipientRoleId
                    }
                  : null,
                messages: student.session!.messages.map((message) => ({
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
                  requiresResponse: message.requiresResponse,
                  resolvedAt: message.resolvedAt?.toISOString() ?? null,
                  deletedByStaffAt: message.deletedByStaffAt?.toISOString() ?? null,
                  attachments: message.attachments.map((attachment) => ({
                    id: attachment.id,
                    fileName: attachment.fileName
                  }))
                }))
              },
              roles: student.examCycle.scenario.roles.map((role) => ({
                id: role.id,
                name: role.name,
                category: role.category,
                accentColor: role.accentColor,
                description: role.description,
                descriptionDirection: role.descriptionDirection
              })),
              files: student.examCycle.scenario.files.map((file) => ({
                id: file.id,
                name: file.name,
                kind: file.kind,
                textContent: file.textContent,
                textDirection: file.textDirection,
                fileName: file.fileName
              })),
              templates: student.examCycle.scenario.templates
                .filter((template) => !usedTemplateIds.has(template.id))
                .map((template) => ({
                  id: template.id,
                  subject: template.subject,
                  body: template.body,
                  roleName: template.role.name
                }))
            };
          })}
        />
      )}
    </PsychologistShell>
  );
}

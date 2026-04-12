import { LiveRefresh } from "@/components/shared/live-refresh";
import { StudentWorkspace } from "@/components/student/student-workspace";
import { requireStudent } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { expireDueSessions } from "@/lib/db/session-state";
import { toDomDir, toTextAlign } from "@/lib/utils";

export default async function StudentWorkspacePage() {
  const actor = await requireStudent();
  await expireDueSessions();

  const cycleStudent = await prisma.examCycleStudent.findUnique({
    where: { id: actor.cycleStudentId },
    include: {
      examCycle: {
        include: {
          scenario: {
            include: {
              roles: true,
              files: true
            }
          }
        }
      },
      session: {
        include: {
          scenario: {
            include: {
              roles: true,
              files: true
            }
          },
          messages: {
            include: {
              attachments: true
            },
            orderBy: { sentAt: "desc" }
          },
          drafts: true
        }
      }
    }
  });

  if (!cycleStudent) {
    return null;
  }

  const session = cycleStudent.session;

  if (!session) {
    return (
      <main className="page-shell">
        <LiveRefresh intervalMs={5000} />
        <section className="glass" style={{ borderRadius: 36, padding: 28 }}>
          <div className="stack-md">
            <h1 className="page-title">Please wait</h1>
            <p className="page-subtitle">
              We will start shortly.
            </p>
            <div className="chip">Access code can be reused if you reconnect.</div>
          </div>
        </section>
      </main>
    );
  }

  if (session.status === "READY") {
    return (
      <main className="page-shell" style={{ display: "grid", placeItems: "center" }}>
        <LiveRefresh intervalMs={5000} />
        <section className="glass" style={{ width: "100%", maxWidth: 860, padding: 30, borderRadius: 36 }}>
            <div className="stack-lg">
              <div>
                <h1 className="page-title">{cycleStudent.examCycle.scenario.openingTitle}</h1>
                <p className="page-subtitle">
                  these are the exrise instructionss. Read them carefully. The test will start soon.
                </p>
              </div>
            <div
              className="panel"
              dir={toDomDir(cycleStudent.examCycle.scenario.openingInstructionsDirection)}
              style={{
                padding: 22,
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
                textAlign: toTextAlign(cycleStudent.examCycle.scenario.openingInstructionsDirection)
              }}
            >
              {cycleStudent.examCycle.scenario.openingInstructions}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (session.status === "COMPLETED" || session.status === "FORCED_ENDED" || session.status === "EXPIRED") {
    return (
      <main className="page-shell" style={{ display: "grid", placeItems: "center" }}>
        <section className="glass" style={{ width: "100%", maxWidth: 760, padding: 34, borderRadius: 36 }}>
          <div className="stack-lg" style={{ textAlign: "center" }}>
            <div className="chip" style={{ marginInline: "auto" }}>
              Weizmann Mail
            </div>
            <div>
              <h1 className="page-title">Exercise has ended</h1>
              <p className="page-subtitle">You may close this tab.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <StudentWorkspace
      sessionId={session.id}
      studentName={cycleStudent.fullName}
      scenarioName={cycleStudent.examCycle.scenario.name}
      endsAt={session.endsAt?.toISOString() ?? null}
      extensionMinutes={session.extensionMinutes}
      readOnly={session.status !== "ACTIVE"}
      sessionStatus={session.status}
      openingTitle={cycleStudent.examCycle.scenario.openingTitle}
      openingInstructions={cycleStudent.examCycle.scenario.openingInstructions}
      openingInstructionsDirection={cycleStudent.examCycle.scenario.openingInstructionsDirection}
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
      draft={
        session.drafts[0]
          ? {
              subject: session.drafts[0].subject,
              body: session.drafts[0].body,
              recipientRoleId: session.drafts[0].recipientRoleId
            }
          : null
      }
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
        deletedByStudentAt: message.deletedByStudentAt?.toISOString() ?? null,
        attachments: message.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName
        }))
      }))}
    />
  );
}

import Link from "next/link";
import { UserRole } from "@prisma/client";

import { PsychologistShell } from "@/components/psychologist/psychologist-shell";
import { WaitingPoolTable } from "@/components/psychologist/waiting-pool-table";
import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { LiveRefresh } from "@/components/shared/live-refresh";
import {
  prepareClaimedStudentsAction,
  unclaimStudentAction
} from "@/lib/actions/psychologist";
import { requireStaff } from "@/lib/auth/session";
import {
  getPsychologistClaimedPool,
  getPsychologistWaitingPool,
  getRecentCompletedSessions
} from "@/lib/db/psychologist-dashboard";
import { expireDueSessions } from "@/lib/db/session-state";

export default async function PsychologistPage() {
  const actor = await requireStaff();
  await expireDueSessions();

  if (actor.role !== UserRole.PSYCHOLOGIST && actor.role !== UserRole.ADMIN) {
    return null;
  }

  const [waitingPool, claimedStudents, completedSessions] = await Promise.all([
    getPsychologistWaitingPool(),
    getPsychologistClaimedPool(actor.userId),
    getRecentCompletedSessions()
  ]);

  const preparedStudents = claimedStudents.filter((student) => Boolean(student.session));
  const unpreparedStudents = claimedStudents.filter((student) => !student.session);

  return (
    <PsychologistShell
      active="pool"
      title="Waiting pool"
      subtitle="Claim students for a Weizmann exam, release the instructions, and prepare the shared session desk."
    >
      <LiveRefresh intervalMs={4000} />
      <div className="card-grid" style={{ gridTemplateColumns: "292px minmax(0, 1fr)" }}>
        <aside className="stack-md">
          <section className="panel" style={{ padding: 18 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Claimed students</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Keep this list compact, unclaim if needed, then prepare the full claimed pool in one step.
                </p>
              </div>

              {claimedStudents.length === 0 ? (
                <div className="panel" style={{ padding: 14 }}>
                  No claimed students yet.
                </div>
              ) : (
                <div className="stack-sm">
                  {claimedStudents.map((student) => (
                    <div key={student.id} className="panel" style={{ padding: 12, borderRadius: 18 }}>
                      <div className="stack-sm" style={{ gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <strong style={{ minWidth: 0 }}>{student.fullName}</strong>
                          <span className="chip mono" style={{ minWidth: "fit-content" }}>
                            {student.governmentId}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <span className="muted" style={{ minWidth: 0 }}>
                            {student.examCycle.name}
                          </span>
                          {!student.session ? (
                            <ActionForm action={unclaimStudentAction} className="" hideMessages>
                              <input type="hidden" name="cycleStudentId" value={student.id} />
                              <button type="submit" className="btn btn-secondary" style={{ minHeight: 38, padding: "0 14px" }}>
                                Unclaim
                              </button>
                            </ActionForm>
                          ) : (
                            <Link
                              className="btn btn-secondary"
                              href={`/psychologist/sessions?session=${student.session.id}`}
                              style={{ minHeight: 38, padding: "0 14px" }}
                            >
                              Open
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {claimedStudents.length > 0 ? (
                <div className="stack-sm">
                  <ActionForm action={prepareClaimedStudentsAction} hideMessages>
                    <ActionSubmitButton
                      label={
                        unpreparedStudents.length > 0
                          ? `Release instructions for ${unpreparedStudents.length} student${unpreparedStudents.length === 1 ? "" : "s"}`
                          : "Open session desk"
                      }
                      pendingLabel="Releasing..."
                      className="btn btn-primary"
                    />
                  </ActionForm>
                  {preparedStudents.length > 0 ? (
                    <Link className="btn btn-secondary" href="/psychologist/sessions">
                      Open existing session desk
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel" style={{ padding: 18 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Recent completed sessions</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  All psychologists and admins can review completed runs.
                </p>
              </div>
              <div className="stack-sm">
                {completedSessions.map((session) => (
                  <Link key={session.id} href={`/review/${session.id}`} className="panel" style={{ padding: 14 }}>
                    <strong>{session.cycleStudent.fullName}</strong>
                    <div className="muted">{session.status}</div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </aside>

        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Waiting pool</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Search the full student pool by name or government ID, then claim the students you want to prepare together.
              </p>
            </div>
            <WaitingPoolTable
              students={waitingPool.map((student) => ({
                id: student.id,
                fullName: student.fullName,
                governmentId: student.governmentId,
                examName: student.examCycle.name
              }))}
            />
          </div>
        </section>
      </div>
    </PsychologistShell>
  );
}

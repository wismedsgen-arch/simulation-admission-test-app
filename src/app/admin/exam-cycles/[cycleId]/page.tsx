import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";

import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmDeleteExamDialog } from "@/components/admin/confirm-delete-exam-dialog";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function ExamCycleDetailPage({
  params
}: {
  params: Promise<{ cycleId: string }>;
}) {
  await requireStaff(UserRole.ADMIN);
  const { cycleId } = await params;

  const cycle = await prisma.examCycle.findUnique({
    where: { id: cycleId },
    include: {
      scenario: true,
      students: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!cycle) {
    notFound();
  }

  return (
    <AdminShell
      active="cycles"
      title={cycle.name}
      subtitle={`Scenario: ${cycle.scenario.name}. Share the exam code, monitor student sign-ins, and manage exam-level deletion safely.`}
    >
      <LiveRefresh intervalMs={5000} />
      <div className="card-grid" style={{ gridTemplateColumns: "0.92fr 1.08fr" }}>
        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Exam access</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Students enter this exam with their full name, government ID, and the shared 4-digit exam code.
              </p>
            </div>
            <div className="panel" style={{ padding: 18 }}>
              <div className="stack-md">
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: 18,
                    background: "linear-gradient(135deg, rgba(26,115,232,0.10), rgba(255,255,255,0.98))",
                    border: "1px solid rgba(26,115,232,0.14)"
                  }}
                >
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Exam code
                  </div>
                  <div className="mono" style={{ fontSize: "2.2rem", fontWeight: 800, letterSpacing: "0.2em" }}>
                    {cycle.accessCode}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>Institution</strong>
                  <span>{cycle.institution}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>Scenario</strong>
                  <span>{cycle.scenario.name}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>Students entered</strong>
                  <span>{cycle.students.length} students</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>Status</strong>
                  <span>{cycle.status}</span>
                </div>
              </div>
            </div>

            <div className="divider" />

            <div className="stack-sm">
              <h3 style={{ margin: 0 }}>Danger zone</h3>
              <p className="muted" style={{ margin: 0 }}>
                Deleting an exam removes its sessions, messages, attachments, and student sign-in records.
              </p>
              <ConfirmDeleteExamDialog cycleId={cycle.id} examName={cycle.name} />
            </div>
          </div>
        </section>

        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Student sign-ins</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Students appear here automatically after they enter the exam with the shared code.
              </p>
            </div>
            {cycle.students.length === 0 ? (
              <div className="panel" style={{ padding: 18 }}>
                No students have signed in yet.
              </div>
            ) : null}
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Claimed at</th>
                </tr>
              </thead>
              <tbody>
                {cycle.students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.fullName}</td>
                    <td className="mono">{student.governmentId}</td>
                    <td>{student.status}</td>
                    <td>{student.claimedAt ? formatDateTime(student.claimedAt) : "Not claimed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

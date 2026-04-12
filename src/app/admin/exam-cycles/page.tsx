import Link from "next/link";
import { UserRole } from "@prisma/client";

import { AdminShell } from "@/components/admin/admin-shell";
import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { UiSelect } from "@/components/shared/ui-select";
import { createExamCycleAction } from "@/lib/actions/admin";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function ExamCyclesPage() {
  await requireStaff(UserRole.ADMIN);

  const [cycles, scenarios] = await Promise.all([
    prisma.examCycle.findMany({
      include: {
        scenario: true,
        students: true
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.scenario.findMany({
      where: {
        isActive: true
      },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <AdminShell
      active="cycles"
      title="Exams"
      subtitle="Create an exam, attach the shared scenario, and generate a visible 4-digit code for student entry."
    >
      <div className="card-grid" style={{ gridTemplateColumns: "0.9fr 1.1fr" }}>
        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Create exam</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Each exam reuses one scenario and generates one 4-digit code that students use when they enter.
              </p>
            </div>
            <ActionForm action={createExamCycleAction}>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="name">Exam name</label>
                  <input id="name" name="name" placeholder="April 2026 Cohort A" required />
                </div>
                <div className="field">
                  <label htmlFor="scenarioId">Scenario</label>
                  <UiSelect
                    id="scenarioId"
                    name="scenarioId"
                    defaultValue={scenarios[0]?.id}
                    options={scenarios.map((scenario) => ({
                      value: scenario.id,
                      label: scenario.name
                    }))}
                  />
                </div>
              </div>
              <ActionSubmitButton label="Create exam" pendingLabel="Creating exam..." />
            </ActionForm>
          </div>
        </section>

        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Exam list</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Open an exam to view its 4-digit entry code and the students who have signed in.
              </p>
            </div>
            <div className="stack-md">
              {cycles.map((cycle) => (
                <Link key={cycle.id} href={`/admin/exam-cycles/${cycle.id}`} className="panel" style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <strong>{cycle.name}</strong>
                      <p className="muted" style={{ margin: "8px 0 0" }}>
                        {cycle.scenario.name}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className="chip mono">{cycle.accessCode}</span>
                      <span className="chip">{cycle.status}</span>
                      <span className="chip">{cycle.students.length} students</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

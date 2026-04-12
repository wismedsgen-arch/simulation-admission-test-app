import Link from "next/link";
import { UserRole } from "@prisma/client";

import { AdminShell } from "@/components/admin/admin-shell";
import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { DirectionTextareaField } from "@/components/shared/direction-textarea-field";
import { InfoTip } from "@/components/shared/info-tip";
import { createScenarioAction } from "@/lib/actions/admin";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function AdminScenariosPage() {
  await requireStaff(UserRole.ADMIN);

  const scenarios = await prisma.scenario.findMany({
    include: {
      roles: true,
      templates: true
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <AdminShell
      active="scenarios"
      title="Scenario management"
      subtitle="Create the shared email worlds used by students and psychologists."
    >
      <div className="card-grid" style={{ gridTemplateColumns: "0.95fr 1.05fr" }}>
        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Create scenario</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Each scenario defines the opening instructions, fictional roles, and the email library.
              </p>
            </div>
            <ActionForm action={createScenarioAction}>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="name">Scenario name</label>
                  <input id="name" name="name" required />
                </div>
                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" name="description" required />
                </div>
                <DirectionTextareaField
                  id="openingInstructions"
                  name="openingInstructions"
                  directionName="openingInstructionsDirection"
                  defaultDirection="AUTO"
                  required
                  label={
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label htmlFor="openingInstructions">Opening instructions</label>
                      <InfoTip text="This is the instructions the students see before entering the exam. It should explain everything they need to know about it." />
                    </div>
                  }
                />
                <DirectionTextareaField
                  id="psychologistInstructions"
                  name="psychologistInstructions"
                  directionName="psychologistInstructionsDirection"
                  defaultDirection="AUTO"
                  required
                  label={
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label htmlFor="psychologistInstructions">Psychologist opening instructions</label>
                      <InfoTip text="These are shown to psychologists while they manage the exercise. Include scenario background, intended flow, and what to watch for." />
                    </div>
                  }
                />
                <div className="field">
                  <label htmlFor="durationMinutes">Duration (minutes)</label>
                  <input
                    id="durationMinutes"
                    name="durationMinutes"
                    type="number"
                    min={30}
                    max={180}
                    defaultValue={90}
                    required
                  />
                </div>
              </div>
              <ActionSubmitButton label="Create scenario" pendingLabel="Creating scenario..." />
            </ActionForm>
          </div>
        </section>

        <section className="panel" style={{ padding: 22 }}>
          <div className="stack-md">
            <div>
              <h2 style={{ margin: 0 }}>Existing scenarios</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Open a scenario to manage roles, preloaded emails, and follow-up library items.
              </p>
            </div>
            <div className="stack-md">
              {scenarios.map((scenario) => (
                <Link key={scenario.id} href={`/admin/scenarios/${scenario.id}`} className="panel" style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <div>
                      <strong>{scenario.name}</strong>
                      <p className="muted" style={{ margin: "8px 0 0" }}>
                        {scenario.description}
                      </p>
                    </div>
                    <div className="stack-sm" style={{ minWidth: 140 }}>
                      <span className="chip">{scenario.durationMinutes} min</span>
                      <span className="chip">{scenario.roles.length} roles</span>
                      <span className="chip">{scenario.templates.length} templates</span>
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

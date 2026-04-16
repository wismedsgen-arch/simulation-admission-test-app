import Link from "next/link";
import { UserRole } from "@prisma/client";

import { AdminShell } from "@/components/admin/admin-shell";
import { CreateScenarioForm } from "@/components/admin/create-scenario-form";
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
            <CreateScenarioForm />
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

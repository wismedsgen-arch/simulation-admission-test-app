import Link from "next/link";
import { RequestStatus, UserRole } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { AdminShell } from "@/components/admin/admin-shell";
import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { UiSelect } from "@/components/shared/ui-select";
import {
  approveSignupRequestAction,
  createStaffDirectlyAction,
  deleteStaffAction,
  rejectSignupRequestAction
} from "@/lib/actions/admin";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isProtectedAdminName } from "@/lib/utils";

export default async function AdminOverviewPage() {
  const actor = await requireStaff(UserRole.ADMIN);
  const baseUrl = process.env.APP_BASE_URL ?? "";
  const staffLoginUrl = baseUrl ? `${baseUrl}/staff/login` : "/staff/login";
  const studentLoginUrl = baseUrl ? `${baseUrl}/student/login` : "/student/login";

  const [pendingRequests, staffUsers, cycles, scenarios, liveSessions] =
    await Promise.all([
      prisma.staffSignupRequest.findMany({
        where: { status: RequestStatus.PENDING },
        orderBy: { createdAt: "desc" }
      }),
      prisma.user.findMany({
        where: {
          isApproved: true
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.examCycle.findMany({
        include: { students: true, scenario: true },
        orderBy: { createdAt: "desc" },
        take: 6
      }),
      prisma.scenario.findMany({
        orderBy: { createdAt: "desc" },
        include: { roles: true, templates: true },
        take: 6
      }),
      prisma.session.count({
        where: {
          status: "ACTIVE"
        }
      })
    ]);

  return (
    <AdminShell
      active="overview"
      title="Admin control plane"
      subtitle="Approve staff access, bootstrap scenarios, and manage exams for Weizmann Institute of Science."
    >
      <LiveRefresh intervalMs={5000} />
      <div className="stack-lg">
        <div className="metric-grid">
          <div className="panel metric-card">
            <span className="muted">Pending approvals</span>
            <strong>{pendingRequests.length}</strong>
          </div>
          <Link href="#approved-staff" className="panel metric-card">
            <span className="muted">Approved staff</span>
            <strong>{staffUsers.length}</strong>
          </Link>
          <div className="panel metric-card">
            <span className="muted">Exams</span>
            <strong>{cycles.length}</strong>
          </div>
          <div className="panel metric-card">
            <span className="muted">Live sessions</span>
            <strong>{liveSessions}</strong>
          </div>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: "1.1fr 0.9fr" }}>
          <section className="panel" style={{ padding: 22 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Pending staff requests</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Requests become active accounts only after admin approval.
                </p>
              </div>
              {pendingRequests.length === 0 ? (
                <div className="panel" style={{ padding: 18 }}>
                  No pending requests right now.
                </div>
              ) : (
                <div className="stack-md">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="panel" style={{ padding: 18 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          alignItems: "flex-start",
                          flexWrap: "wrap"
                        }}
                      >
                        <div className="stack-sm">
                          <strong>{request.fullName}</strong>
                          <span className="chip">{request.requestedRole}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <ActionForm action={approveSignupRequestAction}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="role" value={request.requestedRole} />
                            <ActionSubmitButton label="Approve" pendingLabel="Approving..." />
                          </ActionForm>
                          <ActionForm action={rejectSignupRequestAction}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <ActionSubmitButton
                              label="Reject"
                              pendingLabel="Rejecting..."
                              className="btn btn-danger"
                            />
                          </ActionForm>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel" style={{ padding: 22 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Create staff directly</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Use this for direct admin-managed provisioning without waiting for a signup request.
                </p>
              </div>
              <ActionForm action={createStaffDirectlyAction}>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="fullName">Full name</label>
                    <input id="fullName" name="fullName" required />
                  </div>
                  <div className="field">
                    <label htmlFor="password">Password</label>
                    <input id="password" name="password" type="password" required />
                  </div>
                  <div className="field">
                    <label htmlFor="role">Role</label>
                    <UiSelect
                      id="role"
                      name="role"
                      defaultValue="PSYCHOLOGIST"
                      options={[
                        { value: "PSYCHOLOGIST", label: "Psychologist" },
                        { value: "ADMIN", label: "Admin" }
                      ]}
                    />
                  </div>
                </div>
                <ActionSubmitButton label="Create staff member" pendingLabel="Creating..." />
              </ActionForm>

              <div className="divider" />

              <div className="stack-sm">
                <h3 style={{ margin: 0 }}>Access URLs</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Share the staff link only with staff. The student link is here as a quick shortcut for admins.
                </p>
                <div className="panel" style={{ padding: 16 }}>
                  <div className="stack-sm">
                    <span className="muted">Staff sign-in URL</span>
                    <span className="mono">{staffLoginUrl}</span>
                  </div>
                </div>
                <div className="panel" style={{ padding: 16 }}>
                  <div className="stack-sm">
                    <span className="muted">Student sign-in URL</span>
                    <span className="mono">{studentLoginUrl}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <section id="approved-staff" className="panel" style={{ padding: 22, gridColumn: "1 / -1" }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Current staff</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Approved staff accounts. Only unused accounts can be deleted safely.
                </p>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staffUsers.map((staffUser) => (
                    <tr key={staffUser.id}>
                      <td>
                        {staffUser.fullName}
                        {staffUser.id === actor.userId ? <span className="muted"> · current account</span> : null}
                      </td>
                      <td>{staffUser.role}</td>
                      <td style={{ textAlign: "right" }}>
                        {staffUser.id === actor.userId || (staffUser.role === UserRole.ADMIN && isProtectedAdminName(staffUser.fullName)) ? (
                          <span className="chip">Protected</span>
                        ) : (
                          <ActionForm action={deleteStaffAction} className="stack-sm">
                            <input type="hidden" name="userId" value={staffUser.id} />
                            <button
                              type="submit"
                              className="icon-btn icon-btn-danger"
                              aria-label={`Delete ${staffUser.fullName}`}
                              title={`Delete ${staffUser.fullName}`}
                            >
                              <Trash2 size={18} />
                            </button>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" style={{ padding: 22 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Recent scenarios</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Active reusable scenario definitions.
                </p>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Roles</th>
                    <th>Templates</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((scenario) => (
                    <tr key={scenario.id}>
                      <td>{scenario.name}</td>
                      <td>{scenario.roles.length}</td>
                      <td>{scenario.templates.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" style={{ padding: 22 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Recent exams</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Shared scenario runs and their current student sign-ins.
                </p>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Scenario</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((cycle) => (
                    <tr key={cycle.id}>
                      <td>{cycle.name}</td>
                      <td>{cycle.scenario.name}</td>
                      <td className="mono">{cycle.accessCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";

import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmDeleteScenarioDialog } from "@/components/admin/confirm-delete-scenario-dialog";
import { ScenarioRoleCreateForm } from "@/components/admin/scenario-role-create-form";
import { ScenarioRoleEditorList } from "@/components/admin/scenario-role-editor-list";
import { ScenarioTemplateLibraryList } from "@/components/admin/scenario-template-library-list";
import { UpdateScenarioForm } from "@/components/admin/update-scenario-form";
import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { DirectionTextareaField } from "@/components/shared/direction-textarea-field";
import { UiSelect } from "@/components/shared/ui-select";
import {
  createScenarioFileAction,
  createScenarioTemplateAction,
  deleteScenarioFileAction
} from "@/lib/actions/admin";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { toDomDir, toTextAlign } from "@/lib/utils";

export default async function ScenarioDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ scenarioId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  await requireStaff(UserRole.ADMIN);
  const { scenarioId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab =
    resolvedSearchParams.tab === "roles" ||
    resolvedSearchParams.tab === "emails" ||
    resolvedSearchParams.tab === "files"
      ? resolvedSearchParams.tab
      : "general";

  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      roles: {
        orderBy: { createdAt: "asc" }
      },
      templates: {
        include: {
          role: true,
          attachments: true
        },
        orderBy: [{ kind: "asc" }, { sendOrder: "asc" }, { createdAt: "asc" }]
      },
      files: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!scenario) {
    notFound();
  }

  const preloadedTemplates = scenario.templates.filter((template) => template.kind === "PRELOADED");
  const followUpTemplates = scenario.templates.filter((template) => template.kind === "FOLLOW_UP");

  return (
    <AdminShell
      active="scenarios"
      title={scenario.name}
      subtitle="Manage fictional roles and the email library used before and during the session."
    >
      <div className="stack-lg">
        <div className="admin-tabs">
          <Link href={`/admin/scenarios/${scenario.id}?tab=general`} className={`admin-tab${activeTab === "general" ? " admin-tab--active" : ""}`}>
            General
          </Link>
          <Link href={`/admin/scenarios/${scenario.id}?tab=roles`} className={`admin-tab${activeTab === "roles" ? " admin-tab--active" : ""}`}>
            Roles
          </Link>
          <Link href={`/admin/scenarios/${scenario.id}?tab=emails`} className={`admin-tab${activeTab === "emails" ? " admin-tab--active" : ""}`}>
            Email library
          </Link>
          <Link href={`/admin/scenarios/${scenario.id}?tab=files`} className={`admin-tab${activeTab === "files" ? " admin-tab--active" : ""}`}>
            Files
          </Link>
        </div>

        {activeTab === "general" ? (
          <section className="panel" style={{ padding: 22 }}>
            <div className="stack-md">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Scenario details</h2>
                  <p className="muted" style={{ margin: "8px 0 0" }}>
                    The scenario name is also used as the opening title students see before the test starts.
                  </p>
                </div>
                <ConfirmDeleteScenarioDialog scenarioId={scenario.id} scenarioName={scenario.name} />
              </div>
              <UpdateScenarioForm
                scenario={{
                  id: scenario.id,
                  name: scenario.name,
                  description: scenario.description,
                  openingInstructions: scenario.openingInstructions,
                  openingInstructionsDirection: scenario.openingInstructionsDirection,
                  psychologistInstructions: scenario.psychologistInstructions,
                  psychologistInstructionsDirection: scenario.psychologistInstructionsDirection,
                  durationMinutes: scenario.durationMinutes,
                  updatedAt: scenario.updatedAt.toISOString()
                }}
              />
            </div>
          </section>
        ) : null}

        {activeTab === "roles" ? (
          <section className="panel" style={{ padding: 22 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Scenario roles</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Create the characters first. Students and psychologists both use these roles during the exercise.
                </p>
              </div>
              <ScenarioRoleCreateForm scenarioId={scenario.id} />
              <ScenarioRoleEditorList
                scenarioId={scenario.id}
                roles={scenario.roles.map((role) => ({
                  id: role.id,
                  name: role.name,
                  category: role.category,
                  description: role.description,
                  descriptionDirection: role.descriptionDirection,
                  emailAddress: role.emailAddress,
                  accentColor: role.accentColor
                }))}
              />
            </div>
          </section>
        ) : null}

        {activeTab === "emails" ? (
          <section className="panel" style={{ padding: 22 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Email library</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Preloaded emails appear when a session is started. Follow-up emails stay available in the psychologist quick-send library.
                </p>
              </div>
              <ActionForm action={createScenarioTemplateAction}>
                <input type="hidden" name="scenarioId" value={scenario.id} />
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="kind">Template type</label>
                    <UiSelect
                      id="kind"
                      name="kind"
                      defaultValue="PRELOADED"
                      options={[
                        { value: "PRELOADED", label: "Preloaded before inbox opens" },
                        { value: "FOLLOW_UP", label: "Psychologist follow-up library" }
                      ]}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="roleId">Sender role</label>
                    <UiSelect
                      id="roleId"
                      name="roleId"
                      defaultValue={scenario.roles[0]?.id}
                      options={scenario.roles.map((role) => ({
                        value: role.id,
                        label: role.name
                      }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="subject">Subject</label>
                    <input id="subject" name="subject" required />
                  </div>
                  <DirectionTextareaField
                    id="body"
                    name="body"
                    directionName="bodyDirection"
                    defaultDirection="AUTO"
                    required
                    label={<label htmlFor="body">Body</label>}
                  />
                  <div className="field">
                    <label htmlFor="attachments">Attachments</label>
                    <input id="attachments" name="attachments" type="file" multiple />
                    <span className="field-hint">Optional. Leave empty if the template has no files.</span>
                  </div>
                </div>
                <ActionSubmitButton label="Save template" pendingLabel="Saving template..." />
              </ActionForm>
              <div className="stack-md">
                <div>
                  <h3 style={{ margin: 0 }}>Preloaded email order</h3>
                  <p className="muted" style={{ margin: "8px 0 0" }}>
                    Drag the preloaded emails to set the order students see before the inbox opens.
                  </p>
                </div>
                <ScenarioTemplateLibraryList
                  scenarioId={scenario.id}
                  templates={preloadedTemplates.map((template) => ({
                    id: template.id,
                    subject: template.subject,
                    body: template.body,
                    roleName: template.role.name,
                    sendOrder: template.sendOrder ?? 1,
                    attachments: template.attachments.map((attachment) => ({
                      id: attachment.id,
                      fileName: attachment.fileName
                    }))
                  }))}
                  emptyMessage="No preloaded emails yet."
                  reorderable
                />
              </div>
              <div className="stack-md">
                <div>
                  <h3 style={{ margin: 0 }}>Follow-up library</h3>
                  <p className="muted" style={{ margin: "8px 0 0" }}>
                    These stay available for psychologists to send manually during the session.
                  </p>
                </div>
                <ScenarioTemplateLibraryList
                  scenarioId={scenario.id}
                  templates={followUpTemplates.map((template) => ({
                    id: template.id,
                    subject: template.subject,
                    body: template.body,
                    roleName: template.role.name,
                    sendOrder: template.sendOrder,
                    attachments: template.attachments.map((attachment) => ({
                      id: attachment.id,
                      fileName: attachment.fileName
                    }))
                  }))}
                  emptyMessage="No follow-up templates yet."
                />
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "files" ? (
          <section className="panel" style={{ padding: 22 }}>
            <div className="stack-md">
              <div>
                <h2 style={{ margin: 0 }}>Scenario files</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Add reusable files students and psychologists can open from the mailbox sidebar during the exercise.
                </p>
              </div>

              <ActionForm action={createScenarioFileAction}>
                <input type="hidden" name="scenarioId" value={scenario.id} />
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="scenario-file-name">File name</label>
                    <input id="scenario-file-name" name="name" required />
                  </div>
                  <DirectionTextareaField
                    id="scenario-file-text"
                    name="textContent"
                    directionName="textDirection"
                    defaultDirection="AUTO"
                    label={<label htmlFor="scenario-file-text">Text content</label>}
                  />
                  <div className="field">
                    <label htmlFor="scenario-file-upload">Upload file</label>
                    <input id="scenario-file-upload" name="file" type="file" />
                    <span className="field-hint">Optional. You can add text, a downloadable file, or both.</span>
                  </div>
                </div>
                <ActionSubmitButton label="Save scenario file" pendingLabel="Saving file..." />
              </ActionForm>

              <div className="stack-md">
                {scenario.files.length === 0 ? (
                  <div className="panel" style={{ padding: 16 }}>
                    No scenario files yet.
                  </div>
                ) : (
                  scenario.files.map((file) => (
                    <div key={file.id} className="panel" style={{ padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div className="stack-sm" style={{ minWidth: 0, flex: 1 }}>
                          <strong>{file.name}</strong>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {file.textContent ? <div className="chip">Text</div> : null}
                            {file.fileName ? <div className="chip">Downloadable file</div> : null}
                          </div>
                          {file.textContent ? (
                            <div
                              className="panel"
                              dir={toDomDir(file.textDirection)}
                              style={{
                                padding: 14,
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.7,
                                textAlign: toTextAlign(file.textDirection)
                              }}
                            >
                              {file.textContent}
                            </div>
                          ) : null}
                          {file.fileName ? (
                            <a href={`/api/scenario-files/${file.id}`} className="btn btn-secondary" download>
                              Download {file.fileName}
                            </a>
                          ) : null}
                        </div>
                        <ActionForm action={deleteScenarioFileAction} hideMessages className="">
                          <input type="hidden" name="fileId" value={file.id} />
                          <ActionSubmitButton label="Delete file" pendingLabel="Deleting..." className="btn btn-danger" />
                        </ActionForm>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </AdminShell>
  );
}

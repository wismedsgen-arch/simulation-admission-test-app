"use client";

import { Edit3, Trash2 } from "lucide-react";
import { useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { InfoTip } from "@/components/shared/info-tip";
import { TextDirectionToggle } from "@/components/shared/text-direction-toggle";
import { deleteScenarioRoleAction, updateScenarioRoleAction } from "@/lib/actions/admin";
import { suggestRoleEmailLabel, toDomDir } from "@/lib/utils";

type Role = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  descriptionDirection: "AUTO" | "LTR" | "RTL";
  emailAddress: string | null;
  accentColor: string;
};

export function ScenarioRoleEditorList({
  scenarioId,
  roles
}: {
  scenarioId: string;
  roles: Role[];
}) {
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);
  const [roleDirections, setRoleDirections] = useState<Record<string, "AUTO" | "LTR" | "RTL">>({});

  if (roles.length === 0) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        No roles yet.
      </div>
    );
  }

  return (
    <div className="stack-sm">
      {roles.map((role) => {
        const isOpen = openRoleId === role.id;
        const suggestedEmail = suggestRoleEmailLabel(role.name);
        const descriptionDirection = roleDirections[role.id] ?? role.descriptionDirection;

        return (
          <div key={role.id} className="panel" style={{ padding: 16 }}>
            <div className="stack-sm">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      background: role.accentColor,
                      flexShrink: 0
                    }}
                  />
                  <strong>{role.name}</strong>
                  <span className="muted">{role.category}</span>
                  <span className="chip mono">{role.emailAddress ?? "Auto email label"}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Edit ${role.name}`}
                    title={`Edit ${role.name}`}
                    onClick={() => setOpenRoleId((current) => (current === role.id ? null : role.id))}
                  >
                    <Edit3 size={18} />
                  </button>
                  <ActionForm action={deleteScenarioRoleAction} className="" hideMessages>
                    <input type="hidden" name="roleId" value={role.id} />
                    <input type="hidden" name="scenarioId" value={scenarioId} />
                    <button
                      type="submit"
                      className="icon-btn icon-btn-danger"
                      aria-label={`Delete ${role.name}`}
                      title={`Delete ${role.name}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </ActionForm>
                </div>
              </div>

              {isOpen ? (
                <ActionForm action={updateScenarioRoleAction}>
                  <input type="hidden" name="roleId" value={role.id} />
                  <input type="hidden" name="scenarioId" value={scenarioId} />
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor={`role-name-${role.id}`}>Role name</label>
                      <input id={`role-name-${role.id}`} name="name" defaultValue={role.name} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`role-category-${role.id}`}>Category</label>
                      <input id={`role-category-${role.id}`} name="category" defaultValue={role.category} required />
                    </div>
                    <div className="field">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label htmlFor={`role-description-${role.id}`}>Role description</label>
                          <InfoTip text="Write here some background that might help the user understand the character." />
                        </div>
                        <TextDirectionToggle
                          value={descriptionDirection}
                          onChange={(nextValue) =>
                            setRoleDirections((current) => ({
                              ...current,
                              [role.id]: nextValue
                            }))
                          }
                        />
                      </div>
                      <input type="hidden" name="descriptionDirection" value={descriptionDirection} />
                      <textarea
                        id={`role-description-${role.id}`}
                        name="description"
                        defaultValue={role.description ?? ""}
                        placeholder="Background that helps the user understand the character."
                        dir={toDomDir(descriptionDirection)}
                      />
                    </div>
                    <div className="field-grid field-grid--compact-two">
                      <div className="field">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label htmlFor={`role-email-${role.id}`}>Email label</label>
                          <InfoTip text="You can keep the suggested email label or edit it manually." />
                        </div>
                        <input
                          id={`role-email-${role.id}`}
                          name="emailAddress"
                          defaultValue={role.emailAddress ?? suggestedEmail}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`role-color-${role.id}`}>Accent color</label>
                        <input id={`role-color-${role.id}`} name="accentColor" type="color" defaultValue={role.accentColor} />
                      </div>
                    </div>
                  </div>
                  <ActionSubmitButton label="Save role" pendingLabel="Saving role..." className="btn btn-secondary" />
                </ActionForm>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

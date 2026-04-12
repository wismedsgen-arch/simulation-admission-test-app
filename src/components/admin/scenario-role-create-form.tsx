"use client";

import { useEffect, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { InfoTip } from "@/components/shared/info-tip";
import { TextDirectionToggle } from "@/components/shared/text-direction-toggle";
import { createScenarioRoleAction } from "@/lib/actions/admin";
import { suggestRoleEmailLabel, toDomDir } from "@/lib/utils";

export function ScenarioRoleCreateForm({ scenarioId }: { scenarioId: string }) {
  const [name, setName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [descriptionDirection, setDescriptionDirection] = useState<"AUTO" | "LTR" | "RTL">("AUTO");

  useEffect(() => {
    if (emailTouched) {
      return;
    }

    setEmailAddress(name ? suggestRoleEmailLabel(name) : "");
  }, [emailTouched, name]);

  return (
    <ActionForm
      action={createScenarioRoleAction}
      resetOnSuccess
      onSuccess={() => {
        setName("");
        setEmailAddress("");
        setEmailTouched(false);
        setDescriptionDirection("AUTO");
      }}
    >
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <div className="field-grid">
        <div className="field">
          <label htmlFor="name">Role name</label>
          <input id="name" name="name" placeholder="Professor Leah Cohen" required value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <input id="category" name="category" placeholder="Course instructor" required />
        </div>
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label htmlFor="description">Role description</label>
              <InfoTip text="Write here some background that might help the user understand the character." />
            </div>
            <TextDirectionToggle value={descriptionDirection} onChange={setDescriptionDirection} />
          </div>
          <input type="hidden" name="descriptionDirection" value={descriptionDirection} />
          <textarea
            id="description"
            name="description"
            placeholder="Background that helps the user understand the character."
            dir={toDomDir(descriptionDirection)}
          />
        </div>
        <div className="field-grid field-grid--compact-two">
          <div className="field">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label htmlFor="emailAddress">Email label</label>
              <InfoTip text="You can keep the suggested email label or edit it manually." />
            </div>
            <input
              id="emailAddress"
              name="emailAddress"
              value={emailAddress}
              onChange={(event) => {
                setEmailTouched(true);
                setEmailAddress(event.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="accentColor">Accent color</label>
            <input id="accentColor" name="accentColor" type="color" defaultValue="#4285f4" />
            <span className="field-hint">Choose the role marker shown in inbox and role chips.</span>
          </div>
        </div>
      </div>
      <ActionSubmitButton label="Add role" pendingLabel="Adding role..." />
    </ActionForm>
  );
}

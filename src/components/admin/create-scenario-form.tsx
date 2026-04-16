"use client";

import { useActionState } from "react";

import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { DirectionTextareaField } from "@/components/shared/direction-textarea-field";
import { InfoTip } from "@/components/shared/info-tip";
import { createScenarioAction } from "@/lib/actions/admin";

type ActionResult = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

export function CreateScenarioForm() {
  const [state, action] = useActionState(createScenarioAction, {} as ActionResult);

  const hasFieldErrors = state.fieldErrors && Object.keys(state.fieldErrors).length > 0;

  return (
    <form action={action} className="stack-md">
      {hasFieldErrors ? (
        <div
          className="panel"
          style={{ padding: 14, borderColor: "rgba(217, 48, 37, 0.22)", color: "#d93025", background: "#fff6f5" }}
        >
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {Object.values(state.fieldErrors!).map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      ) : state.error ? (
        <div
          className="panel"
          style={{ padding: 14, borderColor: "rgba(217, 48, 37, 0.22)", color: "#d93025", background: "#fff6f5" }}
        >
          {state.error}
        </div>
      ) : null}

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
    </form>
  );
}

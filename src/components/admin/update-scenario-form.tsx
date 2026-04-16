"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { DirectionTextareaField } from "@/components/shared/direction-textarea-field";
import { InfoTip } from "@/components/shared/info-tip";
import { updateScenarioAction } from "@/lib/actions/admin";

type ActionResult = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

type ScenarioFormData = {
  id: string;
  name: string;
  description: string;
  openingInstructions: string;
  openingInstructionsDirection: "AUTO" | "LTR" | "RTL";
  psychologistInstructions: string;
  psychologistInstructionsDirection: "AUTO" | "LTR" | "RTL";
  durationMinutes: number;
  /** ISO string — used as form key so fields remount when saved values change */
  updatedAt: string;
};

export function UpdateScenarioForm({ scenario }: { scenario: ScenarioFormData }) {
  const router = useRouter();
  const [state, action] = useActionState(updateScenarioAction, {} as ActionResult);
  const prevStateRef = useRef<ActionResult>({});

  useEffect(() => {
    if (state !== prevStateRef.current && state.success) {
      router.refresh();
    }
    prevStateRef.current = state;
  }, [router, state]);

  const hasFieldErrors = state.fieldErrors && Object.keys(state.fieldErrors).length > 0;

  return (
    <>
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
      ) : state.success ? (
        <div
          className="panel"
          style={{ padding: 14, borderColor: "rgba(52, 168, 83, 0.22)", color: "#137333", background: "#f2fff5" }}
        >
          {state.success}
        </div>
      ) : null}

      {/*
        key={scenario.updatedAt}: when a save succeeds, revalidatePath causes the Server Component
        to pass a new updatedAt to this component. The key change remounts this form element,
        resetting all fields (including nested DirectionTextareaField state) to the fresh defaultValues.
        On validation failure, updatedAt is unchanged so the key stays the same and user input is preserved.
      */}
      <form key={scenario.updatedAt} action={action} className="stack-md">
        <input type="hidden" name="scenarioId" value={scenario.id} />
        <div className="field-grid">
          <div className="field">
            <label htmlFor="scenario-name">Scenario name</label>
            <input id="scenario-name" name="name" defaultValue={scenario.name} required />
          </div>
          <div className="field">
            <label htmlFor="scenario-description">Description</label>
            <textarea id="scenario-description" name="description" defaultValue={scenario.description} required />
          </div>
          <DirectionTextareaField
            id="openingInstructions"
            name="openingInstructions"
            directionName="openingInstructionsDirection"
            defaultValue={scenario.openingInstructions}
            defaultDirection={scenario.openingInstructionsDirection}
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
            defaultValue={scenario.psychologistInstructions}
            defaultDirection={scenario.psychologistInstructionsDirection}
            required
            label={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label htmlFor="psychologistInstructions">Psychologist opening instructions</label>
                <InfoTip text="These are shown to psychologists in the session desk and inside the live instructions popup." />
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
              defaultValue={scenario.durationMinutes}
              required
            />
          </div>
        </div>
        <ActionSubmitButton label="Save scenario details" pendingLabel="Saving scenario..." />
      </form>
    </>
  );
}

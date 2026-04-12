"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import { deleteScenarioAction } from "@/lib/actions/admin";

type ActionResult = {
  error?: string;
  success?: string;
};

export function ConfirmDeleteScenarioDialog({
  scenarioId,
  scenarioName
}: {
  scenarioId: string;
  scenarioName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [state, formAction] = useActionState<ActionResult, FormData>(deleteScenarioAction, {});

  return (
    <>
      <button type="button" className="btn btn-danger" onClick={() => setIsOpen(true)}>
        Delete scenario
      </button>

      {isOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-scenario-title">
          <div className="modal-card">
            <div className="stack-md">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div className="stack-sm">
                  <div className="chip" style={{ width: "fit-content", color: "#b3261e", background: "#fdecea" }}>
                    <AlertTriangle size={14} />
                    Destructive action
                  </div>
                  <div>
                    <h2 id="delete-scenario-title" style={{ margin: 0 }}>
                      Delete {scenarioName}
                    </h2>
                    <p className="muted" style={{ margin: "8px 0 0" }}>
                      This removes the scenario, its roles, and its email library if it has never been used in an exam.
                    </p>
                  </div>
                </div>
                <button type="button" className="icon-btn" aria-label="Close dialog" onClick={() => setIsOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              {state.error ? (
                <div className="panel" style={{ padding: 14, color: "#d93025", background: "#fff6f5" }}>
                  {state.error}
                </div>
              ) : null}

              <form action={formAction} className="stack-md">
                <input type="hidden" name="scenarioId" value={scenarioId} />
                <label className="panel" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(event) => setIsConfirmed(event.target.checked)}
                    style={{ marginTop: 4 }}
                  />
                  <span>I understand this cannot be undone and I want to permanently delete this scenario.</span>
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setIsConfirmed(false);
                      setIsOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-danger" disabled={!isConfirmed}>
                    Delete permanently
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import { deleteExamCycleAction } from "@/lib/actions/admin";

type ActionResult = {
  error?: string;
  success?: string;
};

export function ConfirmDeleteExamDialog({
  cycleId,
  examName
}: {
  cycleId: string;
  examName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [state, formAction] = useActionState<ActionResult, FormData>(deleteExamCycleAction, {});

  return (
    <>
      <button type="button" className="btn btn-danger" onClick={() => setIsOpen(true)}>
        Delete entire exam
      </button>

      {isOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-exam-title">
          <div className="modal-card">
            <div className="stack-md">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16
                }}
              >
                <div className="stack-sm">
                  <div className="chip" style={{ width: "fit-content", color: "#b3261e", background: "#fdecea" }}>
                    <AlertTriangle size={14} />
                    Destructive action
                  </div>
                  <div>
                    <h2 id="delete-exam-title" style={{ margin: 0 }}>
                      Delete {examName}
                    </h2>
                    <p className="muted" style={{ margin: "8px 0 0" }}>
                      This permanently removes the exam, student sign-ins, sessions, messages, and attachments.
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
                <input type="hidden" name="cycleId" value={cycleId} />
                <label
                  className="panel"
                  style={{
                    padding: 16,
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(event) => setIsConfirmed(event.target.checked)}
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    I understand this cannot be undone and I want to permanently delete this exam.
                  </span>
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

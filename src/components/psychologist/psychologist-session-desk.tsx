"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, TimerReset, X } from "lucide-react";
import { createPortal } from "react-dom";

import { PsychologistWorkspace } from "@/components/psychologist/psychologist-workspace";
import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { CountdownBadge } from "@/components/shared/countdown-badge";
import {
  extendSessionAction,
  forceEndSessionAction,
  startPreparedSessionsAction
} from "@/lib/actions/psychologist";
import { toDomDir, toTextAlign } from "@/lib/utils";

type SessionDeskStudent = {
  id: string;
  fullName: string;
  unresolvedCount: number;
  session: {
    id: string;
    status: string;
    endsAt: string | null;
    extensionMinutes: number;
    openingTitle: string;
    openingInstructions: string;
    openingInstructionsDirection?: string | null;
    psychologistInstructions: string;
    psychologistInstructionsDirection?: string | null;
    draft: {
      subject: string;
      body: string;
      recipientRoleId: string | null;
    } | null;
    messages: Array<{
      id: string;
      senderType: string;
      senderDisplayName: string;
      senderRoleId: string | null;
      recipientName: string;
      subject: string;
      body: string;
      bodyDirection: string | null;
      sentAt: string;
      replyToId: string | null;
      requiresResponse: boolean;
      resolvedAt: string | null;
      deletedByStaffAt: string | null;
      attachments: Array<{
        id: string;
        fileName: string;
      }>;
    }>;
  };
  roles: Array<{
    id: string;
    name: string;
    category: string;
    accentColor?: string;
    description?: string | null;
    descriptionDirection?: string | null;
  }>;
  files: Array<{
    id: string;
    name: string;
    kind: string;
    textContent: string | null;
    fileName: string | null;
  }>;
  templates: Array<{
    id: string;
    subject: string;
    body: string;
    roleName: string;
  }>;
};

export function PsychologistSessionDesk({
  students,
  initialSessionId
}: {
  students: SessionDeskStudent[];
  initialSessionId?: string | null;
}) {
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId ?? students[0]?.session.id ?? "");
  const [showForceEndModal, setShowForceEndModal] = useState(false);
  const [readyInstructionTab, setReadyInstructionTab] = useState<"psychologist" | "student">("psychologist");

  useEffect(() => {
    if (!students.some((student) => student.session.id === activeSessionId)) {
      setActiveSessionId(initialSessionId ?? students[0]?.session.id ?? "");
    }
  }, [activeSessionId, initialSessionId, students]);

  useEffect(() => {
    const url = new URL(window.location.href);

    if (activeSessionId) {
      url.searchParams.set("session", activeSessionId);
    } else {
      url.searchParams.delete("session");
    }

    window.history.replaceState({}, "", url.toString());
  }, [activeSessionId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (showForceEndModal) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showForceEndModal]);

  useEffect(() => {
    setReadyInstructionTab("psychologist");
  }, [activeSessionId]);

  const activeStudent = useMemo(
    () => students.find((student) => student.session.id === activeSessionId) ?? students[0] ?? null,
    [activeSessionId, students]
  );

  const readyCount = useMemo(
    () => students.filter((student) => student.session.status === "READY").length,
    [students]
  );

  if (!activeStudent) {
    return null;
  }

  return (
    <>
      <div className="stack-md">
        <section className="panel" style={{ padding: 18 }}>
          <div className="stack-md">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 18,
                flexWrap: "wrap",
                alignItems: "flex-start"
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Session desk</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Move between prepared student sessions using the tabs below.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {activeStudent.session.status === "ACTIVE" ? (
                  <>
                    <CountdownBadge endsAt={activeStudent.session.endsAt} active inactiveLabel="Session ended" />
                    <ActionForm action={extendSessionAction} hideMessages className="">
                      <input type="hidden" name="sessionId" value={activeStudent.session.id} />
                      <input type="hidden" name="minutes" value={10} />
                      <ActionSubmitButton label="Extend by 10 min" pendingLabel="Extending..." className="btn btn-secondary" />
                    </ActionForm>
                  </>
                ) : (
                  <span className="chip">Instructions released</span>
                )}

                {readyCount > 0 ? (
                  <ActionForm action={startPreparedSessionsAction} hideMessages className="">
                    <ActionSubmitButton
                      label={`Start test for ${readyCount} student${readyCount === 1 ? "" : "s"}`}
                      pendingLabel="Starting..."
                      className="btn btn-primary"
                    />
                  </ActionForm>
                ) : null}

                <button type="button" className="btn btn-danger" onClick={() => setShowForceEndModal(true)}>
                  Force end session
                </button>
              </div>
            </div>

            <div className="session-tabs">
              {students.map((student) => {
                const isActive = student.session.id === activeStudent.session.id;

                return (
                  <button
                    key={student.id}
                    type="button"
                    className={`session-tab${isActive ? " session-tab--active" : ""}`}
                    onClick={() => setActiveSessionId(student.session.id)}
                  >
                    <strong>{student.fullName}</strong>
                    {student.unresolvedCount > 0 ? (
                      <span
                        aria-label={`${student.unresolvedCount} messages awaiting response`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 24,
                          height: 24,
                          padding: "0 7px",
                          borderRadius: 999,
                          background: isActive ? "rgba(26, 115, 232, 0.12)" : "rgba(217, 48, 37, 0.1)",
                          color: isActive ? "var(--blue)" : "var(--red)",
                          fontSize: "0.82rem",
                          fontWeight: 700
                        }}
                      >
                        {student.unresolvedCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {activeStudent.session.status === "READY" ? (
          <section className="panel" style={{ padding: 28 }}>
            <div className="stack-lg" style={{ maxWidth: 920 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <div className="chip">Awaiting psychologist start</div>
                  <h2 style={{ margin: "16px 0 0" }}>{activeStudent.fullName}</h2>
                  <p className="page-subtitle" style={{ marginTop: 10, maxWidth: 700 }}>
                    Instructions are already visible to the student. Start the test when you are ready to open the live mailbox for all released students.
                  </p>
                </div>
                <span className="chip">
                  <TimerReset size={14} />
                  Test will start soon
                </span>
              </div>

              <div className="panel" style={{ padding: 22 }}>
                <div className="stack-md">
                  <div className="admin-tabs" style={{ width: "fit-content" }}>
                    <button
                      type="button"
                      className={`admin-tab${readyInstructionTab === "psychologist" ? " admin-tab--active" : ""}`}
                      onClick={() => setReadyInstructionTab("psychologist")}
                    >
                      Psychologist instructions
                    </button>
                    <button
                      type="button"
                      className={`admin-tab${readyInstructionTab === "student" ? " admin-tab--active" : ""}`}
                      onClick={() => setReadyInstructionTab("student")}
                    >
                      Student instructions
                    </button>
                  </div>
                  <strong>{activeStudent.session.openingTitle}</strong>
                  <div
                    className="muted"
                    dir={
                      readyInstructionTab === "psychologist"
                        ? toDomDir(activeStudent.session.psychologistInstructionsDirection)
                        : toDomDir(activeStudent.session.openingInstructionsDirection)
                    }
                    style={{
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.7,
                      textAlign:
                        readyInstructionTab === "psychologist"
                          ? toTextAlign(activeStudent.session.psychologistInstructionsDirection)
                          : toTextAlign(activeStudent.session.openingInstructionsDirection)
                    }}
                  >
                    {readyInstructionTab === "psychologist"
                      ? activeStudent.session.psychologistInstructions
                      : activeStudent.session.openingInstructions}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <PsychologistWorkspace
            sessionId={activeStudent.session.id}
            studentName={activeStudent.fullName}
            sessionStatus={activeStudent.session.status}
            endsAt={activeStudent.session.endsAt}
            extensionMinutes={activeStudent.session.extensionMinutes}
            openingTitle={activeStudent.session.openingTitle}
            openingInstructions={activeStudent.session.openingInstructions}
            openingInstructionsDirection={activeStudent.session.openingInstructionsDirection}
            psychologistInstructions={activeStudent.session.psychologistInstructions}
            psychologistInstructionsDirection={activeStudent.session.psychologistInstructionsDirection}
            draft={activeStudent.session.draft}
            roles={activeStudent.roles}
            files={activeStudent.files}
            templates={activeStudent.templates}
            messages={activeStudent.session.messages}
          />
        )}
      </div>

      {showForceEndModal
        ? createPortal(
        <div className="modal-backdrop" style={{ zIndex: 80 }}>
          <div className="modal-card" style={{ width: "min(560px, 100%)" }}>
            <div className="stack-md">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Force end session</h2>
                  <p className="muted" style={{ margin: "8px 0 0" }}>
                    This ends the selected student session immediately and cannot be undone.
                  </p>
                </div>
                <button type="button" className="icon-btn" aria-label="Close force end dialog" onClick={() => setShowForceEndModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="panel" style={{ padding: 18, background: "#fff8f7", borderColor: "rgba(217, 48, 37, 0.18)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <AlertTriangle size={18} color="#d93025" style={{ marginTop: 2 }} />
                  <div className="muted" style={{ lineHeight: 1.65 }}>
                    {activeStudent.fullName} will be moved out of the active desk. If there are other prepared or active students, the desk will remain open for them.
                  </div>
                </div>
              </div>

              <ActionForm action={forceEndSessionAction} hideMessages className="stack-md">
                <input type="hidden" name="sessionId" value={activeStudent.session.id} />
                <label
                  className="panel"
                  style={{
                    padding: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer"
                  }}
                >
                  <input type="checkbox" name="confirmForceEnd" required />
                  <span>I understand this session will end immediately and cannot be reopened.</span>
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForceEndModal(false)}>
                    Cancel
                  </button>
                  <ActionSubmitButton label="Force end session" pendingLabel="Ending..." className="btn btn-danger" />
                </div>
              </ActionForm>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

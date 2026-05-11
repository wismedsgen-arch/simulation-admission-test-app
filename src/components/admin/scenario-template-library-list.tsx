"use client";

import { Edit3, Eye, GripVertical, Paperclip, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { DirectionTextareaField } from "@/components/shared/direction-textarea-field";
import { UiSelect } from "@/components/shared/ui-select";
import {
  deleteScenarioTemplateAction,
  deleteScenarioTemplateAttachmentAction,
  reorderPreloadedTemplatesAction,
  updateScenarioTemplateAction
} from "@/lib/actions/admin";

type TextDir = "AUTO" | "LTR" | "RTL";

type Role = { id: string; name: string };

type TemplateItem = {
  id: string;
  roleId: string;
  subject: string;
  body: string;
  bodyDirection: TextDir;
  roleName: string;
  sendOrder: number | null;
  itemCode: string | null;
  schoolAnswer: string | null;
  schoolAnswerDirection: TextDir;
  attachments: Array<{
    id: string;
    fileName: string;
  }>;
};

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function ScenarioTemplateLibraryList({
  scenarioId,
  templates,
  roles,
  emptyMessage,
  reorderable = false
}: {
  scenarioId: string;
  templates: TemplateItem[];
  roles: Role[];
  emptyMessage: string;
  reorderable?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(templates);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setItems(templates);
  }, [templates]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const orderedItems = useMemo(
    () =>
      items.map((item, index) => ({
        ...item,
        sendOrder: reorderable ? index + 1 : item.sendOrder
      })),
    [items, reorderable]
  );

  const previewItem = orderedItems.find((item) => item.id === previewId) ?? null;

  useEffect(() => {
    if (!previewItem) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewItem]);

  async function persistOrder(nextItems: TemplateItem[]) {
    setItems(nextItems);
    setFeedback(null);

    startTransition(async () => {
      const result = await reorderPreloadedTemplatesAction(
        scenarioId,
        nextItems.map((item) => item.id)
      );

      setFeedback(result.error ?? result.success ?? null);
      router.refresh();
    });
  }

  async function deleteTemplate(templateId: string) {
    const template = orderedItems.find((item) => item.id === templateId);

    if (!template || !window.confirm(`Delete "${template.subject}"?`)) {
      return;
    }

    startTransition(async () => {
      const result = await deleteScenarioTemplateAction(templateId, scenarioId);

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      setItems((current) => current.filter((item) => item.id !== templateId));
      setPreviewId((current) => (current === templateId ? null : current));
      setFeedback(result.success ?? "Email template deleted.");
      router.refresh();
    });
  }

  if (orderedItems.length === 0) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="stack-sm">
        {feedback ? (
          <div className="panel" style={{ padding: 14 }}>
            {feedback}
          </div>
        ) : null}
        {orderedItems.map((template, index) => (
          <div
            key={template.id}
            className="panel"
            draggable={reorderable && !pending}
            onDragStart={() => setDraggedId(template.id)}
            onDragOver={(event) => {
              if (reorderable) {
                event.preventDefault();
              }
            }}
            onDrop={() => {
              if (!reorderable || !draggedId || draggedId === template.id) {
                return;
              }

              const fromIndex = orderedItems.findIndex((item) => item.id === draggedId);
              const toIndex = orderedItems.findIndex((item) => item.id === template.id);

              if (fromIndex === -1 || toIndex === -1) {
                return;
              }

              void persistOrder(moveItem(orderedItems, fromIndex, toIndex));
              setDraggedId(null);
            }}
            onDragEnd={() => setDraggedId(null)}
            style={{
              padding: 16,
              opacity: pending ? 0.7 : 1,
              borderColor:
                reorderable && draggedId === template.id ? "rgba(26, 115, 232, 0.34)" : "var(--line)"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                {reorderable ? (
                  <>
                    <div className="chip mono" style={{ minWidth: 54, justifyContent: "center" }}>
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <GripVertical size={18} color="#5f6368" />
                  </>
                ) : null}
                <div className="stack-sm" style={{ gap: 4, minWidth: 0 }}>
                  <strong style={{ wordBreak: "break-word" }}>{template.subject}</strong>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="muted">{template.roleName}</span>
                    {template.attachments.length > 0 ? (
                      <span className="chip">
                        <Paperclip size={14} />
                        {template.attachments.length}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {reorderable ? (
                  <span className="chip">{pending ? "Saving..." : "Drag to reorder"}</span>
                ) : null}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit answer and criteria for ${template.subject}`}
                  title="Edit school answer & criteria"
                  onClick={() => setEditingId((current) => (current === template.id ? null : template.id))}
                >
                  <Edit3 size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Preview ${template.subject}`}
                  onClick={() => setPreviewId(template.id)}
                >
                  <Eye size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  aria-label={`Delete ${template.subject}`}
                  onClick={() => void deleteTemplate(template.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {editingId === template.id ? (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <ActionForm
                  action={updateScenarioTemplateAction}
                  onSuccess={() => setEditingId(null)}
                >
                  <input type="hidden" name="templateId" value={template.id} />
                  <input type="hidden" name="scenarioId" value={scenarioId} />
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor={`role-${template.id}`}>Sender role</label>
                      <UiSelect
                        id={`role-${template.id}`}
                        name="roleId"
                        defaultValue={template.roleId}
                        options={roles.map((role) => ({ value: role.id, label: role.name }))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`subject-${template.id}`}>Subject</label>
                      <input
                        id={`subject-${template.id}`}
                        name="subject"
                        defaultValue={template.subject}
                        required
                      />
                    </div>
                    <DirectionTextareaField
                      id={`body-${template.id}`}
                      name="body"
                      directionName="bodyDirection"
                      defaultValue={template.body}
                      defaultDirection={template.bodyDirection}
                      required
                      label={<label htmlFor={`body-${template.id}`}>Body</label>}
                    />
                    <div className="field">
                      <label htmlFor={`item-code-${template.id}`}>Item code</label>
                      <input
                        id={`item-code-${template.id}`}
                        name="itemCode"
                        defaultValue={template.itemCode ?? ""}
                        placeholder="Optional short label, e.g. A or 3b"
                        maxLength={40}
                      />
                      <span className="field-hint">Shown next to the candidate&apos;s reply in review and reports.</span>
                    </div>
                    <DirectionTextareaField
                      id={`school-answer-${template.id}`}
                      name="schoolAnswer"
                      directionName="schoolAnswerDirection"
                      defaultValue={template.schoolAnswer ?? ""}
                      defaultDirection={template.schoolAnswerDirection}
                      label={<label htmlFor={`school-answer-${template.id}`}>School answer &amp; evaluation criteria (psychologist-only)</label>}
                      placeholder="Reference answer and evaluation notes the psychologist sees alongside the candidate's reply."
                    />
                    {template.attachments.length > 0 ? (
                      <div className="field">
                        <label>Existing attachments</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {template.attachments.map((attachment) => (
                            <div key={attachment.id} style={{ display: "flex", alignItems: "center", gap: 6 }} className="chip">
                              <Paperclip size={13} />
                              {attachment.fileName}
                              <button
                                type="button"
                                aria-label={`Remove ${attachment.fileName}`}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", color: "#d93025" }}
                                onClick={() => {
                                  if (!window.confirm(`Remove "${attachment.fileName}"?`)) return;
                                  startTransition(async () => {
                                    const result = await deleteScenarioTemplateAttachmentAction(attachment.id, scenarioId);
                                    setFeedback(result.error ?? result.success ?? null);
                                    router.refresh();
                                  });
                                }}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="field">
                      <label htmlFor={`attachments-${template.id}`}>Add attachments</label>
                      <input id={`attachments-${template.id}`} name="attachments" type="file" multiple />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <ActionSubmitButton
                      label="Save changes"
                      pendingLabel="Saving..."
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {mounted && previewItem
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="template-preview-title">
              <div className="modal-card">
                <div className="mail-preview">
                  <div className="mail-preview__toolbar">
                    <div className="stack-sm" style={{ gap: 6 }}>
                      <h2 id="template-preview-title" style={{ margin: 0 }}>
                        Email preview
                      </h2>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span className="chip">{previewItem.roleName}</span>
                        {reorderable && previewItem.sendOrder ? (
                          <span className="chip mono">Order {String(previewItem.sendOrder).padStart(2, "0")}</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Close preview"
                      onClick={() => setPreviewId(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="mail-preview__sheet">
                    <div className="mail-preview__fields">
                      <div className="mail-preview__row">
                        <div className="mail-preview__label">From</div>
                        <div className="mail-preview__value">{previewItem.roleName}</div>
                      </div>
                      <div className="mail-preview__row">
                        <div className="mail-preview__label">Subject</div>
                        <div className="mail-preview__value">{previewItem.subject}</div>
                      </div>
                    </div>
                    <div className="mail-preview__body">{previewItem.body}</div>
                  </div>

                  {previewItem.attachments.length > 0 ? (
                    <div className="stack-sm">
                      <strong>Attachments</strong>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {previewItem.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={`/api/attachments/${attachment.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="chip"
                          >
                            <Paperclip size={14} />
                            {attachment.fileName}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="muted">No attachments.</div>
                  )}

                  {previewItem.itemCode || previewItem.schoolAnswer ? (
                    <div
                      style={{
                        borderTop: "1px solid var(--line)",
                        paddingTop: 14,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10
                      }}
                    >
                      {previewItem.itemCode ? (
                        <div>
                          <div className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                            Item code
                          </div>
                          <span className="chip mono">{previewItem.itemCode}</span>
                        </div>
                      ) : null}
                      {previewItem.schoolAnswer ? (
                        <div>
                          <div className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                            School answer &amp; evaluation criteria
                          </div>
                          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                            {previewItem.schoolAnswer}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

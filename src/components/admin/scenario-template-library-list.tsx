"use client";

import { Eye, GripVertical, Paperclip, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import {
  deleteScenarioTemplateAction,
  reorderPreloadedTemplatesAction
} from "@/lib/actions/admin";

type TemplateItem = {
  id: string;
  subject: string;
  body: string;
  roleName: string;
  sendOrder: number | null;
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
  emptyMessage,
  reorderable = false
}: {
  scenarioId: string;
  templates: TemplateItem[];
  emptyMessage: string;
  reorderable?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(templates);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
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
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

"use client";

import { GripVertical } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { reorderPreloadedTemplatesAction } from "@/lib/actions/admin";

type TemplateItem = {
  id: string;
  subject: string;
  roleName: string;
  sendOrder: number;
};

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function PreloadedTemplateOrder({
  scenarioId,
  templates
}: {
  scenarioId: string;
  templates: TemplateItem[];
}) {
  const [items, setItems] = useState(templates);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const orderedItems = useMemo(
    () =>
      items.map((item, index) => ({
        ...item,
        sendOrder: index + 1
      })),
    [items]
  );

  async function persist(nextItems: TemplateItem[]) {
    setItems(nextItems);
    setFeedback(null);

    startTransition(async () => {
      const result = await reorderPreloadedTemplatesAction(
        scenarioId,
        nextItems.map((item) => item.id)
      );

      setFeedback(result.error ?? result.success ?? null);
    });
  }

  if (orderedItems.length === 0) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        No preloaded emails yet.
      </div>
    );
  }

  return (
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
          draggable={!pending}
          onDragStart={() => setDraggedId(template.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (!draggedId || draggedId === template.id) {
              return;
            }

            const fromIndex = orderedItems.findIndex((item) => item.id === draggedId);
            const toIndex = orderedItems.findIndex((item) => item.id === template.id);

            if (fromIndex === -1 || toIndex === -1) {
              return;
            }

            void persist(moveItem(orderedItems, fromIndex, toIndex));
            setDraggedId(null);
          }}
          onDragEnd={() => setDraggedId(null)}
          style={{
            padding: 16,
            borderColor:
              draggedId === template.id ? "rgba(26, 115, 232, 0.34)" : "var(--line)",
            opacity: pending ? 0.7 : 1
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
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                className="chip mono"
                style={{ minWidth: 54, justifyContent: "center" }}
              >
                {String(index + 1).padStart(2, "0")}
              </div>
              <GripVertical size={18} color="#5f6368" />
              <div className="stack-sm" style={{ gap: 4 }}>
                <strong>{template.subject}</strong>
                <span className="muted">{template.roleName}</span>
              </div>
            </div>
            <span className="chip">{pending ? "Saving..." : "Drag to reorder"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

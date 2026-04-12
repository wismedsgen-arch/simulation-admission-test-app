"use client";

import { useEffect, useRef, useState } from "react";

import { toDomDir, toTextAlign } from "@/lib/utils";

export function RoleHoverCard({
  name,
  category,
  accentColor,
  description,
  descriptionDirection,
  selected,
  onSelect
}: {
  name: string;
  category: string;
  accentColor: string;
  description?: string | null;
  descriptionDirection?: string | null;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="role-hover-card"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="panel"
        onClick={() => {
          onSelect?.();
          setOpen((current) => !current);
        }}
        style={{
          width: "100%",
          padding: 12,
          textAlign: "left",
          borderColor: selected ? "rgba(26, 115, 232, 0.28)" : "var(--line)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: accentColor }} />
          <div>
            <strong style={{ display: "block" }}>{name}</strong>
            <span className="muted" style={{ fontSize: "0.9rem" }}>
              {category}
            </span>
          </div>
        </div>
      </button>

      {open ? (
        <div className="role-hover-card__popup">
          <strong style={{ display: "block", marginBottom: 8 }}>{name}</strong>
          <div
            className="muted"
            dir={toDomDir(descriptionDirection)}
            style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, textAlign: toTextAlign(descriptionDirection) }}
          >
            {description || "No role description has been added yet."}
          </div>
        </div>
      ) : null}
    </div>
  );
}

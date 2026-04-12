"use client";

import { Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function InfoTip({ text }: { text: string }) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
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

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="info-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="icon-btn info-tip__button"
        aria-label={text}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={16} />
      </button>
      {open ? (
        <span className="info-tip__popup" role="tooltip">
          <span>{text}</span>
          <button
            type="button"
            className="icon-btn info-tip__close"
            aria-label="Close info"
            onClick={() => setOpen(false)}
          >
            <X size={12} />
          </button>
        </span>
      ) : null}
    </span>
  );
}

"use client";

import { useMemo, useState } from "react";

import { TextDirectionToggle } from "@/components/shared/text-direction-toggle";
import { toDomDir } from "@/lib/utils";

type Props = {
  id: string;
  name: string;
  directionName: string;
  label: React.ReactNode;
  defaultValue?: string;
  defaultDirection?: "AUTO" | "LTR" | "RTL";
  placeholder?: string;
  required?: boolean;
  minHeight?: number;
};

export function DirectionTextareaField({
  id,
  name,
  directionName,
  label,
  defaultValue = "",
  defaultDirection = "AUTO",
  placeholder,
  required,
  minHeight
}: Props) {
  const [direction, setDirection] = useState<"AUTO" | "LTR" | "RTL">(defaultDirection);
  const dir = useMemo(() => toDomDir(direction), [direction]);

  return (
    <div className="field">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>{label}</div>
        <TextDirectionToggle value={direction} onChange={setDirection} />
      </div>
      <input type="hidden" name={directionName} value={direction} />
      <textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        dir={dir}
        style={minHeight ? { minHeight } : undefined}
      />
    </div>
  );
}

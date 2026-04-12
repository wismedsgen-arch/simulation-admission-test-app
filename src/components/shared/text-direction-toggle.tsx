"use client";

type Props = {
  value: "AUTO" | "LTR" | "RTL";
  onChange: (value: "AUTO" | "LTR" | "RTL") => void;
};

const OPTIONS: Array<{ value: "AUTO" | "LTR" | "RTL"; label: string }> = [
  { value: "AUTO", label: "Auto" },
  { value: "LTR", label: "Left" },
  { value: "RTL", label: "Right" }
];

export function TextDirectionToggle({ value, onChange }: Props) {
  return (
    <div className="direction-toggle" role="group" aria-label="Text direction">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`direction-toggle__option${value === option.value ? " direction-toggle__option--active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

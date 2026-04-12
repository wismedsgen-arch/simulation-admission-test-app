"use client";

import { ChevronDown, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Option = {
  value: string;
  label: string;
};

type UiSelectProps = {
  id?: string;
  name?: string;
  options: Option[];
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

export function UiSelect({
  id,
  name,
  options,
  value,
  defaultValue,
  required,
  disabled,
  onChange
}: UiSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const currentValue = value ?? internalValue;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === currentValue) ?? options[0] ?? null,
    [currentValue, options]
  );

  useEffect(() => {
    if (value !== undefined) {
      return;
    }

    setInternalValue((current) => {
      if (current && options.some((option) => option.value === current)) {
        return current;
      }

      return defaultValue ?? options[0]?.value ?? "";
    });
  }, [defaultValue, options, value]);

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

  function selectValue(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`ui-select${open ? " ui-select--open" : ""}${disabled ? " ui-select--disabled" : ""}`}>
      {name ? <input type="hidden" name={name} value={currentValue} required={required} /> : null}
      <button
        id={id}
        type="button"
        className="ui-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`ui-select__label${selectedOption ? "" : " ui-select__label--placeholder"}`}>
          {selectedOption?.label ?? "Select"}
        </span>
        <ChevronDown size={18} className="ui-select__icon" strokeWidth={2.2} />
      </button>

      {open ? (
        <div className="ui-select__menu" role="listbox">
          {options.map((option) => {
            const isSelected = option.value === currentValue;

            return (
              <button
                key={option.value}
                type="button"
                className={`ui-select__option${isSelected ? " ui-select__option--selected" : ""}`}
                onClick={() => selectValue(option.value)}
                role="option"
                aria-selected={isSelected}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={16} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

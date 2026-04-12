"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  pendingLabel?: string;
  className?: string;
};

export function ActionSubmitButton({
  label,
  pendingLabel = "Working...",
  className = "btn btn-primary"
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? <Loader2 size={16} className="spin" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}

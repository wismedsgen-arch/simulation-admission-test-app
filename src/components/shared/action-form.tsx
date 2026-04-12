"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

type ActionResult = {
  error?: string;
  success?: string;
};

type Props = {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  hideMessages?: boolean;
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
};

const initialState: ActionResult = {};

export function ActionForm({
  action,
  children,
  className = "stack-md",
  hideMessages = false,
  onSuccess,
  resetOnSuccess = false
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, initialState);
  const previousStateRef = useRef<ActionResult>(initialState);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (state !== previousStateRef.current && state.success) {
      if (resetOnSuccess) {
        formRef.current?.reset();
      }
      onSuccess?.();
      router.refresh();
    }

    previousStateRef.current = state;
  }, [onSuccess, router, state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {!hideMessages && state.error ? (
        <div
          className="panel"
          style={{
            padding: 14,
            borderColor: "rgba(217, 48, 37, 0.22)",
            color: "#d93025",
            background: "#fff6f5"
          }}
        >
          {state.error}
        </div>
      ) : null}
      {!hideMessages && state.success ? (
        <div
          className="panel"
          style={{
            padding: 14,
            borderColor: "rgba(52, 168, 83, 0.22)",
            color: "#137333",
            background: "#f2fff5"
          }}
        >
          {state.success}
        </div>
      ) : null}
      {children}
    </form>
  );
}

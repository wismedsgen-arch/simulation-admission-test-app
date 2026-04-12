"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { logoutAction } from "@/lib/actions/auth";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        startTransition(async () => {
          await logoutAction();
        });
      }}
      disabled={pending}
    >
      <LogOut size={16} />
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}

import { type ReactNode } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";

export function PsychologistShell({
  children,
  active,
  title = "Psychologist workspace",
  subtitle = "Manage the Weizmann Mail session flow for active and completed student exercises."
}: {
  children: ReactNode;
  active: "pool" | "sessions" | "review";
  title?: string;
  subtitle?: string;
}) {
  return (
    <DashboardShell
      title={title}
      subtitle={subtitle}
      actorLabel="Psychologist workspace"
      navItems={[
        { href: "/psychologist", label: "Waiting pool", active: active === "pool" },
        { href: "/psychologist/sessions", label: "Session desk", active: active === "sessions" },
        { href: "/review", label: "Completed review", active: active === "review" }
      ]}
    >
      {children}
    </DashboardShell>
  );
}

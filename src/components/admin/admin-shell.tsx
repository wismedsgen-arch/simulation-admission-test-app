import { type ReactNode } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";

export function AdminShell({
  title,
  subtitle,
  active,
  children
}: {
  title: string;
  subtitle: string;
  active: "overview" | "scenarios" | "cycles";
  children: ReactNode;
}) {
  return (
    <DashboardShell
      title={title}
      subtitle={subtitle}
      actorLabel="Admin workspace"
      navItems={[
        { href: "/admin", label: "Overview", active: active === "overview" },
        {
          href: "/admin/scenarios",
          label: "Scenarios",
          active: active === "scenarios"
        },
        {
          href: "/admin/exam-cycles",
          label: "Exams",
          active: active === "cycles"
        }
      ]}
    >
      {children}
    </DashboardShell>
  );
}

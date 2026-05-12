import { type ReactNode } from "react";
import { Landmark, Sparkles } from "lucide-react";

import { AppLogo } from "@/components/shared/app-logo";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { DashboardSidebar, type DashboardNavItem } from "@/components/layout/dashboard-sidebar";

export function DashboardShell({
  title,
  subtitle,
  actorLabel,
  navItems,
  children
}: {
  title: string;
  subtitle: string;
  actorLabel: string;
  navItems: DashboardNavItem[];
  children: ReactNode;
}) {
  return (
    <main className="page-shell">
      <div className="glass" style={{ borderRadius: 36, overflow: "hidden" }}>
        <header
          style={{
            padding: 18,
            borderBottom: "1px solid var(--line)",
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 18
          }}
        >
          <AppLogo compact />
          <div
            className="chip"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 42,
              justifySelf: "start"
            }}
          >
            <Landmark size={14} />
            The Miriam and Aaron Gutwirth MD-PhD Program
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="chip">
              <Sparkles size={14} />
              {actorLabel}
            </div>
            <SignOutButton />
          </div>
        </header>
        <div className="dashboard-body">
          <DashboardSidebar navItems={navItems} />
          <section style={{ padding: 24, minWidth: 0 }}>
            <div className="page-header">
              <div>
                <h1 className="page-title">{title}</h1>
                <p className="page-subtitle">{subtitle}</p>
              </div>
            </div>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}

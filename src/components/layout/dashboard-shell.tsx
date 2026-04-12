import Link from "next/link";
import { type ReactNode } from "react";
import { Landmark, Sparkles } from "lucide-react";

import { AppLogo } from "@/components/shared/app-logo";
import { SignOutButton } from "@/components/shared/sign-out-button";

type NavItem = {
  href: string;
  label: string;
  active?: boolean;
};

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
  navItems: NavItem[];
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px minmax(0, 1fr)",
            minHeight: "calc(100vh - 170px)"
          }}
        >
          <aside
            style={{
              padding: 18,
              borderRight: "1px solid var(--line)",
              background: "linear-gradient(180deg, rgba(248,250,253,0.96), rgba(245,248,252,0.82))"
            }}
          >
            <nav className="stack-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    minHeight: 50,
                    background: item.active ? "var(--blue-soft)" : "transparent",
                    color: item.active ? "var(--blue)" : "var(--text)",
                    fontWeight: item.active ? 700 : 600
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <section style={{ padding: 24 }}>
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

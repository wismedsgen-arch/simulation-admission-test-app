"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STORAGE_KEY = "ds.sidebar.collapsed";

export type DashboardNavItem = {
  href: string;
  label: string;
  active?: boolean;
};

export function DashboardSidebar({ navItems }: { navItems: DashboardNavItem[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") {
        setCollapsed(true);
      }
    } catch {
      // ignore — fall back to expanded
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
    document.documentElement.dataset.sidebarCollapsed = collapsed ? "1" : "0";
  }, [collapsed, hydrated]);

  return (
    <aside className={`dashboard-sidebar${collapsed ? " dashboard-sidebar--collapsed" : ""}`}>
      <button
        type="button"
        className="dashboard-sidebar__toggle"
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        aria-pressed={collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
      <nav className="stack-sm dashboard-sidebar__nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className="btn dashboard-sidebar__link"
            title={collapsed ? item.label : undefined}
            data-active={item.active ? "true" : "false"}
          >
            <span className="dashboard-sidebar__label">{item.label}</span>
            <span className="dashboard-sidebar__abbrev" aria-hidden="true">
              {item.label.charAt(0)}
            </span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

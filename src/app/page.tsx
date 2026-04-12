import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppLogo } from "@/components/shared/app-logo";
import { hasApprovedAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const adminExists = await hasApprovedAdmin();

  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center" }}>
      <section
        className="glass"
        style={{
          width: "100%",
          maxWidth: 860,
          borderRadius: 36,
          padding: "36px 32px",
          overflow: "hidden",
          position: "relative"
        }}
      >
        <div className="stack-lg" style={{ textAlign: "center" }}>
          <div style={{ display: "grid", justifyItems: "center", gap: 18 }}>
            <AppLogo />
            <div>
              <h1 className="page-title">Welcome to Weizmann Mail</h1>
              <p className="page-subtitle" style={{ marginInline: "auto", maxWidth: 560 }}>
                Student access for the Weizmann Institute of Science admissions exercise.
              </p>
              <div className="chip" style={{ marginTop: 16 }}>
                The Miriam and Aaron Gutwirth MD-PhD Program
              </div>
            </div>
          </div>

          <div
            className="panel"
            style={{
              maxWidth: 520,
              width: "100%",
              margin: "0 auto",
              padding: 24,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,253,0.96))"
            }}
          >
            <div className="stack-md">
              <Link className="btn btn-primary" href="/student/login">
                Student sign in <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {!adminExists ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Link className="btn btn-secondary" href="/setup">
                Initial admin setup
              </Link>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

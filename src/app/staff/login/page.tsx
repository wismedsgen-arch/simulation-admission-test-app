import Link from "next/link";

import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { AppLogo } from "@/components/shared/app-logo";
import { staffLoginAction } from "@/lib/actions/auth";

export default function StaffLoginPage() {
  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center" }}>
      <section className="glass" style={{ width: "100%", maxWidth: 620, padding: 28, borderRadius: 32 }}>
        <div className="stack-lg">
          <AppLogo />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn btn-primary" href="/staff/login">
              Log in
            </Link>
            <Link className="btn btn-secondary" href="/staff/signup">
              Request signup
            </Link>
          </div>
          <div>
            <h1 className="page-title">Staff sign in</h1>
            <p className="page-subtitle">
              Approved psychologists and admins sign in with their full name and password.
            </p>
          </div>
          <ActionForm action={staffLoginAction}>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" name="fullName" required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" required />
              </div>
            </div>
            <ActionSubmitButton label="Sign in" pendingLabel="Signing in..." />
          </ActionForm>
        </div>
      </section>
    </main>
  );
}

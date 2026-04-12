import { redirect } from "next/navigation";

import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { AppLogo } from "@/components/shared/app-logo";
import { bootstrapAdminAction } from "@/lib/actions/auth";
import { hasApprovedAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasApprovedAdmin()) {
    redirect("/staff/login");
  }

  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center" }}>
      <section className="glass" style={{ width: "100%", maxWidth: 640, padding: 28, borderRadius: 32 }}>
        <div className="stack-lg">
          <AppLogo />
          <div>
            <h1 className="page-title">Create the first admin</h1>
            <p className="page-subtitle">
              This setup is only available before the first approved admin exists.
            </p>
          </div>
          <ActionForm action={bootstrapAdminAction}>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" name="fullName" placeholder="Dr. Noa Cohen" required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" placeholder="Minimum 8 characters" required />
              </div>
            </div>
            <ActionSubmitButton label="Create admin workspace" pendingLabel="Creating admin..." />
          </ActionForm>
        </div>
      </section>
    </main>
  );
}

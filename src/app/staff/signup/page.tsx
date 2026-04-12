import Link from "next/link";

import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { AppLogo } from "@/components/shared/app-logo";
import { UiSelect } from "@/components/shared/ui-select";
import { requestStaffSignupAction } from "@/lib/actions/auth";

export default function StaffSignupPage() {
  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center" }}>
      <section className="glass" style={{ width: "100%", maxWidth: 720, padding: 28, borderRadius: 32 }}>
        <div className="stack-lg">
          <AppLogo />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn btn-secondary" href="/staff/login">
              Log in
            </Link>
            <Link className="btn btn-primary" href="/staff/signup">
              Request signup
            </Link>
          </div>
          <div>
            <h1 className="page-title">Request staff access</h1>
            <p className="page-subtitle">
              Staff accounts are created only after an admin review. Use the role you want approved.
            </p>
          </div>
          <ActionForm action={requestStaffSignupAction}>
            <div className="field-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div className="field">
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" name="fullName" required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" required />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="requestedRole">Requested role</label>
                <UiSelect
                  id="requestedRole"
                  name="requestedRole"
                  defaultValue="PSYCHOLOGIST"
                  options={[
                    { value: "PSYCHOLOGIST", label: "Psychologist" },
                    { value: "ADMIN", label: "Admin" }
                  ]}
                />
              </div>
            </div>
            <ActionSubmitButton label="Send request" pendingLabel="Submitting..." />
          </ActionForm>
        </div>
      </section>
    </main>
  );
}

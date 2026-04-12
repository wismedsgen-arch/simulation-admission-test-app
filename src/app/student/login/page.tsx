import { AppLogo } from "@/components/shared/app-logo";

export default async function StudentLoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const error = resolvedSearchParams.error;

  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center" }}>
      <section className="glass" style={{ width: "100%", maxWidth: 640, padding: 28, borderRadius: 32 }}>
        <div className="stack-lg">
          <AppLogo />
          <div>
            <h1 className="page-title">Student access</h1>
            <p className="page-subtitle">
              Sign in using your full name, ID number, and the 4-digit access code provided for your exam.
            </p>
            <div className="chip" style={{ marginTop: 16 }}>
              For the Miriam and Aaron Gutwirth MD-PhD Program at the Weizmann Institute of Science
            </div>
          </div>
          <form action="/student/login/submit" method="post" className="stack-md">
            {error ? (
              <div
                className="panel"
                style={{
                  padding: 14,
                  borderColor: "rgba(217, 48, 37, 0.22)",
                  color: "#d93025",
                  background: "#fff6f5"
                }}
              >
                {decodeURIComponent(error)}
              </div>
            ) : null}
            <div className="field-grid">
              <div className="field">
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" name="fullName" required />
              </div>
              <div className="field">
                <label htmlFor="governmentId">Government ID</label>
                <input id="governmentId" name="governmentId" required />
              </div>
              <div className="field">
                <label htmlFor="accessCode">Access code</label>
                <input id="accessCode" name="accessCode" required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              Enter Weizmann Mail
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

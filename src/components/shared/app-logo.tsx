import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 10 : 14
      }}
    >
      <div
        className="panel"
        style={{
          width: compact ? 42 : 56,
          height: compact ? 42 : 56,
          borderRadius: 18,
          display: "grid",
          placeItems: "center",
          padding: compact ? 7 : 9,
          overflow: "hidden",
          background: "white"
        }}
      >
        <Image
          src="/logos/tree.png"
          alt="Weizmann Mail tree logo"
          width={compact ? 28 : 38}
          height={compact ? 28 : 38}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          priority
        />
      </div>
      <div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            fontSize: compact ? "1rem" : "1.2rem"
          }}
        >
          Weizmann Mail
          <ShieldCheck size={compact ? 16 : 18} color="#1a73e8" />
        </div>
        {!compact ? (
          <div className="muted" style={{ fontSize: "0.9rem", marginTop: 4 }}>
            Weizmann Institute of Science
          </div>
        ) : null}
      </div>
    </div>
  );
}

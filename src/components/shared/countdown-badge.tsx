"use client";

import { useEffect, useMemo, useState } from "react";

function formatRemaining(ms: number) {
  if (ms <= 0) {
    return "Time elapsed";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")} left`;
}

export function CountdownBadge({
  endsAt,
  active = true,
  inactiveLabel = "Session ended"
}: {
  endsAt?: string | null;
  active?: boolean;
  inactiveLabel?: string;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  const label = useMemo(() => {
    if (!active) {
      return inactiveLabel;
    }

    if (!endsAt) {
      return "Awaiting start";
    }

    return formatRemaining(new Date(endsAt).getTime() - now);
  }, [active, endsAt, inactiveLabel, now]);

  return <span className="chip">{label}</span>;
}

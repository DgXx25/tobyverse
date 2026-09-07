"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics/track";

const DAY_KEY = "tv_last_visit_day";
const SESSION_KEY = "tv_session_marked";

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStamp(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

export function AnalyticsSession({
  userId,
  projectId = null,
}: {
  userId: string;
  projectId?: string | null;
}) {
  const spent = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, "1");
      trackEvent({ userId, type: "session_start" });

      const last = localStorage.getItem(DAY_KEY);
      const today = todayStamp();
      if (last === today) {
        trackEvent({ userId, type: "returned_same_day" });
      } else if (last === yesterdayStamp()) {
        trackEvent({ userId, type: "returned_next_day" });
      }
      localStorage.setItem(DAY_KEY, today);
    }

    const tick = window.setInterval(() => {
      spent.current += 60;
      trackEvent({ userId, projectId, type: "time_spent_seconds", value: 60 });
    }, 60_000);

    const flush = () => {
      const extra = Math.round(spent.current % 60);
      if (extra >= 15) {
        trackEvent({ userId, projectId, type: "time_spent_seconds", value: extra });
      }
    };

    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("pagehide", flush);
    };
  }, [projectId, userId]);

  return null;
}

"use client";

import { useEffect } from "react";

/** Counts a real open: 2 seconds with the page visible. Mail scanners never get here. */
export function ViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sent = false;
    const arm = () => {
      if (sent || document.visibilityState !== "visible" || timer) return;
      timer = setTimeout(() => {
        sent = true;
        void fetch(`/api/q/${token}/view`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true }).catch(() => undefined);
      }, 2000);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible" && timer) {
        clearTimeout(timer);
        timer = null;
      }
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
    };
  }, [token]);
  return null;
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { messages } from "@/i18n/it";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: error.message, digest: error.digest, source: "boundary" }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="err-page">
      <div className="err-card">
        <h1>{messages.errors.errorTitle}</h1>
        <p>{messages.errors.errorBody}</p>
        <div className="err-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            {messages.errors.retry}
          </button>
          <Link href="/app/overview">{messages.errors.home}</Link>
        </div>
      </div>
    </main>
  );
}

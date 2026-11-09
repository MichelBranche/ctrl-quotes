"use client";

import { messages } from "@/i18n/it";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <h1>{messages.errors.errorTitle}</h1>
      <p>{messages.errors.errorBody}</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        {messages.errors.retry}
      </button>
    </main>
  );
}

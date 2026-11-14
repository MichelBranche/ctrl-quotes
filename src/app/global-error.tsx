"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: error.message, digest: error.digest, source: "global" }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="it">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui, sans-serif", background: "#f5f5f7", color: "#1a1a1e" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ width: "min(440px, 100%)", padding: 28, background: "#fff", border: "1px solid #ebebef", borderRadius: 20 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 28, letterSpacing: "-0.03em" }}>Errore imprevisto</h1>
            <p style={{ margin: "0 0 16px", color: "#3a3a40", lineHeight: 1.5 }}>L&apos;operazione non è andata a buon fine. Puoi riprovare.</p>
            <button type="button" onClick={reset} style={{ height: 40, padding: "0 16px", border: 0, borderRadius: 10, background: "#7c3aed", color: "#fff", fontWeight: 650, cursor: "pointer" }}>
              Riprova
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}

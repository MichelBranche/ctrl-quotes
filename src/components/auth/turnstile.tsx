"use client";

import { useEffect, useRef } from "react";
import { messages } from "@/i18n/it";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
      script.onerror = () => {
        loader = null;
        reject(new Error("turnstile"));
      };
      document.head.appendChild(script);
    });
  }
  return loader;
}

/**
 * Cloudflare Turnstile widget (light, flexible). It writes its token in the hidden
 * `cf-turnstile-response` field of the surrounding form and reports it through onToken.
 * Changing resetKey (for example the form state after an error) asks for a fresh token.
 */
export function TurnstileWidget({ siteKey, resetKey, onToken }: { siteKey: string; resetKey: unknown; onToken: (token: string | null) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !boxRef.current || idRef.current) return;
        idRef.current = api.render(boxRef.current, {
          sitekey: siteKey,
          theme: "light",
          size: "flexible",
          language: "it",
          appearance: "always",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
          "timeout-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
    };
  }, [siteKey]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (idRef.current && window.turnstile) window.turnstile.reset(idRef.current);
  }, [resetKey]);

  return <div ref={boxRef} className="turnstile-box" role="group" aria-label={messages.auth.captchaLabel} />;
}

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
/** A script that neither loads nor fails (filtering proxy, captive network) counts as blocked after this. */
const SCRIPT_TIMEOUT_MS = 15_000;
let loader: Promise<TurnstileApi> | null = null;

/**
 * What the form needs to know besides the token. "blocked": the Cloudflare script never arrived
 * (adblock, VPN, company network). "failed": the widget ran but Cloudflare refused the visitor; code is
 * the Turnstile error code (for example 600010), useful when someone reports the problem.
 */
export type TurnstileProblem = { kind: "blocked" } | { kind: "failed"; code: string | null };

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const fail = () => {
        window.clearTimeout(timer);
        script.remove();
        loader = null;
        reject(new Error("turnstile"));
      };
      const timer = window.setTimeout(fail, SCRIPT_TIMEOUT_MS);
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timer);
        if (window.turnstile) resolve(window.turnstile);
        else fail();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return loader;
}

/**
 * Cloudflare Turnstile widget (light, flexible). It writes its token in the hidden
 * `cf-turnstile-response` field of the surrounding form and reports it through onToken.
 * Problems (script blocked, challenge refused) go to onProblem so the form can explain them.
 * Changing resetKey (for example the form state after an error) asks for a fresh token;
 * changing attempt mounts the widget again (the "Riprova" button after a problem).
 */
export function TurnstileWidget({
  siteKey,
  resetKey,
  attempt = 0,
  onToken,
  onProblem,
}: {
  siteKey: string;
  resetKey: unknown;
  attempt?: number;
  onToken: (token: string | null) => void;
  onProblem?: (problem: TurnstileProblem) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onProblemRef = useRef(onProblem);

  useEffect(() => {
    onTokenRef.current = onToken;
    onProblemRef.current = onProblem;
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
          retry: "auto",
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": (code?: string | number) => {
            onTokenRef.current(null);
            onProblemRef.current?.({ kind: "failed", code: code === undefined || code === null ? null : String(code) });
          },
          "timeout-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (cancelled) return;
        onTokenRef.current(null);
        onProblemRef.current?.({ kind: "blocked" });
      });
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
    };
  }, [siteKey, attempt]);

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

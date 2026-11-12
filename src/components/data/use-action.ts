"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/result";

/**
 * Runs a server action, keeps a pending flag and reports the outcome with an accessible toast.
 * Errors stay inline as well, so they remain readable after the toast disappears.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T>(action: () => Promise<ActionResult<T>>, onSuccess?: (value: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          if (result.message) toast.success(result.message);
          onSuccess?.(result.value);
        } else {
          setError(result.message);
          toast.error(result.message);
        }
      } catch {
        const message = "Connessione non riuscita. Controlla la rete e riprova.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return { pending, error, setError, run };
}

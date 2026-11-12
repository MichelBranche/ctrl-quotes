import type { Failure, Result } from "@/server/access";

export type ActionResult<T = null> = { ok: true; value: T; message?: string } | { ok: false; message: string };

export function toAction<T>(result: Result<T>, message?: string): ActionResult<T> {
  if (result.ok) return { ok: true, value: result.value, message };
  return { ok: false, message: (result as Failure).message };
}

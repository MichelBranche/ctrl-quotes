"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { ensureMigrated, getDb } from "@/db/client";
import { passwordIssues } from "@/domain/password";
import { taxProfiles } from "@/domain/pricing";
import { messages } from "@/i18n/it";
import { getAuth } from "@/server/auth";
import { writeAuditLog } from "@/server/audit";
import { clientIp } from "@/server/request-meta";
import { previewAutoVerifyEmail } from "@/server/preview-auth";
import { passesCaptcha } from "@/server/turnstile";
import { requireUser, workspaceCookieOptions } from "@/server/session";
import { createWorkspace, getWorkspaceForUser, updateWorkspace } from "@/server/workspaces";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const emailSchema = z.email({ error: "Inserisci un'email valida." });

/** Turnstile gate for the auth actions (no-op when Turnstile env is missing). */
async function captchaOk(formData: FormData): Promise<boolean> {
  const ip = clientIp(await headers());
  return passesCaptcha(formData, ip === "unknown" ? undefined : ip);
}

function fieldError(error: z.ZodError, field: string): string | undefined {
  return error.issues.find((issue) => issue.path[0] === field)?.message;
}

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  await ensureMigrated();
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, { error: "Inserisci la password." }) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: messages.auth.invalidForm };
  if (!(await captchaOk(formData))) return { error: messages.auth.captchaFailed };
  try {
    await getAuth().api.signInEmail({
      body: parsed.data,
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 429) return { error: messages.auth.tooMany };
    if (error instanceof APIError) return { error: messages.auth.invalidLogin };
    throw error;
  }
  redirect("/app/overview");
}

export async function registerAction(_state: FormState, formData: FormData): Promise<FormState> {
  await ensureMigrated();
  const password = String(formData.get("password") ?? "");
  const issues = passwordIssues(password);
  const parsed = z
    .object({
      name: z.string().trim().min(2, { error: "Inserisci nome e cognome." }),
      email: emailSchema,
      terms: z.literal("on", { error: "Devi accettare termini e privacy." }),
    })
    .safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      terms: formData.get("terms"),
    });
  if (!parsed.success || issues.length > 0) {
    return {
      error: messages.auth.invalidForm,
      fieldErrors: {
        name: parsed.success ? "" : (fieldError(parsed.error, "name") ?? ""),
        email: parsed.success ? "" : (fieldError(parsed.error, "email") ?? ""),
        password: issues[0] ?? "",
        terms: parsed.success ? "" : (fieldError(parsed.error, "terms") ?? ""),
      },
    };
  }
  if (!(await captchaOk(formData))) return { error: messages.auth.captchaFailed };
  try {
    await getAuth().api.signUpEmail({
      body: { name: parsed.data.name, email: parsed.data.email, password },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 429) return { error: messages.auth.tooMany };
    redirect(registerNext(parsed.data.email));
  }
  redirect(registerNext(parsed.data.email));
}

function registerNext(email: string): string {
  if (previewAutoVerifyEmail()) return "/check-email";
  return `/verify-email?email=${encodeURIComponent(email)}`;
}

export async function verifyOtpAction(_state: FormState, formData: FormData): Promise<FormState> {
  await ensureMigrated();
  const email = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  const otp = String(formData.get("otp") ?? "").replace(/\D/g, "");
  if (!email.success) return { error: messages.auth.missingEmail };
  if (otp.length !== 6) return { error: messages.auth.invalidCode };
  try {
    await getAuth().api.verifyEmailOTP({
      body: { email: email.data, otp },
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 429) return { error: messages.auth.tooManyCodes };
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "TOO_MANY_ATTEMPTS") return { error: messages.auth.tooManyCodes };
    return { error: messages.auth.invalidCode };
  }
  redirect("/login?verified=1");
}

export async function resendVerificationOtpAction(emailValue: string): Promise<FormState> {
  await ensureMigrated();
  const email = emailSchema.safeParse(emailValue.trim());
  if (!email.success) return { error: messages.auth.missingEmail };
  if (previewAutoVerifyEmail()) return {};
  try {
    await getAuth().api.sendVerificationOTP({
      body: { email: email.data, type: "email-verification" },
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 429) return { error: messages.auth.tooManyCodes };
    return { error: messages.auth.tooManyCodes };
  }
  return {};
}

export async function forgotAction(_state: FormState, formData: FormData): Promise<FormState> {
  await ensureMigrated();
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Inserisci un'email valida." };
  if (!(await captchaOk(formData))) return { error: messages.auth.captchaFailed };
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  try {
    await getAuth().api.requestPasswordReset({
      body: { email: parsed.data, redirectTo: `${base}/reset-password` },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 429) return { error: messages.auth.tooMany };
  }
  redirect("/check-email?kind=reset");
}

export async function resetAction(_state: FormState, formData: FormData): Promise<FormState> {
  await ensureMigrated();
  const password = String(formData.get("password") ?? "");
  const token = String(formData.get("token") ?? "");
  const issues = passwordIssues(password);
  if (!token || issues.length > 0) return { error: issues[0] ?? "Link non valido." };
  if (!(await captchaOk(formData))) return { error: messages.auth.captchaFailed };
  try {
    await getAuth().api.resetPassword({
      body: { newPassword: password, token },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) return { error: "Il link non è valido o è scaduto." };
    throw error;
  }
  redirect("/login?reset=1");
}

export async function logoutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function createWorkspaceAction(_state: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const parsed = z
    .object({
      name: z.string().trim().min(2, { error: "Il nome è troppo corto." }).max(80),
      taxProfile: z.enum(taxProfiles),
    })
    .safeParse({ name: formData.get("name"), taxProfile: formData.get("taxProfile") });
  if (!parsed.success) return { error: messages.auth.invalidForm };
  const workspace = await createWorkspace(getDb(), {
    userId: session.user.id,
    name: parsed.data.name,
    taxProfile: parsed.data.taxProfile,
  });
  await writeAuditLog(getDb(), {
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    action: "workspace.created",
    entityType: "workspace",
    entityId: workspace.id,
  });
  const jar = await cookies();
  jar.set("cq_workspace", workspace.id, await workspaceCookieOptions());
  redirect("/app/overview");
}

export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const session = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const workspace = await getWorkspaceForUser(getDb(), session.user.id, workspaceId);
  if (!workspace) redirect("/app/overview");
  const jar = await cookies();
  jar.set("cq_workspace", workspace.id, await workspaceCookieOptions());
  redirect("/app/overview");
}

export async function updateWorkspaceAction(_state: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const result = await updateWorkspace(getDb(), {
    userId: session.user.id,
    workspaceId,
    name: String(formData.get("name") ?? ""),
  });
  if (!result.ok && result.error === "forbidden") return { error: messages.settings.memberHint };
  if (!result.ok) return { error: messages.errors.notFoundBody };
  await writeAuditLog(getDb(), {
    workspaceId,
    actorUserId: session.user.id,
    action: "workspace.updated",
    entityType: "workspace",
    entityId: workspaceId,
  });
  return { error: undefined, fieldErrors: { saved: messages.settings.saved } };
}

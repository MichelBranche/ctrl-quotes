"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { messages } from "@/i18n/it";
import { AuthSubmit } from "@/components/auth/auth-submit";
import { GoogleSignIn } from "@/components/auth/google-button";
import { TurnstileWidget } from "@/components/auth/turnstile";
import { PasswordField, TextField } from "@/components/ui/fields";
import { forgotAction, loginAction, registerAction, resetAction, type FormState } from "@/server/actions";

const initial: FormState = {};

export type AuthUi = { google: boolean; turnstileSiteKey: string | null };

/**
 * Turnstile for one form. The token counts only for the form state it was issued in:
 * after an error the action returns a new state, the widget resets and the submit waits for a fresh token.
 */
function useCaptcha(siteKey: string | null, state: FormState): { widget: ReactNode; ready: boolean } {
  const [captcha, setCaptcha] = useState<{ token: string; state: FormState } | null>(null);
  if (!siteKey) return { widget: null, ready: true };
  const ready = Boolean(captcha && captcha.state === state && captcha.token);
  return {
    ready,
    widget: <TurnstileWidget siteKey={siteKey} resetKey={state} onToken={(token) => setCaptcha(token ? { token, state } : null)} />,
  };
}

export function LoginForm({ ui }: { ui: AuthUi }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  const captcha = useCaptcha(ui.turnstileSiteKey, state);
  return (
    <>
      <h1>{messages.auth.loginTitle}</h1>
      <p className="lede">{messages.auth.loginSubtitle}</p>
      {ui.google ? <GoogleSignIn /> : null}
      <form action={action} className="stack">
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <TextField label={messages.auth.email} name="email" type="email" autoComplete="email" required placeholder={messages.auth.emailPlaceholder} icon="mail" />
        <PasswordField label={messages.auth.password} name="password" autoComplete="current-password" required minLength={8} />
        <div className="auth-forgot">
          <Link href="/forgot-password">{messages.auth.forgot}</Link>
        </div>
        {captcha.widget}
        <AuthSubmit loading={pending} disabled={!captcha.ready}>
          {messages.auth.submitLogin} →
        </AuthSubmit>
      </form>
    </>
  );
}

export function RegisterForm({ ui }: { ui: AuthUi }) {
  const [state, action, pending] = useActionState(registerAction, initial);
  const captcha = useCaptcha(ui.turnstileSiteKey, state);
  return (
    <>
      <h1>{messages.auth.registerTitle}</h1>
      <p className="lede">{messages.auth.registerSubtitle}</p>
      {ui.google ? <GoogleSignIn note="Continuando con Google accetti i termini e la privacy policy." /> : null}
      <form action={action} className="stack">
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <TextField label={messages.auth.name} name="name" autoComplete="name" required placeholder={messages.auth.namePlaceholder} icon="user" error={state.fieldErrors?.name || undefined} />
        <TextField label={messages.auth.email} name="email" type="email" autoComplete="email" required placeholder={messages.auth.emailPlaceholder} icon="mail" error={state.fieldErrors?.email || undefined} />
        <PasswordField label={messages.auth.password} name="password" autoComplete="new-password" required minLength={8} hint={state.fieldErrors?.password || messages.auth.passwordHint} />
        <label className="checkline">
          <input type="checkbox" name="terms" required />
          <span>
            Accetto i <Link href="/terms">{messages.auth.termsLink}</Link> e la <Link href="/privacy">{messages.auth.privacyLink}</Link>
          </span>
        </label>
        {state.fieldErrors?.terms ? <p className="field-error">{state.fieldErrors.terms}</p> : null}
        {captcha.widget}
        <AuthSubmit loading={pending} disabled={!captcha.ready}>
          {messages.auth.submitRegister} →
        </AuthSubmit>
      </form>
    </>
  );
}

export function ForgotForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, action, pending] = useActionState(forgotAction, initial);
  const captcha = useCaptcha(turnstileSiteKey, state);
  return (
    <>
      <h1>{messages.auth.forgotTitle}</h1>
      <p className="lede">{messages.auth.forgotSubtitle}</p>
      <form action={action} className="stack">
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <TextField label={messages.auth.email} name="email" type="email" autoComplete="email" required icon="mail" />
        {captcha.widget}
        <AuthSubmit loading={pending} disabled={!captcha.ready}>
          {messages.auth.sendLink}
        </AuthSubmit>
      </form>
      <p><Link href="/login">{messages.auth.backLogin}</Link></p>
    </>
  );
}

export function ResetForm({ token, turnstileSiteKey }: { token: string; turnstileSiteKey: string | null }) {
  const [state, action, pending] = useActionState(resetAction, initial);
  const captcha = useCaptcha(turnstileSiteKey, state);
  return (
    <>
      <h1>{messages.auth.resetTitle}</h1>
      <p className="lede">{messages.auth.resetSubtitle}</p>
      <form action={action} className="stack">
        <input type="hidden" name="token" value={token} />
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <PasswordField label={messages.auth.newPassword} name="password" autoComplete="new-password" required minLength={8} hint={messages.auth.passwordHint} />
        {captcha.widget}
        <AuthSubmit loading={pending} disabled={!captcha.ready}>
          {messages.auth.savePassword}
        </AuthSubmit>
      </form>
    </>
  );
}

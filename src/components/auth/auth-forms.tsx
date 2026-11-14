"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { messages } from "@/i18n/it";
import { AuthSubmit } from "@/components/auth/auth-submit";
import { GoogleSignIn } from "@/components/auth/google-button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { TurnstileWidget } from "@/components/auth/turnstile";
import { PasswordField, TextField } from "@/components/ui/fields";
import { forgotAction, loginAction, registerAction, resetAction, type FormState } from "@/server/actions";

const initial: FormState = {};

export type AuthUi = { google: boolean; turnstileSiteKey: string | null };
export type AuthTab = "login" | "register";

/**
 * Turnstile for one form. The token counts only for the reset key it was issued with:
 * after an error the action returns a new state, the widget resets and the submit waits for a fresh token.
 */
function useCaptcha(siteKey: string | null, resetKey: unknown): { widget: ReactNode; ready: boolean } {
  const [captcha, setCaptcha] = useState<{ token: string; key: unknown } | null>(null);
  if (!siteKey) return { widget: null, ready: true };
  const ready = Boolean(captcha && captcha.key === resetKey && captcha.token);
  return {
    ready,
    widget: <TurnstileWidget siteKey={siteKey} resetKey={resetKey} onToken={(token) => setCaptcha(token ? { token, key: resetKey } : null)} />,
  };
}

export function AuthSessionForm({
  tab,
  ui,
  notice,
  swap,
}: {
  tab: AuthTab;
  ui: AuthUi;
  notice?: ReactNode;
  swap: (login: ReactNode, register: ReactNode) => ReactNode;
}) {
  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, initial);
  const [registerState, registerFormAction, registerPending] = useActionState(registerAction, initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const prev = useRef({ loginState, registerState });

  useEffect(() => {
    if (tab === "login" && loginState !== prev.current.loginState) setCaptchaReset((value) => value + 1);
    if (tab === "register" && registerState !== prev.current.registerState) setCaptchaReset((value) => value + 1);
    prev.current = { loginState, registerState };
  }, [loginState, registerState, tab]);

  const state = tab === "login" ? loginState : registerState;
  const pending = tab === "login" ? loginPending : registerPending;
  const captcha = useCaptcha(ui.turnstileSiteKey, captchaReset);

  return (
    <form action={tab === "login" ? loginFormAction : registerFormAction} className="stack auth-session">
      {swap(
        <>
          <h1>{messages.auth.loginTitle}</h1>
          <p className="lede">{messages.auth.loginSubtitle}</p>
          {notice}
          {ui.google ? <GoogleSignIn /> : null}
          {loginState.error ? <p className="alert" role="alert">{loginState.error}</p> : null}
          <TextField label={messages.auth.email} name="email" type="email" autoComplete="email" required placeholder={messages.auth.emailPlaceholder} icon="mail" value={email} onChange={(event) => setEmail(event.target.value)} />
          <PasswordField label={messages.auth.password} name="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          <div className="auth-forgot">
            <Link href="/forgot-password">{messages.auth.forgot}</Link>
          </div>
        </>,
        <>
          <h1>{messages.auth.registerTitle}</h1>
          <p className="lede">{messages.auth.registerSubtitle}</p>
          {ui.google ? <GoogleSignIn note="Continuando con Google accetti i termini e la privacy policy." /> : null}
          {registerState.error ? <p className="alert" role="alert">{registerState.error}</p> : null}
          <TextField label={messages.auth.name} name="name" autoComplete="name" required placeholder={messages.auth.namePlaceholder} icon="user" value={name} onChange={(event) => setName(event.target.value)} error={registerState.fieldErrors?.name || undefined} />
          <TextField label={messages.auth.email} name="email" type="email" autoComplete="email" required placeholder={messages.auth.emailPlaceholder} icon="mail" value={email} onChange={(event) => setEmail(event.target.value)} error={registerState.fieldErrors?.email || undefined} />
          <PasswordField label={messages.auth.password} name="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} error={registerState.fieldErrors?.password || undefined} />
          <PasswordStrengthMeter value={password} />
          <label className="checkline">
            <input type="checkbox" name="terms" required={tab === "register"} />
            <span>
              Accetto i <Link href="/terms">{messages.auth.termsLink}</Link> e la <Link href="/privacy">{messages.auth.privacyLink}</Link>
            </span>
          </label>
          {registerState.fieldErrors?.terms ? <p className="field-error">{registerState.fieldErrors.terms}</p> : null}
        </>,
      )}
      {captcha.widget}
      <AuthSubmit loading={pending} disabled={!captcha.ready}>
        {tab === "login" ? messages.auth.submitLogin : messages.auth.submitRegister} →
      </AuthSubmit>
    </form>
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

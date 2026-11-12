"use client";

import { useActionState } from "react";
import { createAuthClient } from "better-auth/react";
import Link from "next/link";
import { messages } from "@/i18n/it";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/fields";
import { forgotAction, loginAction, registerAction, resetAction, type FormState } from "@/server/actions";

const initial: FormState = {};
const authClient = createAuthClient();

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <>
      <h1>{messages.auth.loginTitle}</h1>
      <p className="lede">{messages.auth.loginSubtitle}</p>
      <form action={action} className="stack">
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <TextField label={messages.auth.email} name="email" type="email" autoComplete="email" required placeholder={messages.auth.emailPlaceholder} icon="mail" />
        <PasswordField label={messages.auth.password} name="password" autoComplete="current-password" required minLength={8} />
        <div style={{ textAlign: "right" }}>
          <Link href="/forgot-password">{messages.auth.forgot}</Link>
        </div>
        <Button type="submit" pill loading={pending}>
          {messages.auth.submitLogin} →
        </Button>
      </form>
      <GoogleBlock enabled={googleEnabled} />
      <p>
        {messages.auth.noAccount} <Link href="/register">{messages.auth.registerLink}</Link>
      </p>
    </>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(registerAction, initial);
  return (
    <>
      <h1>{messages.auth.registerTitle}</h1>
      <p className="lede">{messages.auth.registerSubtitle}</p>
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
        <Button type="submit" pill loading={pending}>
          {messages.auth.submitRegister} →
        </Button>
      </form>
      <GoogleBlock enabled={googleEnabled} />
      <p>
        {messages.auth.hasAccount} <Link href="/login">{messages.auth.loginLink}</Link>
      </p>
    </>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, initial);
  return (
    <>
      <h1>{messages.auth.forgotTitle}</h1>
      <p className="lede">{messages.auth.forgotSubtitle}</p>
      <form action={action} className="stack">
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <TextField label={messages.auth.email} name="email" type="email" autoComplete="email" required icon="mail" />
        <Button type="submit" pill loading={pending}>{messages.auth.sendLink}</Button>
      </form>
      <p><Link href="/login">{messages.auth.backLogin}</Link></p>
    </>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetAction, initial);
  return (
    <>
      <h1>{messages.auth.resetTitle}</h1>
      <p className="lede">{messages.auth.resetSubtitle}</p>
      <form action={action} className="stack">
        <input type="hidden" name="token" value={token} />
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <PasswordField label={messages.auth.newPassword} name="password" autoComplete="new-password" required minLength={8} hint={messages.auth.passwordHint} />
        <Button type="submit" pill loading={pending}>{messages.auth.savePassword}</Button>
      </form>
    </>
  );
}

function GoogleBlock({ enabled }: { enabled: boolean }) {
  return (
    <div className="stack" style={{ marginTop: 18 }}>
      <div className="divider">{messages.auth.or}</div>
      {enabled ? (
        <Button
          type="button"
          variant="secondary"
          pill
          onClick={() => {
            void authClient.signIn.social({ provider: "google", callbackURL: "/app/overview" });
          }}
        >
          {messages.auth.google}
        </Button>
      ) : (
        <>
          <button type="button" className="btn btn-secondary btn-pill" aria-disabled="true" aria-describedby="google-hint">
            G {messages.auth.google}
          </button>
          <p id="google-hint" className="field-hint">{messages.auth.googleDisabled}</p>
        </>
      )}
    </div>
  );
}

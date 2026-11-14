"use client";

import { useActionState } from "react";
import { createAuthClient } from "better-auth/react";
import Link from "next/link";
import { messages } from "@/i18n/it";
import { AuthSubmit } from "@/components/auth/auth-submit";
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
        <div className="auth-forgot">
          <Link href="/forgot-password">{messages.auth.forgot}</Link>
        </div>
        <AuthSubmit loading={pending}>{messages.auth.submitLogin} →</AuthSubmit>
      </form>
      <GoogleBlock enabled={googleEnabled} />
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
        <AuthSubmit loading={pending}>{messages.auth.submitRegister} →</AuthSubmit>
      </form>
      <GoogleBlock enabled={googleEnabled} />
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
        <AuthSubmit loading={pending}>{messages.auth.sendLink}</AuthSubmit>
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
        <AuthSubmit loading={pending}>{messages.auth.savePassword}</AuthSubmit>
      </form>
    </>
  );
}

function GoogleBlock({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div className="stack" style={{ marginTop: 18 }}>
      <div className="divider">{messages.auth.or}</div>
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
    </div>
  );
}

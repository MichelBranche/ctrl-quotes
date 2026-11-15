"use client";

import { useActionState } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";
import { AuthSubmit } from "@/components/auth/auth-submit";
import { TextField } from "@/components/ui/fields";
import { messages } from "@/i18n/it";
import { createWorkspaceAction, type FormState } from "@/server/actions";

const initial: FormState = {};

export function NewWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, initial);
  return (
    <AuthScreen>
      <h1>{messages.onboarding.title}</h1>
      <p className="lede">{messages.onboarding.subtitle}</p>
      <form action={action} className="stack">
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <TextField label={messages.onboarding.name} name="name" required minLength={2} />
        <fieldset style={{ border: 0, padding: 0, textAlign: "left" }}>
          <legend className="field-label">{messages.onboarding.tax}</legend>
          <label className="checkline"><input type="radio" name="taxProfile" value="ordinario" defaultChecked /> {messages.onboarding.ordinario}</label>
          <label className="checkline"><input type="radio" name="taxProfile" value="forfettario" /> {messages.onboarding.forfettario}</label>
          <label className="checkline"><input type="radio" name="taxProfile" value="estero" /> {messages.onboarding.estero}</label>
        </fieldset>
        <p className="field-hint">{messages.onboarding.logoSkip}</p>
        <AuthSubmit loading={pending}>{messages.onboarding.submit}</AuthSubmit>
      </form>
    </AuthScreen>
  );
}

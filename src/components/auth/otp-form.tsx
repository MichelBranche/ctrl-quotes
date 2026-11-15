"use client";

import { useActionState, useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { messages } from "@/i18n/it";
import { AuthSubmit } from "@/components/auth/auth-submit";
import { resendVerificationOtpAction, verifyOtpAction, type FormState } from "@/server/actions";

const initial: FormState = {};
const RESEND_SECONDS = 60;
const OTP_LENGTH = 6;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function OtpForm({ email, next }: { email: string; next?: string | null }) {
  const [state, action, pending] = useActionState(verifyOtpAction, initial);
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join("");

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const write = (next: string, start: number) => {
    const incoming = onlyDigits(next);
    if (!incoming) {
      setDigits((current) => {
        const copy = [...current];
        copy[start] = "";
        return copy;
      });
      return;
    }
    setDigits((current) => {
      const copy = [...current];
      incoming.split("").forEach((digit, offset) => {
        if (start + offset < OTP_LENGTH) copy[start + offset] = digit;
      });
      return copy;
    });
    const focusAt = Math.min(start + incoming.length, OTP_LENGTH - 1);
    inputs.current[focusAt]?.focus();
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    const text = event.clipboardData.getData("text");
    if (!/\d/.test(text)) return;
    event.preventDefault();
    write(text, index === 0 ? 0 : index);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((current) => {
        const copy = [...current];
        copy[index - 1] = "";
        return copy;
      });
      inputs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  };

  const resend = async () => {
    if (wait > 0 || resending) return;
    setResending(true);
    setResendError(null);
    setResendMessage(null);
    const result = await resendVerificationOtpAction(email);
    setResending(false);
    if (result.error) {
      setResendError(result.error);
      return;
    }
    setResendMessage(messages.auth.codeSent);
    setWait(RESEND_SECONDS);
    setDigits(Array.from({ length: OTP_LENGTH }, () => ""));
    inputs.current[0]?.focus();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (code.length !== OTP_LENGTH) event.preventDefault();
  };

  return (
    <>
      <h1>{messages.auth.verifyCodeTitle}</h1>
      <p className="lede">{messages.auth.verifyCodeSubtitle}</p>
      <p className="auth-otp-email">{email}</p>
      <form action={action} className="stack" onSubmit={onSubmit}>
        <input type="hidden" name="email" value={email} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <input type="hidden" name="otp" value={code} />
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        {resendError ? <p className="alert" role="alert">{resendError}</p> : null}
        {resendMessage ? <p className="alert alert-success">{resendMessage}</p> : null}
        <div className="otp-boxes" role="group" aria-label={messages.auth.verifyCodeLabel}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputs.current[index] = element;
              }}
              className="otp-box"
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              autoFocus={index === 0}
              maxLength={index === 0 ? OTP_LENGTH : 1}
              pattern="[0-9]*"
              value={digit}
              aria-label={`${messages.auth.verifyCodeLabel} ${index + 1}`}
              onChange={(event) => write(event.target.value, index)}
              onPaste={(event) => onPaste(event, index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onFocus={(event) => event.currentTarget.select()}
            />
          ))}
        </div>
        <AuthSubmit loading={pending} disabled={code.length !== OTP_LENGTH}>
          {messages.auth.confirmCode}
        </AuthSubmit>
      </form>
      <p className="auth-otp-resend">
        {wait > 0 ? (
          <span>{messages.auth.resendWait.replace("{seconds}", String(wait))}</span>
        ) : (
          <button type="button" className="text-btn" onClick={() => void resend()} disabled={resending}>
            {messages.auth.resendCode}
          </button>
        )}
      </p>
      <p>
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>{messages.auth.backLogin}</Link>
      </p>
    </>
  );
}

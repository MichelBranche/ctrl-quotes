import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { ArrowUpRight } from "lucide-react";

export const SIGN_UP_PATH = "/register";
export const APP_PATH = "/app/overview";

type CtaProps = {
  label: string;
  /** Label when a session cookie is present. */
  signedLabel?: string;
  className?: string;
  icon?: boolean;
};

function CtaAnchor({ href, children, className, icon }: { href: string; children: ReactNode; className?: string; icon: boolean }) {
  return (
    <a href={href} className={className} data-lp-leave="">
      <span className="lp-btn-label">{children}</span>
      {icon ? (
        <span className="lp-btn-icon" aria-hidden="true">
          <ArrowUpRight size={18} strokeWidth={2.4} />
        </span>
      ) : null}
    </a>
  );
}

/**
 * Primary call to action. The page shell stays static: only this link reads the request, inside its own
 * Suspense hole. A session cookie (not validated here, no DB hit) sends the visitor to the app, where
 * the real check happens; everyone else goes to sign-up.
 */
export function StartCta({ label, signedLabel = "Apri l'app", className = "lp-btn lp-btn-lime", icon = true }: CtaProps) {
  const fallback = (
    <CtaAnchor href={SIGN_UP_PATH} className={className} icon={icon}>
      {label}
    </CtaAnchor>
  );
  return (
    <Suspense fallback={fallback}>
      <SessionAwareCta label={label} signedLabel={signedLabel} className={className} icon={icon} />
    </Suspense>
  );
}

async function SessionAwareCta({ label, signedLabel, className, icon }: Required<CtaProps>) {
  const signedIn = Boolean(getSessionCookie(await headers()));
  return (
    <CtaAnchor href={signedIn ? APP_PATH : SIGN_UP_PATH} className={className} icon={icon}>
      {signedIn ? signedLabel : label}
    </CtaAnchor>
  );
}

/** Nav "Accedi" link: hidden behind "Apri l'app" when already signed in. */
export function LoginLink() {
  const anchor = (
    <a href="/login" className="lp-nav-login" data-lp-leave="">
      Accedi
    </a>
  );
  return (
    <Suspense fallback={anchor}>
      <SessionAwareLogin anchor={anchor} />
    </Suspense>
  );
}

async function SessionAwareLogin({ anchor }: { anchor: ReactNode }) {
  const signedIn = Boolean(getSessionCookie(await headers()));
  return signedIn ? null : anchor;
}

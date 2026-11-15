import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AuthScreen } from "@/components/auth/auth-screen";
import { OtpForm } from "@/components/auth/otp-form";
import { messages } from "@/i18n/it";
import { ensureMigrated } from "@/db/client";
import { getAuth } from "@/server/auth";
import { safeInvitePath } from "@/domain/invite-path";

export const metadata = { title: "Verifica email" };

type Search = Promise<{ token?: string; email?: string; next?: string }>;

export default function VerifyEmailPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<AuthScreen><p className="lede">{messages.auth.checkBody}</p></AuthScreen>}>
      <VerifyContent searchParams={searchParams} />
    </Suspense>
  );
}

async function VerifyContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email.trim() : "";
  const next = safeInvitePath(typeof params.next === "string" ? params.next : null);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  if (params.token) {
    let ok = false;
    try {
      await ensureMigrated();
      await getAuth().api.verifyEmail({ query: { token: params.token } });
      ok = true;
    } catch {
      ok = false;
    }
    return (
      <AuthScreen>
        <h1>{ok ? messages.auth.verifiedTitle : messages.auth.verifyFailedTitle}</h1>
        <p className="lede">{ok ? messages.auth.verifiedBody : messages.auth.verifyFailedBody}</p>
        <p>
          <Link href={loginHref}>{messages.auth.loginLink}</Link>
        </p>
      </AuthScreen>
    );
  }

  if (!email || !email.includes("@")) {
    return (
      <AuthScreen>
        <h1>{messages.auth.verifyCodeTitle}</h1>
        <p className="lede">{messages.auth.missingEmail}</p>
        <p>
          <Link href="/register">{messages.auth.registerLink}</Link>
        </p>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <OtpForm email={email} next={next} />
    </AuthScreen>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { AuthScreen } from "@/components/auth/auth-screen";
import { messages } from "@/i18n/it";
import { ensureMigrated } from "@/db/client";
import { getAuth } from "@/server/auth";

export const metadata = { title: "Verifica email" };

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={<AuthScreen><p className="lede">{messages.auth.checkBody}</p></AuthScreen>}>
      <VerifyContent searchParams={searchParams} />
    </Suspense>
  );
}

async function VerifyContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  let ok = false;
  if (params.token) {
    try {
      await ensureMigrated();
      await getAuth().api.verifyEmail({ query: { token: params.token } });
      ok = true;
    } catch {
      ok = false;
    }
  }
  return (
    <AuthScreen>
      <h1>{ok ? messages.auth.verifiedTitle : messages.auth.verifyFailedTitle}</h1>
      <p className="lede">{ok ? messages.auth.verifiedBody : messages.auth.verifyFailedBody}</p>
      <p>
        <Link href="/login">{messages.auth.loginLink}</Link>
      </p>
    </AuthScreen>
  );
}

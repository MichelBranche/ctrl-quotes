import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AuthScreen } from "@/components/auth/auth-screen";
import { messages } from "@/i18n/it";
import { previewAutoVerifyEmail } from "@/server/preview-auth";
import { safeInvitePath } from "@/domain/invite-path";

export const metadata = { title: "Controlla la posta" };

type Search = Promise<{ next?: string }>;

export default function CheckEmailPage({ searchParams }: { searchParams?: Search }) {
  return (
    <Suspense
      fallback={
        <AuthScreen>
          <h1>{messages.auth.checkTitle}</h1>
          <p className="lede">{messages.auth.checkBody}</p>
        </AuthScreen>
      }
    >
      <CheckEmailContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CheckEmailContent({ searchParams }: { searchParams?: Search }) {
  await connection();
  const preview = previewAutoVerifyEmail();
  const params = searchParams ? await searchParams : {};
  const next = typeof params.next === "string" ? params.next : "";
  const invite = safeInvitePath(next);
  const href = invite ? `/login?next=${encodeURIComponent(invite)}` : "/login";
  return (
    <AuthScreen>
      <h1>{preview ? messages.auth.previewReadyTitle : messages.auth.checkTitle}</h1>
      <p className="lede">{preview ? messages.auth.previewReadyBody : messages.auth.checkBody}</p>
      <p>
        <Link href={href}>{messages.auth.backLogin}</Link>
      </p>
    </AuthScreen>
  );
}

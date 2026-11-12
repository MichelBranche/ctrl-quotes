import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AuthScreen } from "@/components/auth/auth-screen";
import { messages } from "@/i18n/it";
import { previewAutoVerifyEmail } from "@/server/preview-auth";

export const metadata = { title: "Controlla la posta" };

export default function CheckEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthScreen>
          <h1>{messages.auth.checkTitle}</h1>
          <p className="lede">{messages.auth.checkBody}</p>
        </AuthScreen>
      }
    >
      <CheckEmailContent />
    </Suspense>
  );
}

async function CheckEmailContent() {
  await connection();
  const preview = previewAutoVerifyEmail();
  return (
    <AuthScreen>
      <h1>{preview ? messages.auth.previewReadyTitle : messages.auth.checkTitle}</h1>
      <p className="lede">{preview ? messages.auth.previewReadyBody : messages.auth.checkBody}</p>
      <p>
        <Link href="/login">{messages.auth.backLogin}</Link>
      </p>
    </AuthScreen>
  );
}

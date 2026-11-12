import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";
import { ResetForm } from "@/components/auth/auth-forms";
import { messages } from "@/i18n/it";

export const metadata = { title: "Nuova password" };

export default function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <Suspense fallback={<AuthScreen><p>{messages.auth.resetSubtitle}</p></AuthScreen>}>
      <ResetContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ResetContent({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return (
    <AuthScreen>
      {params.token ? <ResetForm token={params.token} /> : <p>{messages.auth.verifyFailedBody}</p>}
    </AuthScreen>
  );
}

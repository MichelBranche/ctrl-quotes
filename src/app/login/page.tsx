import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";
import { LoginForm } from "@/components/auth/auth-forms";
import { messages } from "@/i18n/it";

export const metadata = { title: "Accedi" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <AuthScreen>
      <Suspense fallback={null}>
        <ResetNotice searchParams={searchParams} />
      </Suspense>
      <LoginForm googleEnabled={googleEnabled} />
    </AuthScreen>
  );
}

async function ResetNotice({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const params = await searchParams;
  if (params.reset !== "1") return null;
  return <p className="alert alert-success">{messages.auth.resetDone}</p>;
}

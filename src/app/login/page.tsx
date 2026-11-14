import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { oauthErrorMessage } from "@/domain/oauth-errors";
import { messages } from "@/i18n/it";
import { authUiConfig } from "@/server/auth-providers";

export const metadata = { title: "Accedi" };

type Search = Promise<{ reset?: string; error?: string }>;

export default function LoginPage({ searchParams }: { searchParams: Search }) {
  return (
    <AuthScreen>
      <AuthTabs
        initial="login"
        ui={authUiConfig()}
        notice={
          <Suspense fallback={null}>
            <LoginNotice searchParams={searchParams} />
          </Suspense>
        }
      />
    </AuthScreen>
  );
}

async function LoginNotice({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const oauthError = oauthErrorMessage(typeof params.error === "string" ? params.error : null);
  if (oauthError) {
    return (
      <p className="alert" role="alert">
        {oauthError}
      </p>
    );
  }
  if (params.reset !== "1") return null;
  return <p className="alert alert-success">{messages.auth.resetDone}</p>;
}

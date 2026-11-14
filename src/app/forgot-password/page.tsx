import { AuthScreen } from "@/components/auth/auth-screen";
import { ForgotForm } from "@/components/auth/auth-forms";
import { authUiConfig } from "@/server/auth-providers";

export const metadata = { title: "Password dimenticata" };

export default function ForgotPage() {
  return (
    <AuthScreen>
      <ForgotForm turnstileSiteKey={authUiConfig().turnstileSiteKey} />
    </AuthScreen>
  );
}

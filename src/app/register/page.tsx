import { AuthScreen } from "@/components/auth/auth-screen";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { authUiConfig } from "@/server/auth-providers";

export const metadata = { title: "Registrati" };

export default function RegisterPage() {
  return (
    <AuthScreen>
      <AuthTabs initial="register" ui={authUiConfig()} />
    </AuthScreen>
  );
}

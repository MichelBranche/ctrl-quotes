import { AuthScreen } from "@/components/auth/auth-screen";
import { AuthTabs } from "@/components/auth/auth-tabs";

export const metadata = { title: "Registrati" };

export default function RegisterPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <AuthScreen>
      <AuthTabs initial="register" googleEnabled={googleEnabled} />
    </AuthScreen>
  );
}

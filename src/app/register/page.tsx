import { AuthScreen } from "@/components/auth/auth-screen";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Registrati" };

export default function RegisterPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <AuthScreen>
      <RegisterForm googleEnabled={googleEnabled} />
    </AuthScreen>
  );
}

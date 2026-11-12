import { AuthScreen } from "@/components/auth/auth-screen";
import { ForgotForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Password dimenticata" };

export default function ForgotPage() {
  return (
    <AuthScreen>
      <ForgotForm />
    </AuthScreen>
  );
}

import Link from "next/link";
import { AuthScreen } from "@/components/auth/auth-screen";
import { messages } from "@/i18n/it";

export const metadata = { title: "Sessione scaduta" };

export default function SessionExpiredPage() {
  return (
    <AuthScreen>
      <h1>{messages.auth.sessionExpiredTitle}</h1>
      <p className="lede">{messages.auth.sessionExpiredBody}</p>
      <p>
        <Link href="/login">{messages.auth.loginLink}</Link>
      </p>
    </AuthScreen>
  );
}

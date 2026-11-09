import Link from "next/link";
import { AuthScreen } from "@/components/auth/auth-screen";
import { messages } from "@/i18n/it";

export const metadata = { title: "Controlla la posta" };

export default function CheckEmailPage() {
  return (
    <AuthScreen>
      <h1>{messages.auth.checkTitle}</h1>
      <p className="lede">{messages.auth.checkBody}</p>
      <p>
        <Link href="/login">{messages.auth.backLogin}</Link>
      </p>
    </AuthScreen>
  );
}

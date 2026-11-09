import Link from "next/link";
import { messages } from "@/i18n/it";

export default function NotFound() {
  return (
    <main className="page">
      <h1>{messages.errors.notFoundTitle}</h1>
      <p>{messages.errors.notFoundBody}</p>
      <p>
        <Link href="/app/overview">{messages.errors.home}</Link>
        {" · "}
        <Link href="/login">{messages.errors.login}</Link>
      </p>
    </main>
  );
}

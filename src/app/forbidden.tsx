import Link from "next/link";
import { messages } from "@/i18n/it";

export default function ForbiddenPage() {
  return (
    <main className="page">
      <h1>{messages.errors.forbiddenTitle}</h1>
      <p>{messages.errors.forbiddenBody}</p>
      <p>
        <Link href="/app/overview">{messages.errors.home}</Link>
      </p>
    </main>
  );
}

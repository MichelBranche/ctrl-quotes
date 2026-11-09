import { messages } from "@/i18n/it";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <h1>{messages.legal.privacyTitle}</h1>
      <p>{messages.legal.draft}</p>
      <p>
        L&apos;account conserva nome, email e hash della password. I dati dei clienti dei workspace saranno trattati per conto dell&apos;utente, con export e cancellazione prima del lancio. Non usiamo cookie di profilazione.
      </p>
    </main>
  );
}

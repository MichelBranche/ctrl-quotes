import { messages } from "@/i18n/it";

export const metadata = { title: "Termini" };

export default function TermsPage() {
  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <h1>{messages.legal.termsTitle}</h1>
      <p>{messages.legal.draft}</p>
      <p>
        CTRL® Quotes permette di creare preventivi e raccogliere un&apos;accettazione elettronica semplice. Non equivale a una firma elettronica qualificata. I limiti di piano, i prezzi e la conservazione dei dati saranno definiti prima del lancio.
      </p>
    </main>
  );
}

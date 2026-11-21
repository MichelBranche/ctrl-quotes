import { HelpFrame } from "@/components/help/help-frame";
import { helpFaqs } from "@/domain/help";

export const metadata = { title: "FAQ · Aiuto" };

export default function HelpFaqPage() {
  return (
    <HelpFrame eyebrow="FAQ" title="Domande frequenti" subtitle="Le risposte rapide sui dubbi più comuni.">
      <div className="hp-faq card">
        {helpFaqs.map((faq, index) => (
          <details key={faq.q} id={`f${index + 1}`} className="hp-faq-item">
            <summary>{faq.q}</summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </div>
    </HelpFrame>
  );
}

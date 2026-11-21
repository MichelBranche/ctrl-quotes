import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HelpFrame } from "@/components/help/help-frame";
import { topicIcons } from "@/components/help/help-icons";
import { helpTopics } from "@/domain/help";

export const metadata = { title: "Guide · Aiuto" };

export default function HelpGuidesPage() {
  return (
    <HelpFrame eyebrow="Guide" title="Tutte le guide" subtitle="Come funziona CTRL® Quotes, sezione per sezione.">
      {helpTopics.map((topic) => {
        const Icon = topicIcons[topic.id];
        return (
          <section key={topic.id} className="hp-article card">
            <h2>
              <span className="hp-topic-icon"><Icon size={18} aria-hidden="true" /></span>
              {topic.title}
            </h2>
            <p>{topic.summary}</p>
            <ul className="hp-guide-links">
              {topic.sections.map((section, index) => (
                <li key={section.title}>
                  <Link href={`/app/help/${topic.id}#s${index + 1}`}>
                    {section.title} <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </HelpFrame>
  );
}

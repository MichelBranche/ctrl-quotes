import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { HelpFrame } from "@/components/help/help-frame";
import { findTopic, helpTopics } from "@/domain/help";

type Params = Promise<{ topic: string }>;

export function generateStaticParams() {
  return helpTopics.map((topic) => ({ topic: topic.id }));
}

export async function generateMetadata({ params }: { params: Params }) {
  const topic = findTopic((await params).topic);
  return { title: topic ? `${topic.title} · Aiuto` : "Aiuto" };
}

export default async function HelpTopicPage({ params }: { params: Params }) {
  const topic = findTopic((await params).topic);
  if (!topic) notFound();
  return (
    <HelpFrame eyebrow="Guida" title={topic.title} subtitle={topic.summary} current={topic.id}>
      <ol className="hp-toc card" aria-label="In questa guida">
        {topic.sections.map((section, index) => (
          <li key={section.title}>
            <a href={`#s${index + 1}`}>{section.title}</a>
          </li>
        ))}
      </ol>
      {topic.sections.map((section, index) => (
        <section key={section.title} id={`s${index + 1}`} className="hp-article card">
          <h2>
            <span className="hp-article-no">{String(index + 1).padStart(2, "0")}</span>
            {section.title}
          </h2>
          {section.body ? <p>{section.body}</p> : null}
          {section.steps ? (
            <ol className="hp-steps">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}
      <Link href={topic.cta.href} className="btn btn-primary btn-pill hp-article-cta">
        {topic.cta.label} <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </HelpFrame>
  );
}

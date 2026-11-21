import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { topicIcons } from "@/components/help/help-icons";
import { helpTopics, supportMailto, type HelpTopicId } from "@/domain/help";
import { cn } from "@/lib/cn";

/** Shared frame for the help subpages: back link, title, content and a side list of topics. */
export function HelpFrame({
  eyebrow,
  title,
  subtitle,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  current?: HelpTopicId;
  children: ReactNode;
}) {
  return (
    <div className="hp hp-sub">
      <Link href="/app/help" className="hp-back">
        <ArrowLeft size={16} aria-hidden="true" /> Aiuto e Supporto
      </Link>
      <header className="hp-sub-head">
        <span className="hp-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="hp-sub-grid">
        <div className="hp-sub-main">{children}</div>
        <aside className="hp-sub-side">
          <nav className="card hp-side-nav" aria-label="Argomenti">
            <h2>Argomenti</h2>
            <ul>
              {helpTopics.map((topic) => {
                const Icon = topicIcons[topic.id];
                return (
                  <li key={topic.id}>
                    <Link
                      href={`/app/help/${topic.id}`}
                      className={cn("hp-side-link", current === topic.id && "is-current")}
                      aria-current={current === topic.id ? "page" : undefined}
                    >
                      <Icon size={16} aria-hidden="true" /> {topic.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="card hp-side-help">
            <strong>Non trovi la risposta?</strong>
            <p>Scrivici, ti rispondiamo noi.</p>
            <a href={supportMailto("Richiesta di supporto CTRL® Quotes")} className="btn btn-secondary btn-pill">
              <Mail size={16} aria-hidden="true" /> Apri una richiesta
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

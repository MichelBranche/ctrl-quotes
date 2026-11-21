import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HelpFrame } from "@/components/help/help-frame";
import { helpResources } from "@/domain/help";

export const metadata = { title: "Centro risorse · Aiuto" };

export default function HelpResourcesPage() {
  return (
    <HelpFrame eyebrow="Risorse" title="Centro risorse" subtitle="Link utili per scegliere, configurare e consultare.">
      <ul className="hp-res-list card">
        {helpResources.map((res) => (
          <li key={res.href}>
            <Link href={res.href} className="hp-res">
              <span className="hp-res-body"><strong>{res.title}</strong><span>{res.body}</span></span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </HelpFrame>
  );
}

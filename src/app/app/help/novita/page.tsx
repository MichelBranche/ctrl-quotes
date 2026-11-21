import { HelpFrame } from "@/components/help/help-frame";
import { helpUpdates } from "@/domain/help";

export const metadata = { title: "Novità · Aiuto" };

const day = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

export default function HelpUpdatesPage() {
  return (
    <HelpFrame eyebrow="Novità" title="Novità e aggiornamenti" subtitle="Le ultime modifiche a CTRL® Quotes.">
      <ol className="hp-updates card">
        {helpUpdates.map((update) => (
          <li key={`${update.date}-${update.title}`}>
            <time dateTime={update.date}>{day.format(new Date(`${update.date}T12:00:00Z`))}</time>
            <strong>{update.title}</strong>
            <p>{update.body}</p>
          </li>
        ))}
      </ol>
    </HelpFrame>
  );
}

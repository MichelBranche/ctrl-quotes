import { Suspense } from "react";
import { NumberingForm } from "@/components/settings/numbering-form";
import { loadSettings } from "@/app/app/settings/load";

export const metadata = { title: "Numerazione" };

export default function NumberingPage() {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <NumberingContent />
    </Suspense>
  );
}

async function NumberingContent() {
  const { config, canEdit } = await loadSettings();
  return (
    <NumberingForm
      format={config.brand.quoteNumberFormat}
      numberReset={config.settings.numberReset}
      canEdit={canEdit}
      year={Number(new Intl.DateTimeFormat("it-IT", { year: "numeric", timeZone: "Europe/Rome" }).format(new Date()))}
    />
  );
}

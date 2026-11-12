"use client";

import { useMemo } from "react";
import { QuoteDocumentView } from "@/components/quote-render/quote-document";
import { demoSnapshot } from "@/domain/template-sample";
import type { TemplateKey } from "@/domain/templates";

export function TemplateLab({ templateKey, layout }: { templateKey: TemplateKey; layout: "sheet" | "flow" | "auto" }) {
  const snapshot = useMemo(() => demoSnapshot(templateKey), [templateKey]);
  return <QuoteDocumentView snapshot={snapshot} logoSrc={null} animate={false} layout={layout} watermark="Bozza" />;
}

"use client";

import { useMemo } from "react";
import { QuoteDocumentView } from "@/components/quote-render/quote-document";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { demoSnapshot } from "@/domain/template-sample";
import type { TemplateKey } from "@/domain/templates";
import { cn } from "@/lib/cn";

/**
 * A real, scaled-down render of a template page with sample content ("Cliente Esempio") and the
 * workspace's own name and logo. Same renderer as the editor and the PDF, so the thumbnail never lies.
 */
export function TemplateCover({
  templateKey,
  brandName,
  logoUrl,
  photo,
  accent,
  page = 0,
  large = false,
  className,
}: {
  templateKey: TemplateKey;
  brandName: string;
  logoUrl?: string | null;
  /** Photo option id, as chosen in the editor. */
  photo?: string | null;
  /** Custom accent (hex) to preview. */
  accent?: string | null;
  page?: number;
  large?: boolean;
  className?: string;
}) {
  const snapshot: QuoteSnapshot = useMemo(() => {
    const base = demoSnapshot(templateKey);
    return {
      ...base,
      issuer: { ...base.issuer, displayName: brandName.trim() || base.issuer.displayName },
      document: {
        ...base.document,
        style: { accent: accent ?? "template", photos: photo ? { [templateKey]: photo } : {} },
      },
    };
  }, [templateKey, brandName, photo, accent]);
  return (
    <div className={cn("tpl-thumb", large && "is-large", className)} aria-hidden="true" inert>
      <QuoteDocumentView snapshot={snapshot} logoSrc={logoUrl ?? null} animate={false} only={[page]} layout="sheet" />
    </div>
  );
}

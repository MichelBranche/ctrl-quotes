"use client";

import { QuoteDocumentView, type QuoteDocumentProps } from "@/components/quote-render/quote-document";

export function PublicQuoteDocument(props: Omit<QuoteDocumentProps, "onSignInvite">) {
  return (
    <QuoteDocumentView
      {...props}
      onSignInvite={() => {
        window.dispatchEvent(new Event("ctrl:open-sign"));
        const hash = "#firma";
        if (window.location.hash !== hash) {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
        }
      }}
    />
  );
}

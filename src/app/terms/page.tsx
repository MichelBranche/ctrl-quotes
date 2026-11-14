import { permanentRedirect } from "next/navigation";

/** Historical /terms URL used by the signup form; the canonical page is /termini. */
export default function TermsRedirect() {
  permanentRedirect("/termini");
}

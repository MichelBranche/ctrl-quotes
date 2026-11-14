import { messages } from "@/i18n/it";

type LogoProps = {
  wordmark?: boolean;
  size?: number;
};

/** CTRL Quotes mark: full logo, or the compact icon (quote marks and "ctrl") when wordmark is false. */
export function Logo({ wordmark = true, size = 28 }: LogoProps) {
  return wordmark ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/logo.png" alt={messages.brand} height={size} width={Math.round((size * 361) / 80)} style={{ display: "block", height: size, width: "auto" }} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/icon-compact.png" alt={messages.brand} height={size} width={size} style={{ display: "block", height: size, width: "auto" }} />
  );
}

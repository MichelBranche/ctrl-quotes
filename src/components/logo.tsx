import { messages } from "@/i18n/it";

type LogoProps = {
  wordmark?: boolean;
  size?: number;
};

export function Logo({ wordmark = true, size = 32 }: LogoProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        role="img"
        aria-label="Segnaposto del marchio CTRL Quotes"
        data-placeholder="true"
      >
        <title>Segnaposto del marchio CTRL Quotes</title>
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <circle cx="14.5" cy="14.5" r="6" fill="none" stroke="white" strokeWidth="2.2" />
        <path d="M18.8 18.4 22.6 23" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <path
          d="M17 13.1 19.3 15.6 23.8 10.4"
          fill="none"
          stroke="white"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {wordmark ? <span>{messages.brand}</span> : null}
    </span>
  );
}

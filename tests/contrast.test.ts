import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const r = channel(Number.parseInt(raw.slice(0, 2), 16));
  const g = channel(Number.parseInt(raw.slice(2, 4), 16));
  const b = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Hex value of a token, following plain var() references (e.g. --cq-accent: var(--brand)). */
function token(name: string, css: string): string {
  const reference = css.match(new RegExp(`${name}:\\s*var\\((--[\\w-]+)\\)`));
  if (reference?.[1]) return token(reference[1], css);
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Token mancante: ${name}`);
  return match[1];
}

describe("contrasto token", () => {
  it("i badge e i testi principali superano WCAG AA", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");
    const light = css.split('[data-theme="dark"]')[0] ?? css;
    const pairs: Array<[string, string]> = [
      ["--cq-ink", "--cq-surface"],
      ["--cq-muted", "--cq-surface"],
      ["--cq-on-primary", "--cq-primary"],
      ["--cq-success", "--cq-success-bg"],
      ["--cq-warning", "--cq-warning-bg"],
      ["--cq-danger", "--cq-danger-bg"],
      ["--cq-draft", "--cq-draft-bg"],
      ["--cq-info", "--cq-info-bg"],
      ["--cq-accent", "--cq-surface"],
    ];
    for (const [fg, bg] of pairs) {
      const ratio = contrast(token(fg, light), token(bg, light));
      expect(ratio, `${fg} su ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    const focus = contrast(token("--cq-accent", light), token("--cq-surface", light));
    expect(focus).toBeGreaterThanOrEqual(3);
  });
});

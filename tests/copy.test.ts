import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/it";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("copy", () => {
  it("non usa il trattino lungo nelle stringhe italiane", () => {
    const files = walk(path.join(process.cwd(), "src"));
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (text.includes("—") || text.includes("–")) offenders.push(path.relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
    expect(JSON.stringify(messages).includes("—")).toBe(false);
  });
});

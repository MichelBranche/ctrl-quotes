import { describe, expect, it } from "vitest";
import { defaultTextStyles, matchingStyle, parseTextStyles, stylePatch } from "@/domain/text-styles";

describe("stili di testo del workspace", () => {
  it("usa i predefiniti quando il dato manca o è rotto", () => {
    expect(parseTextStyles(null)).toEqual(defaultTextStyles);
    expect(parseTextStyles("{rotto")).toEqual(defaultTextStyles);
  });

  it("tiene gli stili validi e scarta quelli non validi uno per uno", () => {
    const styles = parseTextStyles(JSON.stringify({ title: { size: 40, font: "g:Playfair Display" }, body: { size: 9999 } }));
    expect(styles.title).toEqual({ size: 40, font: "g:Playfair Display" });
    expect(styles.body).toEqual(defaultTextStyles.body);
  });

  it("rifiuta font e colori non ammessi", () => {
    const styles = parseTextStyles(JSON.stringify({ title: { font: "javascript:alert(1)" }, accent: { color: "red" } }));
    expect(styles.title).toEqual(defaultTextStyles.title);
    expect(styles.accent).toEqual(defaultTextStyles.accent);
  });

  it("applicare uno stile sostituisce le proprietà di stile e lascia allineamento e marks", () => {
    const patch = stylePatch({ size: 20, weight: 700 });
    const before = { size: 12, italic: true, align: "center" as const, marks: [{ s: 0, e: 2, b: true }] };
    const after = { ...before, ...patch };
    expect(after.size).toBe(20);
    expect(after.weight).toBe(700);
    expect(after.italic).toBeUndefined();
    expect(after.align).toBe("center");
    expect(after.marks).toHaveLength(1);
    expect(matchingStyle({ ...defaultTextStyles, title: { size: 20, weight: 700 } }, after)).toBe("title");
  });
});

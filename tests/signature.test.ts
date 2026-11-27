import { describe, expect, it } from "vitest";
import { parseSignatureDataUrl, SIGNATURE_MAX_BYTES } from "@/domain/signature";
import { blankSignature, inkedSignature } from "./helpers/signature";

describe("validazione della firma elettronica", () => {
  it("accetta una firma disegnata in PNG", async () => {
    const parsed = await parseSignatureDataUrl(await inkedSignature());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mime).toBe("image/png");
    expect(parsed.sha256).toHaveLength(64);
    expect(parsed.width).toBeGreaterThanOrEqual(80);
    expect(parsed.height).toBeGreaterThanOrEqual(40);
  });

  it("rifiuta assenza, formato non valido, riquadro vuoto e payload troppo grande", async () => {
    expect((await parseSignatureDataUrl(undefined)).ok).toBe(false);
    expect((await parseSignatureDataUrl("")).ok).toBe(false);
    expect((await parseSignatureDataUrl("data:image/jpeg;base64,AAAA")).ok).toBe(false);
    expect((await parseSignatureDataUrl("data:image/png;base64,@@@")).ok).toBe(false);
    const empty = await parseSignatureDataUrl(await blankSignature());
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.message).toMatch(/firmare/);
    const huge = `data:image/png;base64,${"A".repeat(SIGNATURE_MAX_BYTES * 2)}`;
    expect((await parseSignatureDataUrl(huge)).ok).toBe(false);
  });
});

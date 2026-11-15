import { describe, expect, it } from "vitest";
import { invitePath, safeInvitePath } from "@/domain/invite-path";
import { generateLinkToken } from "@/server/link-token";

describe("percorsi degli inviti", () => {
  it("accetta solo un token ben formato da 43 caratteri", () => {
    const token = generateLinkToken();
    expect(token).toHaveLength(43);
    expect(safeInvitePath(invitePath(token))).toBe(`/invite/${token}`);
    expect(safeInvitePath("/invite/not-a-token")).toBeNull();
    expect(safeInvitePath("/invite/")).toBeNull();
    expect(safeInvitePath("https://evil.example/invite/" + token)).toBeNull();
    expect(safeInvitePath("/login")).toBeNull();
    expect(safeInvitePath(`/invite/${token}/../overview`)).toBeNull();
    expect(safeInvitePath(`/invite/${token}?x=1`)).toBeNull();
  });
});

export function createId(): string {
  return crypto.randomUUID();
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "workspace";
}

export function assertWorkspaceId(workspaceId: string): void {
  if (!workspaceId || workspaceId.trim() === "") {
    throw new Error("workspaceId obbligatorio");
  }
}

import { hasRole, type Role } from "@/domain/roles";

/**
 * Minimum role for each operation of the operational data area.
 * Every server mutation checks this table; the UI only mirrors it.
 */
export const permissionMatrix = {
  "clients.read": "member",
  "clients.write": "member",
  "clients.delete": "admin",
  "clients.import": "admin",
  "catalog.read": "member",
  "catalog.write": "member",
  "catalog.delete": "admin",
  "catalog.categories": "admin",
  "brand.write": "admin",
  "settings.write": "admin",
  "quotes.read": "member",
  "quotes.write": "member",
  "quotes.delete": "admin",
  "templates.favorite": "member",
  "templates.default": "admin",
  "team.read": "member",
  "team.remove": "admin",
  "team.role": "owner",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof permissionMatrix;

export function can(role: Role, permission: Permission): boolean {
  return hasRole(role, permissionMatrix[permission]);
}

export const permissionDeniedMessage: Record<Role, string> = {
  member: "Serve il ruolo di amministratore o proprietario per questa operazione.",
  admin: "Solo il proprietario del workspace può eseguire questa operazione.",
  owner: "Operazione non consentita.",
};

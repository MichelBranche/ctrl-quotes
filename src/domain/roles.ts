export const roles = ["owner", "admin", "member"] as const;
export type Role = (typeof roles)[number];

const rank: Record<Role, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function isRole(value: string): value is Role {
  switch (value) {
    case "owner":
    case "admin":
    case "member":
      return true;
    default:
      return false;
  }
}

export function hasRole(actual: Role, minimum: Role): boolean {
  return rank[actual] >= rank[minimum];
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "owner":
      return "Proprietario";
    case "admin":
      return "Amministratore";
    case "member":
      return "Membro";
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

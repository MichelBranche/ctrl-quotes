export const inviteRoles = ["admin", "member"] as const;
export type InviteRole = (typeof inviteRoles)[number];

export const inviteRoleLabels: Record<InviteRole, string> = {
  admin: "Amministratore",
  member: "Membro",
};

export type PendingInvite = {
  id: string;
  email: string;
  role: InviteRole;
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
};

export type SeatUsage = {
  used: number;
  members: number;
  pending: number;
  limit: number | null;
  planLabel: string;
  quotaLabel: string;
};

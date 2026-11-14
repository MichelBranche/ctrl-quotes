import type { PlanId } from "@/domain/plans";
import type { Role } from "@/domain/roles";

export type ShellWorkspace = { id: string; name: string; role: Role };

export type ShellData = {
  user: { name: string; email: string; initials: string };
  workspace: { id: string; name: string; plan: string; planOverride: PlanId | null };
  workspaces: ShellWorkspace[];
};

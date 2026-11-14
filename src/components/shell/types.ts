import type { PlanId } from "@/domain/plans";

export type ShellData = {
  user: { name: string; email: string; initials: string };
  workspace: { id: string; name: string; plan: string; planOverride: PlanId | null };
  workspaces: Array<{ id: string; name: string }>;
};

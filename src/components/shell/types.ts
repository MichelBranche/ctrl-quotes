import type { PlanId } from "@/domain/plans";
import type { Role } from "@/domain/roles";

export type ShellWorkspace = { id: string; name: string; role: Role };

export type ShellNotification = {
  id: string;
  type: string;
  title: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

export type ShellData = {
  user: { name: string; email: string; initials: string };
  workspace: {
    id: string;
    name: string;
    plan: string;
    planOverride: PlanId | null;
    trialEndsAt: number | null;
    trialDaysLeft: number;
    trialActive: boolean;
    trialExpired: boolean;
    showReminderBanner: boolean;
  };
  workspaces: ShellWorkspace[];
  notifications: ShellNotification[];
};

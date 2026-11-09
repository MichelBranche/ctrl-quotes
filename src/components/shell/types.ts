export type ShellData = {
  user: { name: string; email: string; initials: string };
  workspace: { id: string; name: string; plan: string };
  workspaces: Array<{ id: string; name: string }>;
};

import { avatarPlanRing, avatarPlanTooltip } from "@/domain/plans";
import type { ShellData } from "@/components/shell/types";
import { cn } from "@/lib/cn";

type Props = {
  initials: string;
  workspace: ShellData["workspace"];
  ariaLabel?: string;
  compact?: boolean;
  as?: "button" | "span";
};

export function AccountAvatar({ initials, workspace, ariaLabel, compact = false, as = "button" }: Props) {
  const ring = avatarPlanRing(workspace);
  const tooltip = avatarPlanTooltip(workspace);
  const label = ariaLabel ?? tooltip;
  const className = cn("avatar-plan", `is-${ring}`, compact && "is-compact");
  const inner = (
    <>
      <span className="avatar">{initials}</span>
      <span className="avatar-plan-tip">{tooltip}</span>
    </>
  );

  if (as === "span") {
    return (
      <span className={className} aria-label={label}>
        {inner}
      </span>
    );
  }

  return (
    <button type="button" className={className} aria-label={label}>
      {inner}
    </button>
  );
}

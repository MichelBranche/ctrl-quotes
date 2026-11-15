import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { avatarPlanRing, avatarPlanTooltip } from "@/domain/plans";
import type { ShellData } from "@/components/shell/types";
import { cn } from "@/lib/cn";

type Shared = {
  initials: string;
  workspace: ShellData["workspace"];
  ariaLabel?: string;
  compact?: boolean;
  className?: string;
};

type ButtonProps = Shared & { as?: "button" } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type" | "className">;
type SpanProps = Shared & { as: "span" } & Omit<HTMLAttributes<HTMLSpanElement>, "children" | "className">;

/** Forwards trigger props (popoverTarget, style, ref-related) onto the real button so AnchoredPopover can open the menu. */
export function AccountAvatar(props: ButtonProps | SpanProps) {
  const { initials, workspace, ariaLabel, compact = false, as = "button", className, ...rest } = props;
  const ring = avatarPlanRing(workspace);
  const tooltip = avatarPlanTooltip(workspace);
  const label = ariaLabel ?? tooltip;
  const classes = cn("avatar-plan", `is-${ring}`, compact && "is-compact", className);
  const inner = (
    <>
      <span className="avatar">{initials}</span>
      <span className="avatar-plan-tip">{tooltip}</span>
    </>
  );

  if (as === "span") {
    return (
      <span className={classes} aria-label={label} {...(rest as HTMLAttributes<HTMLSpanElement>)}>
        {inner}
      </span>
    );
  }

  return (
    <button type="button" className={classes} aria-label={label} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  );
}

import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { redeemCodes, redeemCodeUses, workspaces } from "@/db/schema";
import { createHash } from "node:crypto";
import { createId } from "@/domain/ids";
import type { PlanId } from "@/domain/plans";
import {
  activePlanOverride,
  isPlanId,
  nextOverride,
  normalizeRedeemCode,
  type RedeemError,
  type RedeemKind,
  type RedeemSuccess,
} from "@/domain/redeem";
import { hasRole } from "@/domain/roles";
import { writeAuditLog } from "@/server/audit";
import { getWorkspaceForUser } from "@/server/workspaces";

/** SHA-256 hex of a normalized redeem code. The plaintext is never stored. */
export function hashRedeemCode(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export type RedeemResult = { ok: true; value: RedeemSuccess } | { ok: false; error: RedeemError };

/**
 * Redeems `input` for the user's workspace. Uses, counter and workspace override are written in one atomic batch:
 * the counter only moves while the code is valid, unexpired, not exhausted and not yet used by this user, and the
 * other two statements only run if that update did. Concurrent attempts can never exceed max_uses or double-use.
 */
export async function redeemCode(
  db: AppDatabase,
  input: { userId: string; workspaceId: string; code: unknown },
  now = Date.now(),
): Promise<RedeemResult> {
  const workspace = await getWorkspaceForUser(db, input.userId, input.workspaceId);
  if (!workspace) return { ok: false, error: "forbidden" };
  if (!hasRole(workspace.role, "admin")) return { ok: false, error: "forbidden" };

  const code = normalizeRedeemCode(input.code);
  if (!code) return { ok: false, error: "invalid" };
  const digest = hashRedeemCode(code);
  const [row] = await db.select().from(redeemCodes).where(eq(redeemCodes.code, digest)).limit(1);
  if (!row || !isPlanId(row.plan) || (row.kind !== "free_month" && row.kind !== "lifetime")) return { ok: false, error: "invalid" };
  const kind: RedeemKind = row.kind;
  const plan: PlanId = row.plan;

  const [ws] = await db
    .select({ plan: workspaces.planOverride, until: workspaces.planOverrideUntil })
    .from(workspaces)
    .where(eq(workspaces.id, workspace.id));
  const untilMs = ws?.until ? ws.until.getTime() : null;
  const current = activePlanOverride(ws?.plan ?? null, untilMs, now);
  if (current && untilMs === null && kind !== "lifetime") return { ok: false, error: "lifetime_active" };
  const next = nextOverride({ plan: current, until: current ? untilMs : null }, { kind, plan, days: row.days }, now);

  const useId = createId();
  const [claim] = await db.batch([
    db
      .update(redeemCodes)
      .set({ usedCount: sql`${redeemCodes.usedCount} + 1` })
      .where(
        and(
          eq(redeemCodes.id, row.id),
          sql`${redeemCodes.usedCount} < ${redeemCodes.maxUses}`,
          sql`(${redeemCodes.expiresAt} is null or ${redeemCodes.expiresAt} > ${now})`,
          sql`not exists (select 1 from ${redeemCodeUses} where ${redeemCodeUses.codeId} = ${row.id} and ${redeemCodeUses.userId} = ${input.userId})`,
        ),
      ),
    // changes() = rows touched by the previous statement of this batch: 1 only if the claim above succeeded.
    db.run(sql`insert into ${redeemCodeUses} (id, code_id, workspace_id, user_id, redeemed_at)
      select ${useId}, ${row.id}, ${workspace.id}, ${input.userId}, ${now} where changes() = 1`),
    db
      .update(workspaces)
      .set({ planOverride: next.plan, planOverrideUntil: next.until === null ? null : new Date(next.until), updatedAt: new Date(now) })
      .where(and(eq(workspaces.id, workspace.id), sql`exists (select 1 from ${redeemCodeUses} where ${redeemCodeUses.id} = ${useId})`)),
  ]);

  if (claim.rowsAffected === 1) {
    await writeAuditLog(db, {
      workspaceId: workspace.id,
      actorUserId: input.userId,
      action: "billing.code_redeemed",
      entityType: "redeem_code",
      entityId: row.id,
      meta: { plan, kind, days: row.days ?? 0 },
    });
    return { ok: true, value: { plan, kind, days: row.days, until: next.until } };
  }

  // Not claimed: explain why (read after the fact, only for the message).
  const [fresh] = await db.select().from(redeemCodes).where(eq(redeemCodes.id, row.id));
  const [mine] = await db
    .select({ id: redeemCodeUses.id })
    .from(redeemCodeUses)
    .where(and(eq(redeemCodeUses.codeId, row.id), eq(redeemCodeUses.userId, input.userId)));
  if (mine) return { ok: false, error: "used" };
  if (fresh?.expiresAt && fresh.expiresAt.getTime() <= now) return { ok: false, error: "expired" };
  if (!fresh) return { ok: false, error: "invalid" };
  return { ok: false, error: "exhausted" };
}

export type NewRedeemCode = { code: string; kind: RedeemKind; plan: PlanId; days: number | null; maxUses: number; expiresAt: Date | null };

export async function createRedeemCode(db: AppDatabase, input: NewRedeemCode, now = new Date()) {
  const code = normalizeRedeemCode(input.code);
  if (!code) throw new Error("Codice non valido: lettere, numeri e trattini, 4-40 caratteri.");
  const days = input.kind === "lifetime" ? null : input.days ?? 30;
  const [row] = await db
    .insert(redeemCodes)
    .values({ id: createId(), code: hashRedeemCode(code), kind: input.kind, plan: input.plan, days, maxUses: input.maxUses, expiresAt: input.expiresAt, createdAt: now })
    .returning();
  return row;
}

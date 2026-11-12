import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { templateFavorites, templates } from "@/db/schema";
import { authorize, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { getWorkspaceConfig, upsertSettings } from "@/server/settings";

export type TemplateKey = "minimal" | "editorial" | "corporate" | "bold";

export type TemplateRow = {
  id: string;
  key: TemplateKey;
  name: string;
  description: string;
  isFavorite: boolean;
  isDefault: boolean;
};

const order: TemplateKey[] = ["minimal", "editorial", "corporate", "bold"];

function asKey(value: string): TemplateKey | null {
  return (order as string[]).includes(value) ? (value as TemplateKey) : null;
}

export async function listTemplates(db: AppDatabase, actor: Actor): Promise<Result<TemplateRow[]>> {
  const config = await getWorkspaceConfig(db, actor);
  if (!config.ok) return config;
  const [rows, favorites] = await Promise.all([
    db.select().from(templates).orderBy(asc(templates.createdAt)),
    db
      .select({ templateId: templateFavorites.templateId })
      .from(templateFavorites)
      .where(eq(templateFavorites.workspaceId, actor.workspaceId)),
  ]);
  const favoriteIds = new Set(favorites.map((row) => row.templateId));
  const defaultId = config.value.settings.defaultTemplateId ?? "tpl_minimal";
  return ok(
    rows
      .flatMap((row) => {
        const key = asKey(row.key);
        if (!key) return [];
        return [
          {
            id: row.id,
            key,
            name: row.name,
            description: row.description,
            isFavorite: favoriteIds.has(row.id),
            isDefault: row.id === defaultId,
          },
        ];
      })
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)),
  );
}

async function templateExists(db: AppDatabase, templateId: string) {
  const rows = await db.select({ id: templates.id }).from(templates).where(eq(templates.id, templateId));
  return rows.length > 0;
}

export async function toggleFavorite(
  db: AppDatabase,
  actor: Actor,
  templateId: string,
): Promise<Result<{ favorite: boolean }>> {
  const access = await authorize(db, actor, "templates.favorite");
  if (!access.ok) return access;
  if (!(await templateExists(db, templateId))) return notFound("Template non trovato.");
  const removed = await db
    .delete(templateFavorites)
    .where(and(eq(templateFavorites.workspaceId, actor.workspaceId), eq(templateFavorites.templateId, templateId)))
    .returning({ id: templateFavorites.templateId });
  if (removed.length > 0) return ok({ favorite: false });
  await db
    .insert(templateFavorites)
    .values({ workspaceId: actor.workspaceId, templateId, createdAt: new Date() })
    .onConflictDoNothing();
  return ok({ favorite: true });
}

export async function setDefaultTemplate(db: AppDatabase, actor: Actor, templateId: string): Promise<Result<null>> {
  const access = await authorize(db, actor, "templates.default");
  if (!access.ok) return access;
  if (!(await templateExists(db, templateId))) return notFound("Template non trovato.");
  await upsertSettings(db, actor.workspaceId, { defaultTemplateId: templateId });
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "template.default_set",
    entityType: "template",
    entityId: templateId,
  });
  return ok(null);
}

import { and, eq, lte } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { outboxJobs } from "@/db/schema";
import { createId } from "@/domain/ids";

export type JobHandler = (payload: unknown) => Promise<void>;

const backoffMs = [60_000, 300_000, 900_000, 3_600_000];

export async function enqueueJob(
  db: AppDatabase,
  input: { type: string; payload: unknown; workspaceId?: string | null; now?: Date },
): Promise<string> {
  const id = createId();
  const now = input.now ?? new Date();
  await db.insert(outboxJobs).values({
    id,
    workspaceId: input.workspaceId ?? null,
    type: input.type,
    payload: JSON.stringify(input.payload ?? {}),
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function processDueJobs(
  db: AppDatabase,
  handlers: Record<string, JobHandler>,
  now = new Date(),
): Promise<{ succeeded: number; failed: number; retried: number }> {
  const due = await db
    .select()
    .from(outboxJobs)
    .where(and(eq(outboxJobs.status, "pending"), lte(outboxJobs.nextRunAt, now)))
    .limit(20);

  let succeeded = 0;
  let failed = 0;
  let retried = 0;

  for (const job of due) {
    const claimed = await db
      .update(outboxJobs)
      .set({ status: "running", updatedAt: now })
      .where(and(eq(outboxJobs.id, job.id), eq(outboxJobs.status, "pending")))
      .returning({ id: outboxJobs.id });
    if (claimed.length === 0) continue;

    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`Nessun handler per ${job.type}`);
      await handler(JSON.parse(job.payload) as unknown);
      await db
        .update(outboxJobs)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(eq(outboxJobs.id, job.id));
      succeeded += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      if (attempts >= job.maxAttempts) {
        await db
          .update(outboxJobs)
          .set({ status: "failed", attempts, lastError: message, updatedAt: new Date() })
          .where(eq(outboxJobs.id, job.id));
        failed += 1;
      } else {
        const delay = backoffMs[Math.min(attempts - 1, backoffMs.length - 1)] ?? 3_600_000;
        await db
          .update(outboxJobs)
          .set({
            status: "pending",
            attempts,
            lastError: message,
            nextRunAt: new Date(now.getTime() + delay),
            updatedAt: new Date(),
          })
          .where(eq(outboxJobs.id, job.id));
        retried += 1;
      }
    }
  }

  return { succeeded, failed, retried };
}

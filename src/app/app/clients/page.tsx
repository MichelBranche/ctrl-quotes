import { Suspense } from "react";
import { connection } from "next/server";
import { ClientsView } from "@/components/clients/clients-view";
import { Skeleton } from "@/components/ui/status";
import { clientFilters, type ClientFilter, type ClientKind } from "@/domain/clients";
import { can } from "@/domain/permissions";
import { getClient, listClients } from "@/server/clients";
import { requireContext } from "@/server/context";

export const metadata = { title: "Clienti" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function ClientsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<ClientsSkeleton />}>
      <ClientsContent searchParams={searchParams} />
    </Suspense>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function ClientsContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const params = await searchParams;
  const { db, actor, workspace } = await requireContext();
  const filterParam = one(params.filter);
  const filter: ClientFilter = (clientFilters as readonly string[]).includes(filterParam ?? "")
    ? (filterParam as ClientFilter)
    : "all";
  const kindParam = one(params.kind);
  const kind: ClientKind | "all" = kindParam === "azienda" || kindParam === "privato" ? kindParam : "all";
  const page = Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1);
  const q = one(params.q)?.slice(0, 100) ?? "";
  const list = await listClients(db, actor, { filter, kind, page, q, pageSize: 12 });
  if (!list.ok) throw new Error(list.message);
  const selectedId = one(params.id);
  const detailResult = selectedId ? await getClient(db, actor, selectedId) : null;
  return (
    <ClientsView
      list={list.value}
      filter={filter}
      kind={kind}
      q={q}
      selectedId={selectedId ?? null}
      detail={detailResult?.ok ? detailResult.value : null}
      detailMissing={Boolean(selectedId) && !detailResult?.ok}
      permissions={{
        write: can(workspace.role, "clients.write"),
        remove: can(workspace.role, "clients.delete"),
        importCsv: can(workspace.role, "clients.import"),
      }}
    />
  );
}

function ClientsSkeleton() {
  return (
    <div className="stack" aria-busy="true">
      <Skeleton width="30%" />
      <Skeleton width="60%" />
      <Skeleton />
    </div>
  );
}

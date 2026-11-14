import { Suspense } from "react";
import { connection } from "next/server";
import { CatalogView } from "@/components/catalog-data/catalog-view";
import { catalogTypes, type CatalogType } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { getCatalogItem, listCatalog, listCategories, listComponentOptions } from "@/server/catalog";
import { requireContext } from "@/server/context";
import { getWorkspaceConfig } from "@/server/settings";

export const metadata = { title: "Catalogo" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function CatalogPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <CatalogContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const params = await searchParams;
  const { db, actor, workspace } = await requireContext();
  const typeParam = one(params.type);
  const type: CatalogType | "all" = (catalogTypes as readonly string[]).includes(typeParam ?? "") ? (typeParam as CatalogType) : "all";
  const page = Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1);
  const q = one(params.q)?.slice(0, 100) ?? "";
  const categoryId = one(params.category)?.slice(0, 64) || undefined;
  const [list, categories, options, config] = await Promise.all([
    listCatalog(db, actor, { type, page, q, categoryId, pageSize: 12 }),
    listCategories(db, actor),
    listComponentOptions(db, actor),
    getWorkspaceConfig(db, actor),
  ]);
  if (!list.ok || !categories.ok || !options.ok || !config.ok) throw new Error("Catalogo non disponibile.");
  const selectedId = one(params.id);
  const detail = selectedId ? await getCatalogItem(db, actor, selectedId) : null;
  return (
    <CatalogView
      list={list.value}
      categories={categories.value}
      componentOptions={options.value}
      type={type}
      q={q}
      categoryId={categoryId ?? null}
      selectedId={selectedId ?? null}
      detail={detail?.ok ? detail.value : null}
      detailMissing={Boolean(selectedId) && !detail?.ok}
      taxProfile={workspace.taxProfile}
      defaults={{ taxRateBp: config.value.settings.defaultTaxRateBp, priceMode: config.value.settings.defaultPriceMode }}
      permissions={{
        write: can(workspace.role, "catalog.write"),
        remove: can(workspace.role, "catalog.delete"),
        categories: can(workspace.role, "catalog.categories"),
      }}
    />
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, Package, Plus, Settings2, Sparkles, Tags } from "lucide-react";
import { CatalogDetailPanel } from "@/components/catalog-data/catalog-detail";
import { CatalogItemDialog } from "@/components/catalog-data/item-form";
import { CategoriesDialog } from "@/components/catalog-data/categories-dialog";
import { FilterTabs, Pagination, SearchBox, useHref } from "@/components/data/controls";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/status";
import { catalogTypeLabel, formatPrice, type CatalogType } from "@/domain/catalog";
import type { PriceMode, TaxProfile } from "@/domain/pricing";
import { cn } from "@/lib/cn";
import type { CatalogItemDetail, CatalogItemRow, CatalogList, Category } from "@/server/catalog";

export type CatalogPermissions = {
  write: boolean;
  remove: boolean;
  categories: boolean;
};
export type CatalogDefaults = { taxRateBp: number; priceMode: PriceMode };

export function TypeIcon({ type, size = 18 }: { type: CatalogType; size?: number }) {
  const Icon = type === "servizio" ? Sparkles : type === "prodotto" ? Package : Boxes;
  return <Icon size={size} aria-hidden="true" />;
}

export function CatalogView({
  list,
  categories,
  componentOptions,
  type,
  categoryId,
  selectedId,
  detail,
  detailMissing,
  taxProfile,
  defaults,
  permissions,
}: {
  list: CatalogList;
  categories: Category[];
  componentOptions: CatalogItemRow[];
  type: CatalogType | "all";
  q: string;
  categoryId: string | null;
  selectedId: string | null;
  detail: CatalogItemDetail | null;
  detailMissing: boolean;
  taxProfile: TaxProfile;
  defaults: CatalogDefaults;
  permissions: CatalogPermissions;
}) {
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const href = useHref();
  const router = useRouter();
  const hasAny = list.workspaceTotal > 0;

  return (
    <div className={cn("two-pane-page", selectedId && "has-selection")}>
      <PageHeader
        title="Catalogo"
        subtitle="Servizi, prodotti e pacchetti riutilizzabili nei tuoi preventivi."
        action={
          <div className="header-actions">
            <Button
              variant="secondary"
              onClick={() => setManaging(true)}
              disabled={!permissions.categories}
              title={permissions.categories ? undefined : "Solo amministratori e proprietario gestiscono le categorie."}
            >
              <Tags size={16} aria-hidden="true" /> Categorie
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!permissions.write}>
              <Plus size={16} aria-hidden="true" /> Nuovo elemento
            </Button>
          </div>
        }
      />

      <div className="card toolbar">
        <FilterTabs
          label="Filtra per tipo"
          param="type"
          current={type}
          options={[
            { value: "all", label: "Tutti", count: list.counts.all },
            {
              value: "servizio",
              label: "Servizi",
              count: list.counts.servizio,
              icon: <TypeIcon type="servizio" size={16} />,
            },
            {
              value: "prodotto",
              label: "Prodotti",
              count: list.counts.prodotto,
              icon: <TypeIcon type="prodotto" size={16} />,
            },
            {
              value: "pacchetto",
              label: "Pacchetti",
              count: list.counts.pacchetto,
              icon: <TypeIcon type="pacchetto" size={16} />,
            },
          ]}
        />
        <div className="toolbar-end">
          <div className="field compact">
            <label htmlFor="category-filter" className="visually-hidden">
              Categoria
            </label>
            <select
              id="category-filter"
              value={categoryId ?? ""}
              onChange={(event) =>
                router.replace(
                  href({
                    category: event.target.value || null,
                    page: null,
                    id: null,
                  }),
                  { scroll: false },
                )
              }
            >
              <option value="">Tutte le categorie</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.itemCount})
                </option>
              ))}
            </select>
          </div>
          <SearchBox label="Cerca nel catalogo" placeholder="Cerca nel catalogo" />
        </div>
      </div>

      <div className="two-pane wide-list">
        <section className="card list-pane" aria-label="Elementi del catalogo">
          {list.items.length === 0 ? (
            <div className="list-empty">
              <Boxes size={22} aria-hidden="true" />
              <p>{hasAny ? "Nessun elemento corrisponde a ricerca e filtri." : "Il catalogo è vuoto. Crea il primo servizio o prodotto."}</p>
              {hasAny ? (
                <Link className="btn btn-secondary" href="/app/catalog" replace>
                  Azzera filtri
                </Link>
              ) : permissions.write ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus size={16} aria-hidden="true" /> Nuovo elemento
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="catalog-table">
              <div className="catalog-head" aria-hidden="true">
                <span>Elemento</span>
                <span>Categoria</span>
                <span>Prezzo</span>
              </div>
              <ul className="catalog-rows" aria-label="Elementi">
                {list.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={href({ id: item.id })}
                      className="catalog-row"
                      aria-current={item.id === selectedId ? "true" : undefined}
                      scroll={false}
                    >
                      <span className="catalog-name">
                        <span className="type-icon">
                          <TypeIcon type={item.type} />
                        </span>
                        <span>
                          <strong>{item.name}</strong>
                          <span className="muted small block clamp-1">{item.description ?? catalogTypeLabel[item.type]}</span>
                        </span>
                      </span>
                      <span className="catalog-cat">
                        <span className={cn("badge", `badge-type-${item.type}`)}>
                          <TypeIcon type={item.type} size={12} />
                          {item.categoryName ?? catalogTypeLabel[item.type]}
                        </span>
                      </span>
                      <span className="catalog-price">
                        {formatPrice(item.unitPriceCents, item.billing)}
                        {item.priceMode === "gross" ? <span className="muted small block">IVA inclusa</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} noun="elementi" />
        </section>

        <section className="detail-pane" aria-label="Dettaglio elemento">
          {selectedId ? (
            <Link href={href({ id: null })} className="btn btn-ghost back-link" scroll={false}>
              <ArrowLeft size={16} aria-hidden="true" /> Torna al catalogo
            </Link>
          ) : null}
          {detail ? (
            <CatalogDetailPanel
              key={detail.id}
              item={detail}
              taxProfile={taxProfile}
              permissions={permissions}
              categories={categories}
              componentOptions={componentOptions}
              defaults={defaults}
            />
          ) : detailMissing ? (
            <EmptyState title="Elemento non disponibile" body="L'elemento non esiste o è stato eliminato." />
          ) : (
            <EmptyState
              title={hasAny ? "Seleziona un elemento" : "Nessun elemento"}
              body={
                hasAny
                  ? "Apri un elemento per vedere prezzo, IVA, ricorrenza e composizione."
                  : "Le voci del catalogo vengono copiate nei preventivi: modificarle dopo non cambia i preventivi già creati."
              }
            />
          )}
          {!permissions.write ? (
            <p className="field-hint">
              <Settings2 size={14} aria-hidden="true" /> Il tuo ruolo permette solo la consultazione.
            </p>
          ) : null}
        </section>
      </div>

      <CatalogItemDialog
        open={creating}
        onClose={() => setCreating(false)}
        item={null}
        categories={categories}
        componentOptions={componentOptions}
        taxProfile={taxProfile}
        defaults={defaults}
      />
      {permissions.categories ? <CategoriesDialog open={managing} onClose={() => setManaging(false)} categories={categories} /> : null}
    </div>
  );
}

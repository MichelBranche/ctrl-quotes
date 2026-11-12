"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { CatalogItemDialog } from "@/components/catalog-data/item-form";
import { TypeIcon, type CatalogDefaults, type CatalogPermissions } from "@/components/catalog-data/catalog-view";
import { SectionTitle, useHref } from "@/components/data/controls";
import { ActionMenu } from "@/components/data/menu";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlays";
import {
  catalogBillingLabel,
  catalogTypeLabel,
  formatRate,
  formatPrice,
  previewComponents,
  previewLine,
  taxNatures,
} from "@/domain/catalog";
import { formatEuro } from "@/domain/money";
import type { TaxProfile } from "@/domain/pricing";
import { taxProfileLabel } from "@/domain/settings";
import { deleteCatalogItemAction, duplicateCatalogItemAction } from "@/server/actions/catalog";
import type { CatalogItemDetail, CatalogItemRow, Category } from "@/server/catalog";

export function CatalogDetailPanel({
  item,
  taxProfile,
  permissions,
  categories,
  componentOptions,
  defaults,
}: {
  item: CatalogItemDetail;
  taxProfile: TaxProfile;
  permissions: CatalogPermissions;
  categories: Category[];
  componentOptions: CatalogItemRow[];
  defaults: CatalogDefaults;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { pending, error, run } = useAction();
  const router = useRouter();
  const href = useHref();
  const price = previewLine(item, taxProfile);
  const components =
    item.type === "pacchetto" && item.components.length > 0 ? previewComponents(item.components, taxProfile) : null;
  const nature = taxNatures.find((option) => option.value === item.taxNature)?.label;
  const deleteReason = !permissions.remove
    ? "Solo amministratori e proprietario possono eliminare."
    : item.usedInPackages > 0
      ? "È inclusa in un pacchetto: rimuovila dal pacchetto prima di eliminarla."
      : undefined;

  return (
    <article className="card detail-card">
      <header className="detail-header">
        <span className="type-icon large">
          <TypeIcon type={item.type} size={22} />
        </span>
        <div className="detail-title">
          <h2>{item.name}</h2>
          <p className="muted">
            {catalogTypeLabel[item.type]}
            {item.categoryName ? ` · ${item.categoryName}` : ""}
          </p>
        </div>
        <ActionMenu
          label={`Azioni per ${item.name}`}
          items={[
            {
              label: "Elimina",
              icon: <Trash2 size={16} aria-hidden="true" />,
              danger: true,
              onSelect: () => setConfirmDelete(true),
              disabledReason: deleteReason,
            },
          ]}
        />
      </header>

      <section className="stack-tight">
        <SectionTitle>Descrizione</SectionTitle>
        <p className="description-box">{item.description ?? <span className="muted">Nessuna descrizione.</span>}</p>
      </section>

      <dl className="facts">
        <div>
          <dt>Prezzo</dt>
          <dd>
            {formatEuro(item.unitPriceCents)} {item.priceMode === "gross" ? "IVA inclusa" : "+ IVA"}
          </dd>
        </div>
        <div>
          <dt>Unità</dt>
          <dd>{item.unit ?? "Non indicata"}</dd>
        </div>
        <div>
          <dt>IVA</dt>
          <dd>
            {formatRate(item.taxRateBp)}
            {nature ? <span className="muted small block">{nature}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Ricorrenza</dt>
          <dd>
            {catalogBillingLabel[item.billing]}
            {item.periods ? <span className="muted small block">per {item.periods} periodi</span> : null}
          </dd>
        </div>
      </dl>

      <section className="card inset price-box" aria-label="Calcolo prezzo">
        <SectionTitle>Calcolo per 1 unità</SectionTitle>
        <dl className="totals">
          <div>
            <dt>Imponibile</dt>
            <dd>{formatEuro(price.netCents)}</dd>
          </div>
          <div>
            <dt>IVA</dt>
            <dd>{formatEuro(price.vatCents)}</dd>
          </div>
          <div className="total">
            <dt>Totale</dt>
            <dd>{formatEuro(price.totalCents)}</dd>
          </div>
        </dl>
        <p className="muted small">
          Regime {taxProfileLabel[taxProfile].toLowerCase()}. Il calcolo usa lo stesso motore dei preventivi.
          {taxProfile !== "ordinario" ? " Con questo regime l'IVA non viene applicata." : ""}
        </p>
      </section>

      {item.type === "pacchetto" ? (
        <section className="stack-tight">
          <SectionTitle>Voci incluse</SectionTitle>
          <ul className="component-list">
            {item.components.map((component) => (
              <li key={component.itemId}>
                <span>
                  {component.quantityMilli / 1000 !== 1 ? `${(component.quantityMilli / 1000).toLocaleString("it-IT")} × ` : ""}
                  {component.name}
                </span>
                <span className="muted">{formatPrice(Math.round((component.unitPriceCents * component.quantityMilli) / 1000), component.billing)}</span>
              </li>
            ))}
          </ul>
          {components ? (
            <p className="muted small">
              Valore delle voci singole: {formatEuro(components.oneTime.netCents)} imponibile una tantum
              {components.monthly.netCents ? `, ${formatEuro(components.monthly.netCents)} al mese` : ""}
              {components.yearly.netCents ? `, ${formatEuro(components.yearly.netCents)} all'anno` : ""}. Il prezzo del pacchetto è quello
              indicato sopra.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="switch-summary">
        <span className={item.optionalDefault ? "badge badge-info" : "badge badge-draft"}>
          {item.optionalDefault ? "Opzionale nei preventivi" : "Sempre incluso nei preventivi"}
        </span>
        {item.usedInPackages > 0 ? (
          <span className="badge badge-draft">
            In {item.usedInPackages} {item.usedInPackages === 1 ? "pacchetto" : "pacchetti"}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="detail-actions">
        <Button
          variant="secondary"
          loading={pending}
          disabled={!permissions.write}
          onClick={() => run(() => duplicateCatalogItemAction(item.id), (value) => router.push(href({ id: value.id }), { scroll: false }))}
        >
          <Copy size={16} aria-hidden="true" /> Duplica
        </Button>
        <Button onClick={() => setEditing(true)} disabled={!permissions.write}>
          <Pencil size={16} aria-hidden="true" /> Modifica
        </Button>
      </div>

      <CatalogItemDialog
        open={editing}
        onClose={() => setEditing(false)}
        item={item}
        categories={categories}
        componentOptions={componentOptions}
        taxProfile={taxProfile}
        defaults={defaults}
      />
      <Dialog open={confirmDelete} title="Eliminare l'elemento?" onClose={() => setConfirmDelete(false)}>
        <p>{item.name} non sarà più disponibile per i nuovi preventivi.</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)} autoFocus>
            Annulla
          </Button>
          <Button
            className="btn-danger"
            loading={pending}
            onClick={() =>
              run(
                () => deleteCatalogItemAction(item.id),
                () => {
                  setConfirmDelete(false);
                  router.replace(href({ id: null }), { scroll: false });
                },
              )
            }
          >
            Elimina
          </Button>
        </div>
      </Dialog>
    </article>
  );
}

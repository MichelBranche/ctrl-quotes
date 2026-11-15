"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { HoldDelete } from "@/components/ui/destructive";

export function CatalogDetailPanel({
  item,
  taxProfile,
  permissions,
  categories,
  componentOptions,
  defaults,
  closeSlot,
}: {
  closeSlot?: ReactNode;
  item: CatalogItemDetail;
  taxProfile: TaxProfile;
  permissions: CatalogPermissions;
  categories: Category[];
  componentOptions: CatalogItemRow[];
  defaults: CatalogDefaults;
}) {
  const [editingLocal, setEditing] = useState(false);
  const [confirmLocal, setConfirmDelete] = useState(false);
  const { pending, error, run } = useAction();
  const router = useRouter();
  const href = useHref();
  // Row actions in the table open this item with ?azione=modifica|elimina: same dialogs as the buttons here.
  const intent = useSearchParams().get("azione");
  const editing = editingLocal || (intent === "modifica" && permissions.write);
  const confirmDelete = confirmLocal || intent === "elimina";
  const clearIntent = () => {
    if (intent) router.replace(href({ azione: null }), { scroll: false });
  };
  const closeEdit = () => {
    setEditing(false);
    clearIntent();
  };
  const closeConfirm = () => {
    setConfirmDelete(false);
    clearIntent();
  };
  const duplicate = () => run(() => duplicateCatalogItemAction(item.id), (value) => router.push(href({ id: value.id, azione: null }), { scroll: false }));
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
        <Button className="ct-edit-btn" onClick={() => setEditing(true)} disabled={!permissions.write} title={permissions.write ? "Modifica elemento" : "Il tuo ruolo permette solo la consultazione."}>
          <Pencil size={16} aria-hidden="true" /> Modifica
        </Button>
        <ActionMenu
          label={`Azioni per ${item.name}`}
          items={[
            {
              label: "Duplica",
              icon: <Copy size={16} aria-hidden="true" />,
              onSelect: duplicate,
              disabledReason: permissions.write ? undefined : "Il tuo ruolo permette solo la consultazione.",
            },
            {
              label: "Elimina",
              icon: <Trash2 size={16} aria-hidden="true" />,
              danger: true,
              onSelect: () => setConfirmDelete(true),
              disabledReason: deleteReason,
            },
          ]}
        />
        {closeSlot}
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
      <CatalogItemDialog
        open={editing}
        onClose={closeEdit}
        item={item}
        categories={categories}
        componentOptions={componentOptions}
        taxProfile={taxProfile}
        defaults={defaults}
      />
      <Dialog open={confirmDelete} title="Eliminare l'elemento?" onClose={closeConfirm}>
        <p>{deleteReason ?? `${item.name} non sarà più disponibile per i nuovi preventivi.`}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={closeConfirm} autoFocus>
            {deleteReason ? "Chiudi" : "Annulla"}
          </Button>
          {deleteReason ? null : (
          <HoldDelete
            disabled={pending}
            onHold={() =>
              run(
                () => deleteCatalogItemAction(item.id),
                () => {
                  setConfirmDelete(false);
                  router.replace(href({ id: null, azione: null }), { scroll: false });
                },
              )
            }
          />
          )}
        </div>
      </Dialog>
    </article>
  );
}

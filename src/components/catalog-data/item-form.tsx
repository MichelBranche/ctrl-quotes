"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { TypeIcon, type CatalogDefaults } from "@/components/catalog-data/catalog-view";
import { Switch, useHref } from "@/components/data/controls";
import { FormError, TextAreaField } from "@/components/data/fields";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import {
  catalogBillingLabel,
  catalogBillings,
  catalogTypeLabel,
  catalogTypes,
  centsToInput,
  parseEuroToCents,
  parseQuantity,
  previewComponents,
  previewLine,
  taxNatures,
  taxRateOptions,
  type CatalogBilling,
  type CatalogType,
} from "@/domain/catalog";
import { formatEuro } from "@/domain/money";
import type { PriceMode, TaxProfile } from "@/domain/pricing";
import { saveCatalogItemAction } from "@/server/actions/catalog";
import type { CatalogItemDetail, CatalogItemRow, Category } from "@/server/catalog";

type Component = { itemId: string; quantity: string };

export function CatalogItemDialog(props: {
  open: boolean;
  onClose: () => void;
  item: CatalogItemDetail | null;
  categories: Category[];
  componentOptions: CatalogItemRow[];
  taxProfile: TaxProfile;
  defaults: CatalogDefaults;
}) {
  return (
    <Dialog open={props.open} title={props.item ? "Modifica elemento" : "Nuovo elemento"} onClose={props.onClose}>
      {props.open ? <ItemForm {...props} /> : null}
    </Dialog>
  );
}

function ItemForm({
  onClose,
  item,
  categories,
  componentOptions,
  taxProfile,
  defaults,
}: {
  onClose: () => void;
  item: CatalogItemDetail | null;
  categories: Category[];
  componentOptions: CatalogItemRow[];
  taxProfile: TaxProfile;
  defaults: CatalogDefaults;
}) {
  const [type, setType] = useState<CatalogType>(item?.type ?? "servizio");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [price, setPrice] = useState(item ? centsToInput(item.unitPriceCents) : "");
  const [priceMode, setPriceMode] = useState<PriceMode>(item?.priceMode ?? defaults.priceMode);
  const [taxRateBp, setTaxRateBp] = useState(item?.taxRateBp ?? defaults.taxRateBp);
  const [taxNature, setTaxNature] = useState(item?.taxNature ?? "");
  const [billing, setBilling] = useState<CatalogBilling>(item?.billing ?? "una_tantum");
  const [periods, setPeriods] = useState(item?.periods ? String(item.periods) : "");
  const [optional, setOptional] = useState(item?.optionalDefault ?? false);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [components, setComponents] = useState<Component[]>(
    item?.components.map((component) => ({
      itemId: component.itemId,
      quantity: (component.quantityMilli / 1000).toLocaleString("it-IT"),
    })) ?? [],
  );
  const [picker, setPicker] = useState("");
  const { pending, error, setError, run } = useAction();
  const router = useRouter();
  const href = useHref();

  const cents = parseEuroToCents(price);
  const preview = cents === null ? null : previewLine({ unitPriceCents: cents, priceMode, taxRateBp, billing }, taxProfile);
  const options = componentOptions.filter((option) => option.id !== item?.id);
  const componentSum = useMemo(() => {
    const lines = components.flatMap((component) => {
      const option = componentOptions.find((entry) => entry.id === component.itemId);
      const quantityMilli = parseQuantity(component.quantity);
      return option && quantityMilli ? [{ ...option, quantityMilli }] : [];
    });
    return lines.length ? previewComponents(lines, taxProfile) : null;
  }, [components, componentOptions, taxProfile]);

  function submit() {
    if (cents === null) {
      setError("Inserisci un prezzo valido, per esempio 1.200,00.");
      return;
    }
    const parsedComponents = [];
    for (const component of components) {
      const quantityMilli = parseQuantity(component.quantity);
      if (!quantityMilli) {
        setError("Controlla le quantità del pacchetto: usa numeri maggiori di zero.");
        return;
      }
      parsedComponents.push({ itemId: component.itemId, quantityMilli });
    }
    const periodsValue = billing === "una_tantum" || periods.trim() === "" ? null : Number.parseInt(periods, 10);
    if (periodsValue !== null && !Number.isFinite(periodsValue)) {
      setError("La durata deve essere un numero intero.");
      return;
    }
    const input = {
      type,
      name,
      description,
      unit,
      unitPriceCents: cents,
      priceMode,
      taxRateBp,
      taxNature: taxRateBp === 0 ? taxNature || null : null,
      billing,
      periods: periodsValue,
      optionalDefault: optional,
      categoryId: categoryId || null,
      components: type === "pacchetto" ? parsedComponents : [],
    };
    run(
      () => saveCatalogItemAction(item?.id ?? null, input),
      (value) => {
        onClose();
        if (!item) router.push(href({ id: value.id }), { scroll: false });
      },
    );
  }

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormError message={error} />
      <fieldset className="type-picker">
        <legend className="field-label">Tipo</legend>
        {catalogTypes.map((option) => (
          <label key={option} className={type === option ? "is-selected" : undefined}>
            <input type="radio" name="type" value={option} checked={type === option} onChange={() => setType(option)} />
            <TypeIcon type={option} size={16} />
            {catalogTypeLabel[option]}
          </label>
        ))}
      </fieldset>
      <TextField label="Nome" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      <TextAreaField label="Descrizione" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      <div className="grid-3">
        <TextField
          label="Prezzo (€)"
          inputMode="decimal"
          required
          value={price}
          placeholder="1.200,00"
          onChange={(event) => setPrice(event.target.value)}
          error={price !== "" && cents === null ? "Formato non valido." : undefined}
        />
        <SelectField
          label="Il prezzo è"
          value={priceMode}
          onChange={(event) => setPriceMode(event.target.value === "gross" ? "gross" : "net")}
          options={[
            { value: "net", label: "IVA esclusa" },
            { value: "gross", label: "IVA inclusa" },
          ]}
        />
        <SelectField
          label="IVA"
          value={String(taxRateBp)}
          onChange={(event) => setTaxRateBp(Number(event.target.value))}
          options={taxRateOptions.map((option) => ({ value: String(option.value), label: option.label }))}
        />
      </div>
      {taxRateBp === 0 ? (
        <SelectField
          label="Natura dell'operazione (obbligatoria con IVA 0%)"
          value={taxNature}
          onChange={(event) => setTaxNature(event.target.value)}
          options={[{ value: "", label: "Scegli la natura" }, ...taxNatures.map((option) => ({ value: option.value, label: option.label }))]}
        />
      ) : null}
      <div className="grid-3">
        <SelectField
          label="Ricorrenza"
          value={billing}
          onChange={(event) => setBilling(event.target.value as CatalogBilling)}
          options={catalogBillings.map((option) => ({ value: option, label: catalogBillingLabel[option] }))}
        />
        <TextField
          label="Durata in periodi"
          inputMode="numeric"
          value={billing === "una_tantum" ? "" : periods}
          disabled={billing === "una_tantum"}
          placeholder={billing === "una_tantum" ? "Solo ricorrenti" : "Facoltativa"}
          onChange={(event) => setPeriods(event.target.value.replace(/\D/g, ""))}
        />
        <TextField label="Unità" maxLength={30} value={unit} placeholder="ora, pezzo, mese" onChange={(event) => setUnit(event.target.value)} />
      </div>
      <SelectField
        label="Categoria"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        options={[{ value: "", label: "Nessuna categoria" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]}
      />
      {categories.length === 0 ? <p className="field-hint">Le categorie si creano dal pulsante Categorie.</p> : null}

      {type === "pacchetto" ? (
        <fieldset className="package-editor">
          <legend className="field-label">Voci incluse nel pacchetto</legend>
          {components.length === 0 ? <p className="field-hint">Aggiungi almeno una voce già presente nel catalogo.</p> : null}
          <ul>
            {components.map((component, index) => {
              const option = componentOptions.find((entry) => entry.id === component.itemId);
              return (
                <li key={component.itemId}>
                  <span className="clamp-1">{option?.name ?? "Voce non più disponibile"}</span>
                  <label className="visually-hidden" htmlFor={`qty-${component.itemId}`}>
                    Quantità di {option?.name}
                  </label>
                  <input
                    id={`qty-${component.itemId}`}
                    className="qty-input"
                    inputMode="decimal"
                    value={component.quantity}
                    onChange={(event) =>
                      setComponents((current) =>
                        current.map((entry, position) => (position === index ? { ...entry, quantity: event.target.value } : entry)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    aria-label={`Rimuovi ${option?.name ?? "voce"}`}
                    onClick={() => setComponents((current) => current.filter((_, position) => position !== index))}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="picker-row">
            <div className="field compact">
              <label htmlFor="component-picker" className="visually-hidden">
                Voce da aggiungere
              </label>
              <select id="component-picker" value={picker} onChange={(event) => setPicker(event.target.value)}>
                <option value="">Scegli una voce</option>
                {options
                  .filter((option) => !components.some((component) => component.itemId === option.id))
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              variant="secondary"
              disabled={!picker}
              onClick={() => {
                setComponents((current) => [...current, { itemId: picker, quantity: "1" }]);
                setPicker("");
              }}
            >
              <Plus size={16} aria-hidden="true" /> Aggiungi
            </Button>
          </div>
          {options.length === 0 ? <p className="field-hint">Prima crea qualche servizio o prodotto da includere.</p> : null}
          {componentSum ? (
            <p className="muted small">
              Valore delle voci: {formatEuro(componentSum.oneTime.netCents)} una tantum
              {componentSum.monthly.netCents ? `, ${formatEuro(componentSum.monthly.netCents)} al mese` : ""}
              {componentSum.yearly.netCents ? `, ${formatEuro(componentSum.yearly.netCents)} all'anno` : ""}, IVA esclusa.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <Switch label="Rendi opzionale nei preventivi" hint="Il cliente potrà scegliere se includerlo." checked={optional} onChange={setOptional} />

      <div className="live-total" aria-live="polite">
        {preview ? (
          <>
            <span>Imponibile {formatEuro(preview.netCents)}</span>
            <span>IVA {formatEuro(preview.vatCents)}</span>
            <strong>Totale {formatEuro(preview.totalCents)}</strong>
          </>
        ) : (
          <span className="muted">Inserisci un prezzo per vedere il calcolo.</span>
        )}
      </div>

      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose}>
          Annulla
        </Button>
        <Button type="submit" loading={pending}>
          {item ? "Salva modifiche" : "Crea elemento"}
        </Button>
      </div>
    </form>
  );
}

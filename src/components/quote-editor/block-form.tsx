"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BookOpen, ImagePlus, Plus, Search, Trash2 } from "lucide-react";
import { TextAreaField } from "@/components/data/fields";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import { catalogBillingLabel, catalogBillings, catalogTypeLabel, formatPrice, taxNatures, taxRateOptions } from "@/domain/catalog";
import { formatEuro } from "@/domain/money";
import type { PriceMode, TaxProfile } from "@/domain/pricing";
import { blankLine, blockHint, blockLabel, lineNetCents, type BlockOf, type QuoteBlock, type QuoteLine, type QuoteTotals } from "@/domain/quote-document";
import { summaryGroups } from "@/domain/quote-snapshot";
import { catalogLinesAction, uploadQuoteImageAction } from "@/server/actions/quotes";
import type { QuotableItem } from "@/server/quotes";
import { cn } from "@/lib/cn";
import { IntInput, MoneyInput, PercentInput, QuantityInput } from "./inputs";

export type FormContext = {
  quoteId: string;
  items: QuotableItem[];
  defaults: { taxRateBp: number; priceMode: PriceMode };
  taxProfile: TaxProfile;
  totals: QuoteTotals;
  readOnly: boolean;
};

export function BlockForm({ block, onChange, ctx }: { block: QuoteBlock; onChange: (block: QuoteBlock) => void; ctx: FormContext }) {
  return (
    <fieldset className="block-form" disabled={ctx.readOnly}>
      <legend className="visually-hidden">{blockLabel[block.type]}</legend>
      <p className="muted small">{blockHint[block.type]}</p>
      <Fields block={block} onChange={onChange} ctx={ctx} />
    </fieldset>
  );
}

function Fields({ block, onChange, ctx }: { block: QuoteBlock; onChange: (block: QuoteBlock) => void; ctx: FormContext }) {
  switch (block.type) {
    case "cover":
      return (
        <>
          <TextField label="Titolo" value={block.title} maxLength={120} placeholder="Vuoto: usa il titolo del preventivo" onChange={(event) => onChange({ ...block, title: event.target.value })} />
          <TextAreaField label="Sottotitolo" value={block.subtitle} maxLength={400} rows={3} onChange={(event) => onChange({ ...block, subtitle: event.target.value })} />
          <ImagePicker
            label="Immagine di copertina"
            quoteId={ctx.quoteId}
            assetId={block.imageAssetId}
            onAsset={(assetId) => onChange({ ...block, imageAssetId: assetId })}
          />
        </>
      );
    case "intro":
    case "text":
    case "terms":
    case "contacts":
      return (
        <>
          <TextField label="Titolo della sezione" value={block.heading} maxLength={120} onChange={(event) => onChange({ ...block, heading: event.target.value })} />
          <TextAreaField
            label={block.type === "contacts" ? "Messaggio (facoltativo)" : "Testo"}
            hint={
              block.type === "contacts"
                ? "I dati aziendali arrivano dal Brand Kit, quelli del cliente dalla rubrica."
                : "Testo semplice. Una riga vuota separa i paragrafi."
            }
            value={block.body}
            maxLength={6000}
            rows={block.type === "terms" ? 10 : 7}
            onChange={(event) => onChange({ ...block, body: event.target.value })}
          />
          {block.type === "contacts" ? (
            <p className="small">
              <Link href="/app/settings/brand">Modifica i dati aziendali nel Brand Kit</Link>
            </p>
          ) : null}
        </>
      );
    case "image":
      return (
        <>
          <ImagePicker label="Immagine" quoteId={ctx.quoteId} assetId={block.assetId} onAsset={(assetId) => onChange({ ...block, assetId })} />
          <TextField label="Testo alternativo" hint="Descrive l'immagine a chi usa un lettore di schermo." value={block.alt} maxLength={200} onChange={(event) => onChange({ ...block, alt: event.target.value })} />
          <TextField label="Didascalia" value={block.caption} maxLength={300} onChange={(event) => onChange({ ...block, caption: event.target.value })} />
        </>
      );
    case "services":
    case "options":
      return <LinesForm block={block} onChange={onChange} ctx={ctx} />;
    case "summary":
      return (
        <>
          <TextField label="Titolo della sezione" value={block.heading} maxLength={120} onChange={(event) => onChange({ ...block, heading: event.target.value })} />
          <div className="summary-preview" aria-live="polite">
            {summaryGroups(ctx.totals).map((group) => (
              <div key={group.title}>
                <p className="muted small">{group.title}</p>
                {group.rows.map((row) => (
                  <div key={row.label} className={cn("summary-line", row.strong && "is-strong")}>
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ))}
              </div>
            ))}
            <p className="muted small">Calcolato sul server a ogni salvataggio, con il regime fiscale del workspace.</p>
          </div>
          <TextAreaField label="Nota sotto il riepilogo" value={block.body} maxLength={6000} rows={4} onChange={(event) => onChange({ ...block, body: event.target.value })} />
        </>
      );
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

function ImagePicker({ label, quoteId, assetId, onAsset }: { label: string; quoteId: string; assetId: string | null; onAsset: (id: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { run, pending, error } = useAction();
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {assetId ? (
        <div className="image-pick">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/assets/${assetId}`} alt="" />
          <div className="image-pick-actions">
            <Button variant="secondary" className="btn-sm" onClick={() => input.current?.click()} loading={pending}>
              Sostituisci
            </Button>
            <Button variant="ghost" className="btn-sm" onClick={() => onAsset(null)}>
              <Trash2 size={14} aria-hidden="true" /> Rimuovi
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" className="dropzone image-drop" onClick={() => input.current?.click()} disabled={pending}>
          <ImagePlus size={20} aria-hidden="true" />
          <span>{pending ? "Caricamento in corso" : "Carica PNG o JPG, massimo 1,5 MB"}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const form = new FormData();
          form.set("file", file);
          run(() => uploadQuoteImageAction(quoteId, form), (value) => onAsset(value.assetId));
        }}
      />
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function LinesForm({
  block,
  onChange,
  ctx,
}: {
  block: BlockOf<"services"> | BlockOf<"options">;
  onChange: (block: QuoteBlock) => void;
  ctx: FormContext;
}) {
  const [picking, setPicking] = useState(false);
  const [openLine, setOpenLine] = useState<string | null>(block.items[0]?.id ?? null);
  const update = (items: QuoteLine[]) => onChange({ ...block, items });
  const setLine = (id: string, patch: Partial<QuoteLine>) => update(block.items.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= block.items.length) return;
    const next = [...block.items];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    update(next);
  };
  return (
    <>
      <TextField label="Titolo della sezione" value={block.heading} maxLength={120} onChange={(event) => onChange({ ...block, heading: event.target.value })} />
      {block.type === "options" ? (
        <TextAreaField
          label="Introduzione alle opzioni"
          hint="Le opzioni sono mostrate a parte e non entrano nel totale."
          value={block.body}
          maxLength={6000}
          rows={3}
          onChange={(event) => onChange({ ...block, body: event.target.value })}
        />
      ) : null}
      <div className="lines-head">
        <strong>Voci</strong>
        <span className="muted small">{block.items.length}</span>
      </div>
      {block.items.length === 0 ? <p className="muted small">Nessuna voce. Aggiungila dal catalogo o come voce libera.</p> : null}
      <ol className="line-list">
        {block.items.map((line, index) => {
          const open = openLine === line.id;
          return (
            <li key={line.id} className={cn("line-card", open && "is-open")}>
              <button type="button" className="line-summary" aria-expanded={open} onClick={() => setOpenLine(open ? null : line.id)}>
                <span className="clamp-1">
                  <strong>{line.name || "Senza nome"}</strong>
                  {line.catalogItemId ? <span className="muted small"> · dal catalogo</span> : null}
                </span>
                <span className="line-amount">
                  {formatEuro(lineNetCents(line, ctx.taxProfile))}
                  {line.billing !== "una_tantum" ? <span className="muted small"> {catalogBillingLabel[line.billing].toLowerCase()}</span> : null}
                </span>
              </button>
              {open ? (
                <div className="line-fields">
                  <TextField label="Nome" value={line.name} maxLength={160} onChange={(event) => setLine(line.id, { name: event.target.value })} />
                  <TextAreaField label="Descrizione" value={line.description} maxLength={1000} rows={2} onChange={(event) => setLine(line.id, { description: event.target.value })} />
                  <div className="line-grid">
                    <QuantityInput label="Quantità" milli={line.quantityMilli} onMilli={(quantityMilli) => setLine(line.id, { quantityMilli })} />
                    <TextField label="Unità" value={line.unit} maxLength={30} placeholder="ore, pz" onChange={(event) => setLine(line.id, { unit: event.target.value })} />
                    <MoneyInput label={line.priceMode === "gross" ? "Prezzo IVA incl." : "Prezzo unitario"} cents={line.unitPriceCents} onCents={(unitPriceCents) => setLine(line.id, { unitPriceCents })} />
                    <PercentInput label="Sconto" bp={line.discountBp} onBp={(discountBp) => setLine(line.id, { discountBp })} />
                    <SelectField
                      label="IVA"
                      value={String(line.taxRateBp)}
                      options={taxRateOptions.map((option) => ({ value: String(option.value), label: option.label }))}
                      onChange={(event) => {
                        const taxRateBp = Number(event.target.value);
                        setLine(line.id, { taxRateBp, taxNature: taxRateBp === 0 ? (line.taxNature ?? "N2.2") : null });
                      }}
                    />
                    {line.taxRateBp === 0 ? (
                      <SelectField
                        label="Natura"
                        value={line.taxNature ?? "N2.2"}
                        options={taxNatures.map((option) => ({ value: option.value, label: option.label }))}
                        onChange={(event) => setLine(line.id, { taxNature: event.target.value })}
                      />
                    ) : (
                      <SelectField
                        label="Prezzo"
                        value={line.priceMode}
                        options={[
                          { value: "net", label: "IVA esclusa" },
                          { value: "gross", label: "IVA inclusa" },
                        ]}
                        onChange={(event) => setLine(line.id, { priceMode: event.target.value === "gross" ? "gross" : "net" })}
                      />
                    )}
                    <SelectField
                      label="Ricorrenza"
                      value={line.billing}
                      options={catalogBillings.map((billing) => ({ value: billing, label: catalogBillingLabel[billing] }))}
                      onChange={(event) => {
                        const billing = catalogBillings.find((value) => value === event.target.value) ?? "una_tantum";
                        setLine(line.id, { billing, periods: billing === "una_tantum" ? null : line.periods });
                      }}
                    />
                    {line.billing !== "una_tantum" ? (
                      <IntInput label="Durata (periodi)" value={line.periods} min={1} max={120} onValue={(periods) => setLine(line.id, { periods })} />
                    ) : null}
                  </div>
                  {ctx.taxProfile !== "ordinario" ? (
                    <p className="muted small">Con il regime {ctx.taxProfile} l&apos;IVA non viene applicata nei totali.</p>
                  ) : null}
                  <div className="line-actions">
                    <Button variant="ghost" className="btn-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Sposta voce su">
                      <ArrowUp size={14} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" className="btn-sm" onClick={() => move(index, 1)} disabled={index === block.items.length - 1} aria-label="Sposta voce giù">
                      <ArrowDown size={14} aria-hidden="true" />
                    </Button>
                    <span className="flex-spacer" />
                    <Button variant="ghost" className="btn-sm danger-text" onClick={() => update(block.items.filter((entry) => entry.id !== line.id))}>
                      <Trash2 size={14} aria-hidden="true" /> Rimuovi voce
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {ctx.readOnly ? null : (
        <div className="lines-add">
          <Button variant="secondary" className="btn-sm" onClick={() => setPicking(true)} disabled={ctx.items.length === 0} title={ctx.items.length === 0 ? "Il catalogo è vuoto." : undefined}>
            <BookOpen size={14} aria-hidden="true" /> Dal catalogo
          </Button>
          <Button
            variant="secondary"
            className="btn-sm"
            onClick={() => {
              const line = blankLine(ctx.defaults);
              update([...block.items, line]);
              setOpenLine(line.id);
            }}
          >
            <Plus size={14} aria-hidden="true" /> Voce libera
          </Button>
        </div>
      )}
      <CatalogPicker
        open={picking}
        items={ctx.items}
        onClose={() => setPicking(false)}
        onLines={(lines) => {
          update([...block.items, ...lines]);
          setPicking(false);
        }}
      />
    </>
  );
}

function CatalogPicker({ open, items, onClose, onLines }: { open: boolean; items: QuotableItem[]; onClose: () => void; onLines: (lines: QuoteLine[]) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const { run, pending, error } = useAction();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => `${item.name} ${item.description ?? ""}`.toLowerCase().includes(q)) : items;
  }, [items, query]);
  return (
    <Dialog open={open} title="Aggiungi dal catalogo" onClose={onClose}>
      <p className="muted small">Le voci vengono copiate: modifiche future al catalogo non cambiano questo preventivo.</p>
      <div className="search-box">
        <Search size={16} aria-hidden="true" />
        <label htmlFor="picker-search" className="visually-hidden">
          Cerca nel catalogo
        </label>
        <input id="picker-search" type="search" value={query} placeholder="Cerca nel catalogo" onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      </div>
      <ul className="pick-list tall" aria-label="Voci del catalogo">
        {filtered.slice(0, 120).map((item) => {
          const checked = selected.includes(item.id);
          return (
            <li key={item.id}>
              <label className={cn("pick-row", checked && "is-selected")}>
                <input type="checkbox" checked={checked} onChange={() => setSelected((current) => (checked ? current.filter((id) => id !== item.id) : [...current, item.id]))} />
                <span className="choice-text">
                  <strong>{item.name}</strong>
                  <span className="muted small">{catalogTypeLabel[item.type]}</span>
                </span>
                <span className="pick-price">{formatPrice(item.unitPriceCents, item.billing)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose}>
          Annulla
        </Button>
        <Button
          loading={pending}
          disabled={selected.length === 0}
          onClick={() =>
            run(
              () => catalogLinesAction(selected),
              (lines) => {
                setSelected([]);
                onLines(lines);
              },
            )
          }
        >
          Aggiungi {selected.length || ""}
        </Button>
      </div>
    </Dialog>
  );
}

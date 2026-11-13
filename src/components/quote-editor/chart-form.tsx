"use client";

import { useId } from "react";
import { ChartPie, CircleDot } from "lucide-react";
import { TextField } from "@/components/ui/fields";
import type { TaxProfile } from "@/domain/pricing";
import { chartHeading, type ChartBlockType, type QuoteBlock } from "@/domain/quote-document";
import { cn } from "@/lib/cn";

type ChartBlock = Extract<QuoteBlock, { type: ChartBlockType }>;

const source: Record<ChartBlockType, string> = {
  chartCosts: "Calcolato dai servizi visibili, con gli stessi importi del Riepilogo.",
  chartBars: "Calcolato dai servizi visibili, con gli stessi importi del Riepilogo.",
  chartTimeline: "Disegnata dalle fasi del blocco Tempistiche. Periodi come «Settimane 2-3» o «3 settimane» danno le durate reali.",
  chartPayments: "Letto dal campo Pagamento delle Condizioni, per esempio «40% alla conferma, 60% alla consegna». Le rate devono fare 100%, oppure finire con un «saldo».",
};

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string; icon?: React.ReactNode }>; onChange: (value: T) => void }) {
  const id = useId();
  return (
    <div className="field chart-field">
      <span id={id} className="chart-field-label">
        {label}
      </span>
      <div className="chart-seg" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={cn("chart-seg-item", value === option.value && "is-active")}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="ve-switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="ve-switch-track" aria-hidden="true" />
      <span>
        {label}
        {hint ? <small className="muted">{hint}</small> : null}
      </span>
    </label>
  );
}

/** What the chart shows: title, data source, grouping and VAT. */
export function ChartContentFields({ block, onChange, taxProfile }: { block: ChartBlock; onChange: (block: QuoteBlock) => void; taxProfile: TaxProfile }) {
  const costs = block.type === "chartCosts" || block.type === "chartBars";
  const vat = taxProfile === "ordinario" && block.type !== "chartTimeline";
  const vatDefault = block.type === "chartPayments" ? "IVA inclusa" : "IVA esclusa";
  return (
    <div className="chart-form">
      <TextField label="Titolo della sezione" value={block.heading} maxLength={120} placeholder={chartHeading[block.type]} onChange={(event) => onChange({ ...block, heading: event.target.value })} />
      <p className="chart-source small">{source[block.type]}</p>
      {costs ? (
        <Segmented
          label="Raggruppa"
          value={block.group}
          options={[
            { value: "line", label: "Per voce" },
            { value: "section", label: "Per sezione" },
          ]}
          onChange={(group) => onChange({ ...block, group })}
        />
      ) : null}
      {costs && block.group === "section" ? <p className="muted small">Ogni blocco Servizi è una sezione, con il suo titolo (per esempio «Design» e «Sviluppo»).</p> : null}
      {vat ? (
        <Segmented
          label="Importi"
          value={block.vat}
          options={[
            { value: "auto", label: "Automatico" },
            { value: "net", label: "IVA esclusa" },
            { value: "gross", label: "IVA inclusa" },
          ]}
          onChange={(value) => onChange({ ...block, vat: value })}
        />
      ) : null}
      {vat && block.vat === "auto" ? <p className="muted small">Automatico: {vatDefault}, coerente con {block.type === "chartPayments" ? "il totale da pagare" : "il Riepilogo"}.</p> : null}
    </div>
  );
}

/** How the chart looks: variant, legend, amounts and shares. Colours and type come from the template. */
export function ChartStyleFields({ block, onChange }: { block: ChartBlock; onChange: (block: QuoteBlock) => void }) {
  return (
    <div className="chart-form">
      {block.type === "chartCosts" ? (
        <Segmented
          label="Forma"
          value={block.variant}
          options={[
            { value: "donut", label: "Ciambella", icon: <CircleDot size={14} aria-hidden="true" /> },
            { value: "pie", label: "Torta", icon: <ChartPie size={14} aria-hidden="true" /> },
          ]}
          onChange={(variant) => onChange({ ...block, variant })}
        />
      ) : null}
      {block.type !== "chartBars" ? (
        <Switch
          label={block.type === "chartTimeline" ? "Mostra i periodi" : block.type === "chartPayments" ? "Mostra la descrizione delle rate" : "Mostra la legenda"}
          checked={block.legend}
          onChange={(legend) => onChange({ ...block, legend })}
        />
      ) : null}
      {block.type !== "chartTimeline" ? (
        <>
          <Switch label="Mostra gli importi" hint="In euro, come nel Riepilogo." checked={block.amounts} onChange={(amounts) => onChange({ ...block, amounts })} />
          <Switch label="Mostra le percentuali" hint="Arrotondate all'intero, sommano sempre a 100%." checked={block.percents} onChange={(percents) => onChange({ ...block, percents })} />
        </>
      ) : null}
      <p className="muted small">Colori, caratteri e spaziature seguono il template e il colore d'accento scelto in Stile.</p>
    </div>
  );
}

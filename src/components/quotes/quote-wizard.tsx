"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Check, Search, UserRound } from "lucide-react";
import { FROM_BOTTOM, FROM_TOP, cardEase, useCardMotion } from "@/components/motion/card-motion";
import { useMoving, useSectionTransition } from "@/components/motion/section-transition";
import { TemplateCover } from "@/components/templates/template-cover";
import { templateInfo } from "@/domain/templates";
import { TextAreaField, FormError } from "@/components/data/fields";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { ClientAvatar } from "@/components/ui/data-display";
import { EmptyState, StatusBadge } from "@/components/ui/status";
import { catalogTypeLabel, formatPrice } from "@/domain/catalog";
import type { TaxProfile } from "@/domain/pricing";
import { computeTotals, initialDocument, lineFromCatalog } from "@/domain/quote-document";
import { headlineTotal } from "@/domain/quote-snapshot";
import { createQuoteAction } from "@/server/actions/quotes";
import type { ClientOption, QuotableItem } from "@/server/quotes";
import type { TemplateRow } from "@/server/templates";
import { cn } from "@/lib/cn";

type Step = 1 | 2 | 3;

const stepLabels: Record<Step, string> = { 1: "Cliente", 2: "Template", 3: "Contenuti" };

export function QuoteWizard({
  clients,
  items,
  templates,
  preselectedClientId,
  defaults,
  brand,
  canWrite,
}: {
  clients: ClientOption[];
  items: QuotableItem[];
  templates: TemplateRow[];
  preselectedClientId: string | null;
  defaults: { validityDays: number; taxProfile: TaxProfile; stampDutyNote: boolean };
  brand: { companyName: string; logoUrl: string | null };
  canWrite: boolean;
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const defaultTemplate = templates.find((template) => template.isDefault) ?? templates[0];
  const [step, setStepState] = useState<Step>(preselectedClientId ? 2 : 1);
  // +1 forward, -1 back: the step card leaves towards where it goes and the next one comes from the other side.
  const [direction, setDirection] = useState<1 | -1>(1);
  const setStep = (next: Step) => {
    setDirection(next > step ? 1 : -1);
    setStepState(next);
  };
  const m = useCardMotion(2);
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();
  const stepVariants: Variants = {
    enter: (d: number) => ({ opacity: 0, x: d * 80, scale: 0.98 }),
    center: { opacity: 1, x: 0, scale: 1, transition: m.reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28, opacity: { duration: 0.3, ease: cardEase } } },
    leave: (d: number) => (m.reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: d * -80, scale: 0.98, transition: { duration: 0.22, ease: [0.55, 0, 0.75, 0.2] } }),
  };
  const stepMotion = {
    custom: direction,
    initial: m.reduced ? (false as const) : "enter",
    animate: "center",
    exit: "leave",
    variants: stepVariants,
  };
  const [clientId, setClientId] = useState<string | null>(preselectedClientId);
  const [templateId, setTemplateId] = useState<string | null>(defaultTemplate?.id ?? null);
  const [clientQuery, setClientQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [title, setTitle] = useState("");
  const [validity, setValidity] = useState(String(defaults.validityDays));
  const [intro, setIntro] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const client = clients.find((entry) => entry.id === clientId) ?? null;
  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    return q ? clients.filter((entry) => `${entry.name} ${entry.email ?? ""} ${entry.sector ?? ""}`.toLowerCase().includes(q)) : clients;
  }, [clients, clientQuery]);
  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return q ? items.filter((item) => `${item.name} ${item.description ?? ""}`.toLowerCase().includes(q)) : items;
  }, [items, itemQuery]);
  const estimate = useMemo(() => {
    const lines = selected.flatMap((id) => {
      const item = items.find((entry) => entry.id === id);
      return item ? [lineFromCatalog(item)] : [];
    });
    const document = initialDocument({ title: title || "Preventivo", clientName: client?.name ?? "", intro: "", lines, terms: null });
    return headlineTotal(computeTotals(document, { taxProfile: defaults.taxProfile, stampDutyNote: defaults.stampDutyNote }));
  }, [selected, items, title, client, defaults.taxProfile, defaults.stampDutyNote]);

  if (!canWrite) {
    return <EmptyState title="Creazione non disponibile" body="Il tuo ruolo permette solo la consultazione dei preventivi." />;
  }

  const validityDays = Number.parseInt(validity, 10);
  const validityOk = Number.isInteger(validityDays) && validityDays >= 1 && validityDays <= 365;
  const canCreate = Boolean(client) && title.trim().length >= 2 && validityOk;

  function create() {
    if (!client) return;
    run(
      () =>
        createQuoteAction({
          clientId: client.id,
          templateId,
          title: title.trim(),
          validityDays,
          catalogItemIds: selected,
          intro,
        }),
      (value) => router.push(`/app/quotes/${value.id}`),
    );
  }

  return (
    <div className="wizard-stage">
    <motion.div
      key={visit}
      className={cn("wizard", leaving && "is-leaving", moving && "is-moving")}
      variants={m.grid}
      initial="hidden"
      animate={leaving ? "exit" : "show"}
      onAnimationComplete={settle}
    >
      <motion.header className="wizard-head" variants={m.item} custom={FROM_TOP}>
        <Link href="/app/quotes" className="btn btn-ghost back-link">
          <ArrowLeft size={16} aria-hidden="true" /> Preventivi
        </Link>
        <div>
          <h1>Nuovo preventivo</h1>
          <p className="muted">Tre passaggi brevi, poi componi tutto nell&apos;editor.</p>
        </div>
        <ol className="wizard-steps" aria-label="Passaggi">
          {([1, 2, 3] as Step[]).map((value) => (
            <li key={value} className={cn(step === value && "is-current", step > value && "is-done")} aria-current={step === value ? "step" : undefined}>
              <span>{step > value ? <Check size={12} aria-hidden="true" /> : value}</span>
              {stepLabels[value]}
            </li>
          ))}
        </ol>
      </motion.header>

      <motion.div className="wizard-body" variants={m.item} custom={FROM_BOTTOM}>
      <AnimatePresence mode="wait" initial={false} custom={direction}>

      {step === 1 ? (
        <motion.section key={1} className="card wizard-card" aria-labelledby="wizard-client" {...stepMotion}>
          <div className="wizard-card-head">
            <h2 id="wizard-client">Per chi è il preventivo?</h2>
            <p className="muted small">I dati del cliente arrivano dalla rubrica e restano modificabili nell&apos;editor.</p>
          </div>
          {clients.length === 0 ? (
            <EmptyState title="Rubrica vuota" body="Aggiungi prima un cliente nella rubrica, poi torna qui." />
          ) : (
            <>
              <div className="search-box">
                <Search size={16} aria-hidden="true" />
                <label htmlFor="wizard-client-search" className="visually-hidden">
                  Cerca cliente
                </label>
                <input
                  id="wizard-client-search"
                  type="search"
                  placeholder="Cerca per nome, email o settore"
                  value={clientQuery}
                  onChange={(event) => setClientQuery(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <ul className="choice-list" role="listbox" aria-label="Clienti">
                {filteredClients.slice(0, 60).map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={entry.id === clientId}
                      className={cn("choice-row", entry.id === clientId && "is-selected")}
                      onClick={() => setClientId(entry.id)}
                    >
                      <ClientAvatar name={entry.name} />
                      <span className="choice-text">
                        <strong>{entry.name}</strong>
                        <span className="muted small">
                          {entry.kind === "azienda" ? <Building2 size={12} aria-hidden="true" /> : <UserRound size={12} aria-hidden="true" />}{" "}
                          {entry.sector ?? (entry.kind === "azienda" ? "Azienda" : "Privato")}
                          {entry.email ? ` · ${entry.email}` : ""}
                        </span>
                      </span>
                      {entry.status === "prospect" ? <StatusBadge tone="info">Prospect</StatusBadge> : null}
                      {entry.id === clientId ? <Check size={18} aria-hidden="true" className="choice-check" /> : null}
                    </button>
                  </li>
                ))}
                {filteredClients.length === 0 ? <li className="muted small">Nessun cliente trovato.</li> : null}
              </ul>
            </>
          )}
          <div className="wizard-actions">
            <Link className="btn btn-secondary" href="/app/clients">
              Gestisci rubrica
            </Link>
            <Button onClick={() => setStep(2)} disabled={!client}>
              Continua <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </motion.section>
      ) : null}

      {step === 2 ? (
        <motion.section key={2} className="card wizard-card" aria-labelledby="wizard-template" {...stepMotion}>
          <div className="wizard-card-head">
            <h2 id="wizard-template">Scegli lo stile</h2>
            <p className="muted small">Puoi cambiarlo in qualsiasi momento dall&apos;editor. Il predefinito è già selezionato.</p>
          </div>
          <ul className="wizard-templates" role="radiogroup" aria-label="Template">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={template.id === templateId}
                  className={cn("wizard-template", template.id === templateId && "is-selected")}
                  onClick={() => setTemplateId(template.id)}
                >
                  <TemplateCover templateKey={template.key} brandName={brand.companyName} logoUrl={brand.logoUrl} />
                  <span className="wizard-template-name">
                    <strong>{template.name}</strong>
                    {template.isDefault ? <StatusBadge tone="info">Predefinito</StatusBadge> : null}
                  </span>
                  <span className="muted small">{templateInfo[template.key].description}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={16} aria-hidden="true" /> Indietro
            </Button>
            <span className="flex-spacer" />
            <Button
              variant="secondary"
              onClick={() => {
                setTemplateId(defaultTemplate?.id ?? null);
                setStep(3);
              }}
            >
              Usa il predefinito
            </Button>
            <Button onClick={() => setStep(3)} disabled={!templateId}>
              Continua <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </motion.section>
      ) : null}

      {step === 3 ? (
        <motion.section key={3} className="card wizard-card" aria-labelledby="wizard-content" {...stepMotion}>
          <div className="wizard-card-head">
            <h2 id="wizard-content">Titolo e prime voci</h2>
            <p className="muted small">
              Per {client?.name}. Le voci vengono copiate dal catalogo: se poi cambi il catalogo, questo preventivo resta com&apos;è.
            </p>
          </div>
          <FormError message={error} />
          <div className="wizard-grid">
            <div className="stack-tight">
              <TextField
                label="Titolo del preventivo"
                placeholder="Per esempio: Redesign sito web"
                value={title}
                maxLength={140}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
                required
              />
              <TextField
                label="Validità in giorni"
                hint="Dalle impostazioni del workspace. Calcola la data di scadenza."
                inputMode="numeric"
                value={validity}
                onChange={(event) => setValidity(event.target.value.replace(/\D/g, "").slice(0, 3))}
                error={validity && !validityOk ? "Indica un valore tra 1 e 365." : undefined}
              />
              <TextAreaField
                label="Introduzione (facoltativa)"
                hint="Due righe sul contesto. La rifinisci nell'editor."
                value={intro}
                maxLength={2000}
                onChange={(event) => setIntro(event.target.value)}
              />
            </div>
            <div className="wizard-items">
              <div className="wizard-items-head">
                <strong>Voci dal catalogo</strong>
                <span className="muted small">{selected.length} selezionate</span>
              </div>
              {items.length === 0 ? (
                <p className="muted small">
                  Il catalogo è vuoto. Puoi aggiungere voci libere nell&apos;editor oppure <Link href="/app/catalog">creare il catalogo</Link>.
                </p>
              ) : (
                <>
                  <div className="search-box">
                    <Search size={16} aria-hidden="true" />
                    <label htmlFor="wizard-item-search" className="visually-hidden">
                      Cerca nel catalogo
                    </label>
                    <input
                      id="wizard-item-search"
                      type="search"
                      placeholder="Cerca nel catalogo"
                      value={itemQuery}
                      onChange={(event) => setItemQuery(event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <ul className="pick-list" aria-label="Voci del catalogo">
                    {filteredItems.slice(0, 80).map((item) => {
                      const checked = selected.includes(item.id);
                      return (
                        <li key={item.id}>
                          <label className={cn("pick-row", checked && "is-selected")}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelected((current) => (checked ? current.filter((id) => id !== item.id) : [...current, item.id]))
                              }
                            />
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
                </>
              )}
              <p className="wizard-estimate">
                <span className="muted small">Totale stimato</span>
                <strong>{estimate}</strong>
              </p>
            </div>
          </div>
          <div className="wizard-actions">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft size={16} aria-hidden="true" /> Indietro
            </Button>
            <span className="flex-spacer" />
            <Button onClick={create} loading={pending} disabled={!canCreate}>
              Crea e apri l&apos;editor <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </motion.section>
      ) : null}
      </AnimatePresence>
      </motion.div>
    </motion.div>
    </div>
  );
}

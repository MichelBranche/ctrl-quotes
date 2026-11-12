"use client";

import Link from "next/link";
import { Check, Heart, Info, LayoutTemplate, Monitor } from "lucide-react";
import { TemplateCover, templateMeta } from "@/components/templates/template-cover";
import { useHref } from "@/components/data/controls";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/status";
import { setDefaultTemplateAction, toggleFavoriteAction } from "@/server/actions/settings";
import type { TemplateRow } from "@/server/templates";
import { cn } from "@/lib/cn";

export function TemplatesView({
  templates,
  view,
  selectedKey,
  brand,
  permissions,
}: {
  templates: TemplateRow[];
  view: "all" | "favorites";
  selectedKey: string | null;
  brand: { companyName: string; logoUrl: string | null };
  permissions: { favorite: boolean; setDefault: boolean };
}) {
  const href = useHref();
  const { pending, run } = useAction();
  const visible = view === "favorites" ? templates.filter((template) => template.isFavorite) : templates;
  const selected =
    templates.find((template) => template.key === selectedKey) ?? templates.find((template) => template.isDefault) ?? templates[0];

  return (
    <div className="templates-page">
      <div>
        <PageHeader title="Libreria template" subtitle="Scegli lo stile predefinito dei tuoi preventivi e segna i preferiti." />
        <nav className="filter-tabs inline" aria-label="Filtra template">
          <Link href={href({ view: null })} aria-current={view === "all" ? "page" : undefined} scroll={false} replace>
            Tutti <span className="count">{templates.length}</span>
          </Link>
          <Link href={href({ view: "favorites" })} aria-current={view === "favorites" ? "page" : undefined} scroll={false} replace>
            <Heart size={14} aria-hidden="true" /> Preferiti <span className="count">{templates.filter((template) => template.isFavorite).length}</span>
          </Link>
        </nav>
        {visible.length === 0 ? (
          <EmptyState title="Nessun preferito" body="Tocca il cuore su un template per ritrovarlo qui." />
        ) : (
          <ul className="template-grid">
            {visible.map((template) => (
              <li key={template.id} className={cn("card template-card", selected?.id === template.id && "is-selected")}>
                <Link href={href({ t: template.key })} scroll={false} className="template-link">
                  <span className="visually-hidden">Dettagli del template {template.name}</span>
                  <span aria-hidden="true">
                    <TemplateCover templateKey={template.key} name={template.name} brandName={brand.companyName} logoUrl={brand.logoUrl} />
                  </span>
                </Link>
                <button
                  type="button"
                  className={cn("fav-btn", template.isFavorite && "is-on")}
                  aria-pressed={template.isFavorite}
                  aria-label={template.isFavorite ? `Togli ${template.name} dai preferiti` : `Aggiungi ${template.name} ai preferiti`}
                  disabled={!permissions.favorite || pending}
                  onClick={() => run(() => toggleFavoriteAction(template.id))}
                >
                  <Heart size={16} aria-hidden="true" />
                </button>
                <div className="template-foot">
                  <span className="swatches" aria-hidden="true">
                    {templateMeta[template.key].swatches.map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                  <strong>{template.name}</strong>
                  {template.isDefault ? (
                    <StatusBadge tone="info">Predefinito</StatusBadge>
                  ) : (
                    <Button
                      variant="secondary"
                      className="btn-sm"
                      disabled={!permissions.setDefault || pending}
                      title={permissions.setDefault ? undefined : "Solo amministratori e proprietario scelgono il predefinito."}
                      onClick={() => run(() => setDefaultTemplateAction(template.id))}
                    >
                      <span>
                        Usa <span className="visually-hidden">{template.name} </span>come predefinito
                      </span>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <aside className="card template-detail" aria-label={`Template ${selected.name}`}>
          <header className="detail-header">
            <span className="type-icon">
              <LayoutTemplate size={18} aria-hidden="true" />
            </span>
            <div className="detail-title">
              <h2>{selected.name}</h2>
            </div>
            {selected.isDefault ? <StatusBadge tone="info">Predefinito</StatusBadge> : null}
          </header>
          <p className="muted">{selected.description}</p>
          <TemplateCover templateKey={selected.key} name={selected.name} brandName={brand.companyName} logoUrl={brand.logoUrl} large />
          <ul className="feature-list">
            {templateMeta[selected.key].features.map((feature) => (
              <li key={feature}>
                <Check size={16} aria-hidden="true" /> {feature}
              </li>
            ))}
            <li>
              <Monitor size={16} aria-hidden="true" /> Responsive su desktop, tablet e mobile
            </li>
          </ul>
          <p className="info-note">
            <Info size={16} aria-hidden="true" />
            <span>
              Il template usa logo, colori e font del Brand Kit. Anteprima completa su più pagine e personalizzazione arrivano con l&apos;editor dei
              preventivi.
            </span>
          </p>
          {selected.isDefault ? (
            <p className="muted small">I nuovi preventivi useranno questo template.</p>
          ) : (
            <Button
              disabled={!permissions.setDefault || pending}
              loading={pending}
              onClick={() => run(() => setDefaultTemplateAction(selected.id))}
            >
              Usa {selected.name} come predefinito
            </Button>
          )}
          {!permissions.setDefault ? <p className="field-hint">Solo amministratori e proprietario scelgono il template predefinito.</p> : null}
        </aside>
      ) : null}
    </div>
  );
}

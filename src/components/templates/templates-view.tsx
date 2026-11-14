"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { FROM_BOTTOM, FROM_LEFT, FROM_RIGHT, FROM_TOP, useCardMotion } from "@/components/motion/card-motion";
import { useMoving, useSectionTransition } from "@/components/motion/section-transition";
import { Check, Heart, Info, LayoutTemplate, Monitor } from "lucide-react";
import { TemplateCover } from "@/components/templates/template-cover";
import { templateInfo } from "@/domain/templates";
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

  // Build up / tear down: title fades, tabs from the left, cards alternately from the left and from below, detail from the right; out in reverse.
  const m = useCardMotion(visible.length + 2);
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();

  return (
    <motion.div
      key={visit}
      className={cn("templates-page", leaving && "is-leaving", moving && "is-moving")}
      variants={m.grid}
      initial="hidden"
      animate={leaving ? "exit" : "show"}
      onAnimationComplete={settle}
    >
      <div>
        <motion.div {...m.head(leaving)}>
          <PageHeader title="Libreria template" subtitle="Scegli lo stile predefinito dei tuoi preventivi e segna i preferiti." />
        </motion.div>
        <motion.nav className="filter-tabs inline" aria-label="Filtra template" variants={m.item} custom={FROM_TOP}>
          <Link href={href({ view: null })} aria-current={view === "all" ? "page" : undefined} scroll={false} replace>
            Tutti <span className="count">{templates.length}</span>
          </Link>
          <Link href={href({ view: "favorites" })} aria-current={view === "favorites" ? "page" : undefined} scroll={false} replace>
            <Heart size={14} aria-hidden="true" /> Preferiti <span className="count">{templates.filter((template) => template.isFavorite).length}</span>
          </Link>
        </motion.nav>
        {visible.length === 0 ? (
          <EmptyState title="Nessun preferito" body="Tocca il cuore su un template per ritrovarlo qui." />
        ) : (
          <ul className="template-grid">
            {visible.map((template, index) => (
              <motion.li
                key={template.id}
                className={cn("card template-card", selected?.id === template.id && "is-selected")}
                variants={m.item}
                custom={index % 2 === 0 ? FROM_LEFT : FROM_BOTTOM}
                whileHover={m.lift}
              >
                <Link href={href({ t: template.key })} scroll={false} className="template-link">
                  <span className="visually-hidden">Dettagli del template {template.name}</span>
                  <span aria-hidden="true">
                    <TemplateCover templateKey={template.key} brandName={brand.companyName} logoUrl={brand.logoUrl} />
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
                    {templateInfo[template.key].swatches.map((color) => (
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
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <motion.aside className="card template-detail" aria-label={`Template ${selected.name}`} variants={m.item} custom={FROM_RIGHT}>
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
          <div className="template-pages">
            {[0, 1, 2].map((page) => (
              <TemplateCover key={`${selected.key}-${page}`} templateKey={selected.key} brandName={brand.companyName} logoUrl={brand.logoUrl} page={page} large />
            ))}
          </div>
          <ul className="feature-list">
            {templateInfo[selected.key].features.map((feature) => (
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
              Le miniature usano il tuo nome e il tuo logo con contenuti di esempio. Nell&apos;editor scegli la foto di copertina e il colore
              d&apos;accento di ogni preventivo.
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
        </motion.aside>
      ) : null}
    </motion.div>
  );
}

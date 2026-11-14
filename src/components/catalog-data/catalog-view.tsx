"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FROM_BOTTOM, FROM_LEFT, FROM_RIGHT, FROM_TOP, cardEase as ease, useCardMotion } from "@/components/motion/card-motion";
import { ArrowLeft, ArrowRight, Boxes, ChevronDown, LayoutGrid, Package, Plus, Settings2, Sparkles, Tags, X } from "lucide-react";
import { useMoving, useSectionTransition } from "@/components/motion/section-transition";
import { CatalogEmptyWaves } from "@/components/catalog-data/catalog-empty-waves";
import { CatalogDetailPanel } from "@/components/catalog-data/catalog-detail";
import { CatalogItemDialog } from "@/components/catalog-data/item-form";
import { CategoriesDialog } from "@/components/catalog-data/categories-dialog";
import { Pagination, SearchBox, useHref } from "@/components/data/controls";
import { Button } from "@/components/ui/button";
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

/* Hero from above, bar from the left, table from below, detail from the right; out in reverse. */
const dirs = { hero: FROM_TOP, bar: FROM_LEFT, list: FROM_BOTTOM, detail: FROM_RIGHT };

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

  const m = useCardMotion();
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();
  const tabs = [
    { value: "all", label: "Tutti", count: list.counts.all, icon: <LayoutGrid size={16} aria-hidden="true" /> },
    { value: "servizio", label: "Servizi", count: list.counts.servizio, icon: <TypeIcon type="servizio" size={16} /> },
    { value: "prodotto", label: "Prodotti", count: list.counts.prodotto, icon: <TypeIcon type="prodotto" size={16} /> },
    { value: "pacchetto", label: "Pacchetti", count: list.counts.pacchetto, icon: <TypeIcon type="pacchetto" size={16} /> },
  ];
  const detailKey = detail ? detail.id : detailMissing ? "missing" : "empty";

  return (
    <div className={cn("ct-page two-pane-page", selectedId && "has-selection")}>
      <motion.header
        className="ct-head"
        {...m.head(leaving)}
      >
        <h1>Catalogo</h1>
        <p>Servizi, prodotti e pacchetti riutilizzabili nei tuoi preventivi.</p>
      </motion.header>

      {/* Keyed on the visit: builds up on every arrival (also back/forward); filters and selection only change the URL query, no rebuild. */}
      <motion.div
        key={visit}
        className={cn("ct-grid", leaving && "is-leaving", moving && "is-moving")}
        variants={m.grid}
        initial="hidden"
        animate={leaving ? "exit" : "show"}
        onAnimationComplete={settle}
      >
        <motion.section className="ct-hero" variants={m.item} custom={dirs.hero} aria-labelledby="ct-hero-title">
          <picture className="ct-hero-art" aria-hidden="true">
            <source type="image/avif" srcSet="/catalog/hero-viola-blocchi-1100.avif 1100w, /catalog/hero-viola-blocchi-2000.avif 2000w" sizes="(min-width: 1024px) 60vw, 100vw" />
            <source type="image/webp" srcSet="/catalog/hero-viola-blocchi-1100.webp 1100w, /catalog/hero-viola-blocchi-2000.webp 2000w" sizes="(min-width: 1024px) 60vw, 100vw" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/catalog/hero-viola-blocchi-1100.webp" alt="" decoding="async" />
          </picture>
          <div className="ct-hero-copy">
            <h2 id="ct-hero-title">Organizza la tua offerta</h2>
            <p>Gestisci servizi, prodotti e pacchetti in modo semplice e veloce.</p>
            <motion.span className="ct-btn-wrap" whileHover={m.reduced || !permissions.write ? undefined : { y: -2 }} whileTap={m.reduced ? undefined : { scale: 0.97 }}>
              <button
                type="button"
                className="ct-btn"
                onClick={() => setCreating(true)}
                disabled={!permissions.write}
                title={permissions.write ? undefined : "Il tuo ruolo permette solo la consultazione."}
              >
                Nuovo elemento <ArrowRight size={18} aria-hidden="true" className="ct-btn-arrow" />
              </button>
            </motion.span>
          </div>
        </motion.section>

        <motion.div className="ct-bar" variants={m.item} custom={dirs.bar}>
          <CatalogTabs current={type} options={tabs} reduced={m.reduced} />
          <div className="ct-bar-end">
            <div className="ct-select">
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
              <ChevronDown size={16} aria-hidden="true" className="ct-select-chevron" />
            </div>
            <button
              type="button"
              className="ct-icon-btn"
              onClick={() => setManaging(true)}
              disabled={!permissions.categories}
              aria-label="Gestisci categorie"
              title={permissions.categories ? "Gestisci categorie" : "Solo amministratori e proprietario gestiscono le categorie."}
            >
              <Tags size={17} aria-hidden="true" />
            </button>
            <SearchBox label="Cerca nel catalogo" placeholder="Cerca nel catalogo..." />
          </div>
        </motion.div>

        <motion.section className="ct-list list-pane" variants={m.item} custom={dirs.list} aria-label="Elementi del catalogo">
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
                {list.items.map((item) => {
                  const current = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <Link
                        href={href({ id: current ? null : item.id })}
                        className="catalog-row"
                        aria-current={current ? "true" : undefined}
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
                          <span className={cn("badge ct-chip", `badge-type-${item.type}`)}>
                            <TypeIcon type={item.type} size={13} />
                            {item.categoryName ?? catalogTypeLabel[item.type]}
                          </span>
                        </span>
                        <span className="catalog-price">
                          {formatPrice(item.unitPriceCents, item.billing)}
                          {item.priceMode === "gross" ? <span className="muted small block">IVA inclusa</span> : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} noun="elementi" />
        </motion.section>

        <motion.section className={cn("ct-detail detail-pane", detail && "has-detail")} variants={m.item} custom={dirs.detail} aria-label="Dettaglio elemento">
          {selectedId ? (
            <Link href={href({ id: null })} className="btn btn-ghost back-link" scroll={false}>
              <ArrowLeft size={16} aria-hidden="true" /> Torna al catalogo
            </Link>
          ) : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={detailKey}
              className="ct-detail-body"
              initial={m.reduced ? false : { opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={m.reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.99, transition: { duration: 0.18 } }}
              transition={{ duration: m.reduced ? 0 : 0.32, ease }}
            >
              {detail ? (
                <>
                  <Link href={href({ id: null })} className="ct-close" scroll={false} aria-label="Chiudi il dettaglio">
                    <X size={16} aria-hidden="true" />
                  </Link>
                  <CatalogDetailPanel
                    key={detail.id}
                    item={detail}
                    taxProfile={taxProfile}
                    permissions={permissions}
                    categories={categories}
                    componentOptions={componentOptions}
                    defaults={defaults}
                  />
                </>
              ) : (
                <div className="ct-empty">
                  <CatalogEmptyWaves />
                  <div className="ct-empty-copy">
                    <h2>{detailMissing ? "Elemento non disponibile" : hasAny ? "Seleziona un elemento" : "Nessun elemento"}</h2>
                    <p>
                      {detailMissing
                        ? "L'elemento non esiste o è stato eliminato."
                        : hasAny
                          ? "Apri un elemento per vedere prezzo, IVA, ricorrenza e composizione."
                          : "Le voci del catalogo vengono copiate nei preventivi: modificarle dopo non cambia i preventivi già creati."}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          {!permissions.write ? (
            <p className="field-hint ct-role">
              <Settings2 size={14} aria-hidden="true" /> Il tuo ruolo permette solo la consultazione.
            </p>
          ) : null}
        </motion.section>
      </motion.div>

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

/** Type tabs (same links and URL params as FilterTabs) with a pill indicator that slides to the current tab. */
function CatalogTabs({
  current,
  options,
  reduced,
}: {
  current: string;
  options: Array<{ value: string; label: string; count: number; icon: ReactNode }>;
  reduced: boolean;
}) {
  const href = useHref();
  return (
    <nav className="filter-tabs ct-tabs" aria-label="Filtra per tipo">
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            href={href({ type: option.value === "all" ? null : option.value, page: null, id: null })}
            aria-current={active ? "page" : undefined}
            scroll={false}
            replace
          >
            {active ? (
              <motion.span
                layoutId="ct-tab-pill"
                className="ct-tab-pill"
                aria-hidden="true"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            {option.icon}
            {option.label}
            <span className="count">{option.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

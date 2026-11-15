"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Banknote, Check, ChevronLeft, FileText, Hash, Layers, Lock, Palette, Percent, Users } from "lucide-react";
import { SectionLink, useMoving, useSectionTransition } from "@/components/motion/section-transition";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Status } from "@/components/ui/async-status";

/*
 * Shared frame of every Impostazioni sub-page: breadcrumb back to Impostazioni, title + subtitle, a coloured hero
 * card matching the tile of the home (same tone, icon and artwork) holding the save action, then the content.
 * Hero and content build up from different directions and tear down in reverse before navigating
 * (section-transition.tsx). Only presentation lives here: forms keep their own state, fields and actions.
 */

export type SettingsSection = "profile" | "brand" | "fiscal" | "numbering" | "terms" | "team" | "payments";

type Dir = { x: number; y: number };
const FROM_TOP: Dir = { x: 0, y: -140 };
const FROM_BOTTOM: Dir = { x: 0, y: 150 };
const FROM_LEFT: Dir = { x: -160, y: 0 };
const FROM_RIGHT: Dir = { x: 160, y: 0 };

type Art = "lastre" | "sfere" | "archi" | "blocchi";
const sections: Record<SettingsSection, { tone: "grey" | "brand" | "lime" | "violet" | "dark"; icon: ReactNode; art: Art; tagline: string; hero: Dir; body: Dir }> = {
  profile: { tone: "grey", icon: <Layers size={24} />, art: "lastre", tagline: "L'identità del workspace, come la vede il tuo team.", hero: FROM_LEFT, body: FROM_BOTTOM },
  brand: { tone: "brand", icon: <Palette size={24} />, art: "sfere", tagline: "Il tuo stile su ogni preventivo: logo, colori, carattere.", hero: FROM_TOP, body: FROM_RIGHT },
  fiscal: { tone: "grey", icon: <Percent size={24} />, art: "lastre", tagline: "Regime, IVA e prezzi proposti di default.", hero: FROM_RIGHT, body: FROM_BOTTOM },
  numbering: { tone: "violet", icon: <Hash size={24} />, art: "sfere", tagline: "Un codice chiaro e progressivo per ogni preventivo.", hero: FROM_LEFT, body: FROM_RIGHT },
  terms: { tone: "dark", icon: <FileText size={24} />, art: "blocchi", tagline: "Il testo che chiude ogni proposta, pronto in partenza.", hero: FROM_BOTTOM, body: FROM_LEFT },
  team: { tone: "lime", icon: <Users size={24} />, art: "archi", tagline: "Chi lavora con te e cosa può fare.", hero: FROM_RIGHT, body: FROM_LEFT },
  payments: { tone: "violet", icon: <Banknote size={24} />, art: "sfere", tagline: "Come il cliente ti paga il preventivo: bonifico, PayPal o carta.", hero: FROM_LEFT, body: FROM_BOTTOM },
};

const artSrc: Record<Art, string> = {
  lastre: "/plans/starter-lastre-800",
  sfere: "/plans/pro-sfere-800",
  archi: "/plans/business-archi-800",
  blocchi: "/settings/hero-blocchi-lime-1100",
};

const ease = [0.16, 1, 0.3, 1] as const;
const spring = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

export function useSettingsMotion() {
  const reduced = useReducedMotion() ?? false;
  const { leaving } = useSectionTransition();
  const grid: Variants = reduced
    ? { hidden: {}, show: {}, exit: {} }
    : { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } }, exit: { transition: { staggerChildren: 0.06, staggerDirection: -1 } } };
  const item: Variants = reduced
    ? { hidden: { opacity: 1, x: 0, y: 0, scale: 1 }, show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: 0 } }, exit: { opacity: 1 } }
    : {
        hidden: (d: Dir = FROM_BOTTOM) => ({ opacity: 0, x: d.x, y: d.y, scale: 0.97 }),
        show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { ...spring, opacity: { duration: 0.35, ease } } },
        exit: (d: Dir = FROM_BOTTOM) => ({ opacity: 0, x: d.x, y: d.y, scale: 0.97, transition: { duration: 0.34, ease: [0.55, 0, 0.75, 0.2] } }),
      };
  return { reduced, leaving, grid, item };
}

export function SettingsFrame({
  section,
  title,
  subtitle,
  canEdit = true,
  dirty = false,
  pending = false,
  saved = false,
  error = null,
  actions,
  plain = false,
  children,
}: {
  section: SettingsSection;
  title: string;
  subtitle: string;
  canEdit?: boolean;
  dirty?: boolean;
  pending?: boolean;
  saved?: boolean;
  error?: string | null;
  /** Replaces the default save area (status + "Salva modifiche"). */
  actions?: ReactNode;
  /** The content brings its own cards (Brand Kit, Team, Profilo): no outer card around it. */
  plain?: boolean;
  children: ReactNode;
}) {
  const meta = sections[section];
  const m = useSettingsMotion();
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();
  return (
    <div className="ss-page">
      <motion.header
        className="ss-head"
        initial={m.reduced ? false : { opacity: 0, y: -16 }}
        animate={leaving && !m.reduced ? { opacity: 0, y: -16 } : { opacity: 1, y: 0 }}
        transition={{ duration: leaving ? 0.3 : 0.5, ease }}
      >
        <nav aria-label="Percorso" className="ss-crumbs">
          <SectionLink href="/app/settings" className="ss-back">
            <ChevronLeft size={16} aria-hidden="true" className="ss-back-icon" /> Impostazioni
          </SectionLink>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </nav>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </motion.header>
      <motion.div key={visit} className={cn("ss-grid", leaving && "is-leaving", moving && "is-moving")} variants={m.grid} initial="hidden" animate={leaving ? "exit" : "show"} onAnimationComplete={settle}>
        <motion.section className={cn("ss-hero", `is-${meta.tone}`, `is-${section}`)} variants={m.item} custom={meta.hero} aria-label={title}>
          <picture className={cn("ss-hero-art", `is-${meta.art}`)} aria-hidden="true">
            <source type="image/avif" srcSet={`${artSrc[meta.art]}.avif`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${artSrc[meta.art]}.webp`} alt="" decoding="async" />
          </picture>
          <span className="ss-hero-icon" aria-hidden="true">
            {meta.icon}
          </span>
          <p className="ss-hero-line">{meta.tagline}</p>
          <div className="ss-hero-actions">
            {actions ??
              (canEdit ? (
                <div className="save-area">
                  <span className="save-status" aria-live="polite">
                    {pending ? <Status status="running" label="Salvataggio…" /> : dirty ? "Modifiche non salvate" : saved ? <Status status="done" label="Modifiche salvate" /> : null}
                  </span>
                  <Button type="submit" loading={pending} disabled={!dirty}>
                    <Check size={16} aria-hidden="true" /> Salva modifiche
                  </Button>
                </div>
              ) : (
                <p className="readonly-note">
                  <Lock size={14} aria-hidden="true" /> Solo proprietario e amministratori possono modificare.
                </p>
              ))}
          </div>
        </motion.section>
        <motion.div className={cn("ss-body", plain ? "is-plain" : "ss-card")} variants={m.item} custom={meta.body}>
          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
}

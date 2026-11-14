"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight, Building2, CreditCard, FileText, Hash, Layers, Palette, Percent, Plus, Users } from "lucide-react";
import { SectionLink, useMoving, useSectionTransition } from "@/components/motion/section-transition";
import { cn } from "@/lib/cn";
import { messages } from "@/i18n/it";
import { LegalLinks } from "@/components/legal/legal-links";

/*
 * Impostazioni home: header, dark hero and five cards linking to the real settings pages. Cards build up from
 * different directions and tear down before navigating (same system as Abbonamento, see section-transition.tsx).
 */

type Dir = { x: number; y: number };
const FROM_TOP: Dir = { x: 0, y: -140 };
const FROM_BOTTOM: Dir = { x: 0, y: 150 };
const FROM_LEFT: Dir = { x: -160, y: 0 };
const FROM_RIGHT: Dir = { x: 160, y: 0 };

/** Hero from above; row 1 left, below, right; row 2: Team left, the two micro cards top and bottom, Fatturazione right. */
const dirs = { hero: FROM_TOP, profile: FROM_LEFT, brand: FROM_BOTTOM, fiscal: FROM_RIGHT, team: FROM_LEFT, workspace: FROM_LEFT, numbering: FROM_TOP, terms: FROM_BOTTOM, billing: FROM_RIGHT } as const;

const ease = [0.16, 1, 0.3, 1] as const;
const spring = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

function useHomeMotion() {
  const reduced = useReducedMotion() ?? false;
  const { leaving } = useSectionTransition();
  const grid: Variants = reduced
    ? { hidden: {}, show: {}, exit: {} }
    : { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } }, exit: { transition: { staggerChildren: 0.05, staggerDirection: -1 } } };
  const item: Variants = reduced
    ? { hidden: { opacity: 1, x: 0, y: 0, scale: 1 }, show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: 0 } }, exit: { opacity: 1 } }
    : {
        hidden: (d: Dir = FROM_BOTTOM) => ({ opacity: 0, x: d.x, y: d.y, scale: 0.96 }),
        show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { ...spring, opacity: { duration: 0.35, ease } } },
        exit: (d: Dir = FROM_BOTTOM) => ({ opacity: 0, x: d.x, y: d.y, scale: 0.96, transition: { duration: 0.34, ease: [0.55, 0, 0.75, 0.2] } }),
      };
  const lift = reduced || leaving ? undefined : { y: -4, transition: { duration: 0.25, ease } };
  const press = reduced ? undefined : { scale: 0.97 };
  return { reduced, leaving, grid, item, lift, press };
}

/** Rendered inside the SectionTransitionProvider of app/app/settings/layout.tsx. */
export function SettingsHome() {
  const m = useHomeMotion();
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();
  return (
    <div className="st-page">
      <motion.header
        className="st-head"
        initial={m.reduced ? false : { opacity: 0, y: -16 }}
        animate={leaving && !m.reduced ? { opacity: 0, y: -16 } : { opacity: 1, y: 0 }}
        transition={{ duration: leaving ? 0.3 : 0.5, ease }}
      >
        <h1>{messages.settings.title}</h1>
        <p>{messages.settings.subtitle}</p>
      </motion.header>
      <motion.div key={visit} className={cn("st-grid", leaving && "is-leaving", moving && "is-moving")} variants={m.grid} initial="hidden" animate={leaving ? "exit" : "show"} onAnimationComplete={settle}>
        <Hero />
        <Card href="/app/settings/profile" dir={dirs.profile} tone="grey" icon={<Layers size={26} />} title="Profilo workspace" body="Nome, descrizione e preferenze generali." art="lastre" className="st-profile" />
        <Card href="/app/settings/brand" dir={dirs.brand} tone="brand" icon={<Palette size={26} />} title="Brand Kit" body="Logo, colori e identità visiva nei tuoi preventivi." art="sfere" className="st-brand" />
        <Card href="/app/settings/fiscal" dir={dirs.fiscal} tone="grey" icon={<Percent size={26} />} title="Fiscale e IVA" body="Dati fiscali, aliquote e impostazioni di fatturazione." art="lastre" className="st-fiscal" />
        <Card href="/app/settings/team" dir={dirs.team} tone="lime" icon={<Users size={26} />} title="Team e ruoli" body="Gestisci i membri del team, i permessi e i ruoli." art="archi" className="st-team">
          <Avatars />
        </Card>
        {/* Settings without a tile in the mockup: two micro cards stacked between Team and Fatturazione. */}
        <div className="st-micro">
          <Row href="/app/workspace" dir={dirs.workspace} icon={<Building2 size={20} />} title={messages.settings.manageWorkspaces} className="st-workspaces" />
          <Row href="/app/settings/numbering" dir={dirs.numbering} icon={<Hash size={20} />} title="Numerazione" className="st-numbering" />
          <Row href="/app/settings/terms" dir={dirs.terms} icon={<FileText size={20} />} title="Condizioni e note" className="st-terms" />
        </div>
        <Card href="/app/settings/billing" dir={dirs.billing} tone="violet" icon={<CreditCard size={26} />} title="Fatturazione" body="Piano, metodi di pagamento e storico fatture." className="st-billing">
          <Bars />
        </Card>
      </motion.div>
      <LegalLinks className="st-legal" />
    </div>
  );
}

function Picture({ base, widths, sizes, className }: { base: string; widths: number[]; sizes: string; className: string }) {
  const set = (ext: string) => widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(", ");
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={set("webp")} sizes={sizes} />
      <img src={`${base}-${widths[0]}.webp`} alt="" decoding="async" />
    </picture>
  );
}

function Hero() {
  const m = useHomeMotion();
  return (
    <motion.section className="st-card st-hero" variants={m.item} custom={dirs.hero}>
      <Picture base="/settings/hero-blocchi-lime" widths={[1100, 2000]} sizes="(min-width: 1024px) 75vw, 100vw" className="st-art st-hero-art" />
      <div className="st-hero-copy">
        <h2>Personalizza la tua esperienza di lavoro</h2>
        <p>Configura CTRL® Quotes in base alle esigenze del tuo team.</p>
        <motion.span className="st-btn-wrap" whileHover={m.lift ? { y: -2 } : undefined} whileTap={m.press}>
          <SectionLink href="/app/settings/profile" className="st-btn">
            Profilo workspace <ArrowRight size={18} aria-hidden="true" className="st-btn-arrow" />
          </SectionLink>
        </motion.span>
      </div>
    </motion.section>
  );
}

const artBase = { lastre: "/plans/starter-lastre", sfere: "/plans/pro-sfere", archi: "/plans/business-archi" } as const;

function Card({
  href,
  dir,
  tone,
  icon,
  title,
  body,
  art,
  className,
  children,
}: {
  href: string;
  dir: Dir;
  tone: "grey" | "brand" | "lime" | "violet";
  icon: ReactNode;
  title: string;
  body: string;
  art?: keyof typeof artBase;
  className: string;
  children?: ReactNode;
}) {
  const m = useHomeMotion();
  return (
    <motion.div className={cn("st-card st-tile", `is-${tone}`, className)} variants={m.item} custom={dir} whileHover={m.lift} whileTap={m.press ? { scale: 0.985 } : undefined}>
      {art ? <Picture base={artBase[art]} widths={[800]} sizes="40vw" className={cn("st-art", `st-art-${art}`)} /> : null}
      <SectionLink href={href} className="st-tile-link">
        <span className="st-tile-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="st-tile-title">{title}</span>
        <span className="st-tile-body">{body}</span>
        <span className="st-circle" aria-hidden="true">
          <ArrowRight size={18} />
        </span>
      </SectionLink>
      {children}
    </motion.div>
  );
}

/** Micro card (settings without a tile in the mockup): icon, title, circle arrow. */
function Row({ href, dir, icon, title, className }: { href: string; dir: Dir; icon: ReactNode; title: string; className: string }) {
  const m = useHomeMotion();
  return (
    <motion.div className={cn("st-card st-row", className)} variants={m.item} custom={dir} whileHover={m.lift} whileTap={m.press ? { scale: 0.985 } : undefined}>
      <SectionLink href={href} className="st-row-link">
        <span className="st-row-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="st-row-title">{title}</span>
        <span className="st-circle" aria-hidden="true">
          <ArrowRight size={18} />
        </span>
      </SectionLink>
    </motion.div>
  );
}

/** Decorative stock faces (docs/roadmap-impostazioni.md: source and licence), not real members. */
function Avatars() {
  return (
    <div className="st-avatars" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={n} className="st-avatar" src={`/settings/avatar-${n}.webp`} alt="" width={60} height={60} decoding="async" />
      ))}
      <span className="st-avatar st-avatar-plus">
        <Plus size={20} />
      </span>
    </div>
  );
}

/** Three violet 3D bars growing from the bottom one after the other ("tap tap tap"), after the card has landed. */
function Bars() {
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="st-bars" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`st-bar-wrap st-bar-${i + 1}`}>
          <motion.span
            className="st-bar"
            initial={reduced ? false : { scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 15, delay: 0.75 + i * 0.18, opacity: { duration: 0.12, delay: 0.75 + i * 0.18 } }}
          />
        </span>
      ))}
    </div>
  );
}
